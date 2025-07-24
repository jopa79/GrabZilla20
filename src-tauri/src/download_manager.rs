use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::process::Command as AsyncCommand;
use tokio::sync::mpsc;
use crate::ffmpeg_controller::{FFmpegController, ConversionFormat, ConversionRequest, ConversionProgress};
use crate::security_manager::SecurityManager;
// use crate::dependency_manager::DependencyManager; // Unused import

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub title: String,
    pub duration: Option<String>,
    pub uploader: Option<String>,
    pub description: Option<String>,
    pub thumbnail: Option<String>,
    pub view_count: Option<u64>,
    pub upload_date: Option<String>,
    pub formats: Vec<VideoFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFormat {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub filesize: Option<u64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub abr: Option<f32>,
    pub vbr: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DownloadStatus {
    #[serde(rename = "queued")]
    Queued,
    #[serde(rename = "downloading")]
    Downloading,
    #[serde(rename = "converting")]
    Converting,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "paused")]
    Paused,
    #[serde(rename = "cancelled")]
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub status: DownloadStatus,
    pub progress: f32,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub id: String,
    pub url: String,
    pub quality: String,
    pub format: String,
    pub output_dir: PathBuf,
    pub convert_format: Option<ConversionFormat>,
    pub keep_original: bool,
}

pub struct DownloadManager {
    active_downloads: Arc<Mutex<HashMap<String, DownloadHandle>>>,
    download_queue: Arc<Mutex<VecDeque<DownloadRequest>>>,
    ytdlp_path: Option<PathBuf>,
    ffmpeg_controller: Option<FFmpegController>,
    progress_tx: Option<mpsc::UnboundedSender<DownloadProgress>>,
    max_concurrent_downloads: usize,
    processing_queue: Arc<Mutex<bool>>,
    security_manager: SecurityManager,
}

struct DownloadHandle {
    #[allow(dead_code)]
    task: tokio::task::JoinHandle<Result<()>>,
    cancel_tx: mpsc::UnboundedSender<()>,
}

impl DownloadManager {
    pub fn new() -> Result<Self> {
        Ok(DownloadManager {
            active_downloads: Arc::new(Mutex::new(HashMap::new())),
            download_queue: Arc::new(Mutex::new(VecDeque::new())),
            ytdlp_path: None,
            ffmpeg_controller: None,
            progress_tx: None,
            max_concurrent_downloads: 5, // Default to 5 concurrent downloads
            processing_queue: Arc::new(Mutex::new(false)),
            security_manager: SecurityManager::new()?,
        })
    }

    pub async fn initialize(&mut self) -> Result<()> {
        self.ensure_ytdlp().await?;
        
        // Initialize FFmpeg controller
        let mut ffmpeg = FFmpegController::new()?;
        ffmpeg.initialize().await?;
        self.ffmpeg_controller = Some(ffmpeg);
        
        Ok(())
    }

    async fn ensure_ytdlp(&mut self) -> Result<()> {
        // First, try to get yt-dlp path from the global static (set in commands.rs)
        if let Some(dependency_manager) = crate::commands::get_dependency_manager_if_initialized() {
            let dep_manager = dependency_manager.lock().await;
            let bundled_path = dep_manager.get_yt_dlp_path();
            
            // Check if bundled version exists and works
            if bundled_path.exists() {
                if let Ok(output) = Command::new(&bundled_path)
                    .arg("--version")
                    .output()
                {
                    if output.status.success() {
                        self.ytdlp_path = Some(bundled_path);
                        println!("Using bundled yt-dlp at: {}", self.ytdlp_path.as_ref().unwrap().display());
                        return Ok(());
                    }
                }
            }
        }

        // Fall back to system-installed yt-dlp
        let possible_paths = vec![
            "/opt/homebrew/bin/yt-dlp",  // Homebrew on Apple Silicon
            "/usr/local/bin/yt-dlp",     // Homebrew on Intel Mac
            "/usr/bin/yt-dlp",           // System installation
            "yt-dlp",                    // In PATH
        ];

        for path in possible_paths {
            if let Ok(output) = Command::new(path)
                .arg("--version")
                .output()
            {
                if output.status.success() {
                    self.ytdlp_path = Some(PathBuf::from(path));
                    println!("Found system yt-dlp at: {}", path);
                    return Ok(());
                }
            }
        }

        Err(anyhow!("yt-dlp not found. Please install yt-dlp using the Dependencies tab."))
    }

    pub async fn get_video_metadata(&self, url: &str) -> Result<VideoMetadata> {
        let ytdlp_path = self.ytdlp_path.as_ref()
            .ok_or_else(|| anyhow!("yt-dlp not initialized"))?;

        // Detect if this is a playlist URL
        let is_playlist = url.contains("list=") || url.contains("playlist") || url.contains("/channel/") || url.contains("/c/");

        let mut cmd = AsyncCommand::new(ytdlp_path);
        cmd.arg("--dump-json")
           .arg("--user-agent")
           .arg("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
           .arg("--extractor-retries")
           .arg("3")
           .arg("--sleep-interval")
           .arg("1")
           .arg("--max-sleep-interval")
           .arg("5");
        
        if is_playlist {
            // For playlists, get playlist info instead of individual videos
            cmd.arg("--flat-playlist");
        } else {
            // For individual videos, don't process playlists
            cmd.arg("--no-playlist");
        }
        
        cmd.arg(url)
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        let output = cmd.output().await?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("Failed to get video metadata: {}", error));
        }

        let json_str = String::from_utf8(output.stdout)?;
        
        // For playlists, yt-dlp might output multiple JSON lines
        // We need to handle this properly
        let json_value: serde_json::Value = if is_playlist {
            // Try to parse as a single JSON object first (playlist info)
            match serde_json::from_str(&json_str) {
                Ok(value) => value,
                Err(_) => {
                    // If that fails, try to get the first line (which should be playlist info)
                    let first_line = json_str.lines().next().unwrap_or("{}");
                    serde_json::from_str(first_line)?
                }
            }
        } else {
            serde_json::from_str(&json_str)?
        };

        // Parse the JSON into our VideoMetadata struct
        let metadata = VideoMetadata {
            title: json_value["title"].as_str().unwrap_or("Unknown").to_string(),
            duration: if is_playlist {
                // For playlists, show entry count if available
                json_value["playlist_count"].as_u64()
                    .map(|count| format!("{} videos", count))
                    .or_else(|| json_value["duration"].as_u64().map(|d| format_duration(d)))
            } else {
                json_value["duration"].as_u64().map(|d| format_duration(d))
            },
            uploader: json_value["uploader"].as_str()
                .or_else(|| json_value["channel"].as_str())
                .map(String::from),
            description: json_value["description"].as_str().map(String::from),
            thumbnail: json_value["thumbnail"].as_str()
                .or_else(|| {
                    // For playlists, try to get thumbnail from entries
                    json_value["entries"].as_array()
                        .and_then(|entries| entries.first())
                        .and_then(|first_entry| first_entry["thumbnail"].as_str())
                })
                .map(String::from),
            view_count: json_value["view_count"].as_u64(),
            upload_date: json_value["upload_date"].as_str().map(String::from),
            formats: parse_formats(&json_value["formats"]),
        };

        Ok(metadata)
    }

    pub async fn extract_playlist_videos(&self, playlist_url: &str) -> Result<Vec<String>> {
        println!("=== EXTRACT_PLAYLIST_VIDEOS CALLED ===");
        println!("Playlist URL: {}", playlist_url);
        
        let ytdlp_path = self.ytdlp_path.as_ref()
            .ok_or_else(|| anyhow!("yt-dlp not initialized"))?;

        // Use --flat-playlist and --get-url to get individual video URLs directly
        // Also add user-agent to reduce bot detection
        let output = AsyncCommand::new(ytdlp_path)
            .arg("--flat-playlist")
            .arg("--get-url")
            .arg("--user-agent")
            .arg("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .arg("--extractor-retries")
            .arg("3")
            .arg("--sleep-interval")
            .arg("1")
            .arg("--max-sleep-interval")
            .arg("5")
            .arg(playlist_url)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("yt-dlp error: {}", error);
            return Err(anyhow!("Failed to extract playlist videos: {}", error));
        }

        let output_str = String::from_utf8(output.stdout)?;
        println!("Raw yt-dlp output: {}", output_str);
        
        let video_urls: Vec<String> = output_str
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter(|line| line.starts_with("http")) // Only keep actual URLs
            .map(|line| line.trim().to_string())
            .collect();

        println!("Extracted {} video URLs: {:?}", video_urls.len(), video_urls);
        Ok(video_urls)
    }

    // Lightweight metadata fetch for when the main method fails due to bot detection
    pub async fn get_basic_video_info(&self, url: &str) -> Result<VideoMetadata> {
        // First try to get video title by scraping the page directly
        let scraped_metadata = self.scrape_video_metadata(url).await;
        
        // Try yt-dlp lightweight approach as backup
        let ytdlp_path = self.ytdlp_path.as_ref()
            .ok_or_else(|| anyhow!("yt-dlp not initialized"))?;

        let output = AsyncCommand::new(ytdlp_path)
            .arg("--no-playlist")
            .arg("--print")
            .arg("%(title)s|%(duration)s|%(uploader)s")
            .arg("--user-agent")
            .arg("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .arg("--quiet")
            .arg("--no-warnings")
            .arg(url)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await;

        let video_id = self.extract_video_id(url);
        
        // If yt-dlp works, use it for duration but prefer scraped title
        if let Ok(output) = output {
            if output.status.success() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                let parts: Vec<&str> = output_str.trim().split('|').collect();
                
                let ytdlp_title = parts.get(0).unwrap_or(&"").to_string();
                let duration = parts.get(1)
                    .and_then(|d| d.parse::<u64>().ok())
                    .map(|seconds| format_duration(seconds))
                    .unwrap_or_else(|| "0:00".to_string());
                let uploader = parts.get(2).unwrap_or(&"YouTube").to_string();
                
                // Use scraped title if available and not generic, otherwise use yt-dlp title
                let final_title = if let Some(ref scraped) = scraped_metadata {
                    if scraped.title.len() > 20 && !scraped.title.contains("YouTube") {
                        scraped.title.clone()
                    } else {
                        ytdlp_title
                    }
                } else {
                    ytdlp_title
                };
                
                                 return Ok(VideoMetadata {
                     title: if final_title.is_empty() || final_title == "Unknown" {
                         format!("YouTube Video{}", video_id.as_ref().map(|id| format!(" ({})", id)).unwrap_or_default())
                     } else {
                         final_title
                     },
                     duration: Some(duration),
                     uploader: Some(uploader),
                     description: Some("Basic metadata only".to_string()),
                     thumbnail: video_id.map(|id| format!("https://img.youtube.com/vi/{}/hqdefault.jpg", id)),
                     view_count: None,
                     upload_date: None,
                     formats: vec![],
                 });
            }
        }
        
        // If yt-dlp failed, use scraped metadata if available
        if let Some(scraped) = scraped_metadata {
            return Ok(scraped);
        }
        
                 // Final fallback - return basic info with video ID
         Ok(VideoMetadata {
             title: format!("YouTube Video{}", video_id.as_ref().map(|id| format!(" ({})", id)).unwrap_or_default()),
             duration: Some("0:00".to_string()),
             uploader: Some("YouTube".to_string()),
             description: Some("Duration unavailable due to platform restrictions".to_string()),
             thumbnail: video_id.map(|id| format!("https://img.youtube.com/vi/{}/hqdefault.jpg", id)),
             view_count: None,
             upload_date: None,
             formats: vec![],
         })
    }

    async fn scrape_video_metadata(&self, url: &str) -> Option<VideoMetadata> {
        // Create a simple HTTP client to fetch the page
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .ok()?;
        
        let response = client.get(url).send().await.ok()?;
        let html = response.text().await.ok()?;
        
        // Extract title from HTML
        let title = if let Some(start) = html.find("<title>") {
            if let Some(end) = html[start + 7..].find("</title>") {
                let raw_title = &html[start + 7..start + 7 + end];
                // Clean up the title (YouTube adds " - YouTube" at the end)
                raw_title.replace(" - YouTube", "").trim().to_string()
            } else {
                return None;
            }
        } else {
            return None;
        };
        
        let video_id = self.extract_video_id(url);
        
        Some(VideoMetadata {
            title,
            duration: Some("0:00".to_string()), // Duration not available from scraping
            uploader: Some("YouTube".to_string()),
            description: Some("Title extracted from page".to_string()),
            thumbnail: video_id.map(|id| format!("https://img.youtube.com/vi/{}/hqdefault.jpg", id)),
            view_count: None,
            upload_date: None,
            formats: vec![],
        })
    }

    fn extract_video_id(&self, url: &str) -> Option<String> {
        if url.contains("v=") {
            url.split("v=").nth(1)
                .and_then(|s| s.split("&").next())
                .filter(|s| s.len() == 11)
                .map(|s| s.to_string())
        } else if url.contains("youtu.be/") {
            url.split("youtu.be/").nth(1)
                .and_then(|s| s.split("?").next())
                .filter(|s| s.len() == 11)
                .map(|s| s.to_string())
        } else {
            None
        }
    }

    pub fn set_max_concurrent_downloads(&mut self, max: usize) {
        self.max_concurrent_downloads = max.clamp(1, 10);
    }

    pub async fn queue_download(&mut self, request: DownloadRequest) -> Result<()> {
        // Add to queue
        self.download_queue.lock().await.push_back(request.clone());
        
        // Update status to queued
        if let Some(ref tx) = self.progress_tx {
            let _ = tx.send(DownloadProgress {
                id: request.id,
                status: DownloadStatus::Queued,
                progress: 0.0,
                speed: None,
                eta: None,
                downloaded_bytes: None,
                total_bytes: None,
                error: None,
                file_path: None,
            });
        }
        
        // Process queue if not already processing
        if !*self.processing_queue.lock().await {
            self.process_download_queue().await?;
        }
        
        Ok(())
    }

    async fn process_download_queue(&mut self) -> Result<()> {
        if *self.processing_queue.lock().await {
            return Ok(());
        }
        
        *self.processing_queue.lock().await = true;
        
        // Clone what we need for the background task
        let queue = self.download_queue.clone();
        let active_downloads = self.active_downloads.clone();
        let max_concurrent = self.max_concurrent_downloads;
        let ytdlp_path = self.ytdlp_path.clone();
        let ffmpeg_controller = self.ffmpeg_controller.clone();
        let progress_tx = self.progress_tx.clone();
        let security_manager = self.security_manager.clone();
        let processing_flag = self.processing_queue.clone();
        
        // Spawn a task to process the queue
        tokio::spawn(async move {
            println!("=== DOWNLOAD MANAGER: Starting queue processor with max {} concurrent downloads ===", max_concurrent);
            
            loop {
                // Clean up completed downloads first
                {
                    let mut active = active_downloads.lock().await;
                    let mut to_remove = Vec::new();
                    
                    for (id, handle) in active.iter() {
                        if handle.task.is_finished() {
                            to_remove.push(id.clone());
                        }
                    }
                    
                    for id in to_remove {
                        println!("=== DOWNLOAD MANAGER: Cleaning up completed download: {} ===", id);
                        active.remove(&id);
                    }
                }
                
                // Check how many downloads are currently active
                let active_count = active_downloads.lock().await.len();
                
                // Check if we have any downloads in queue
                let queue_size = queue.lock().await.len();
                
                println!("=== DOWNLOAD MANAGER: Active downloads: {}, Queue size: {}, Max concurrent: {} ===", active_count, queue_size, max_concurrent);
                
                if queue_size == 0 {
                    if active_count == 0 {
                        println!("=== DOWNLOAD MANAGER: No more downloads to process, stopping queue processor ===");
                        break;
                    } else {
                        // Wait for active downloads to complete
                        println!("=== DOWNLOAD MANAGER: Queue empty but {} downloads still active, waiting... ===", active_count);
                        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                        continue;
                    }
                }
                
                if active_count >= max_concurrent {
                    // Wait before checking again
                    println!("=== DOWNLOAD MANAGER: Max concurrent downloads reached, waiting... ===");
                    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                    continue;
                }
                
                // Try to get the next download from queue
                let next_request = {
                    let mut q = queue.lock().await;
                    q.pop_front()
                };
                
                if let Some(request) = next_request {
                    println!("=== DOWNLOAD MANAGER: Starting download for {} ===", request.url);
                    
                    // Start the download
                    let download_id = request.id.clone();
                    let download_id_for_handle = download_id.clone(); // Clone for later use
                    let ytdlp_path_inner = ytdlp_path.clone();
                    let ffmpeg_controller_inner = ffmpeg_controller.clone();
                    let progress_tx_inner = progress_tx.clone();
                    let security_manager_inner = security_manager.clone();
                    
                    // Create cancellation channel
                    let (cancel_tx, mut cancel_rx) = tokio::sync::mpsc::unbounded_channel::<()>();
                    
                    let download_task = tokio::spawn(async move {
                        // Validate network access
                        if !security_manager_inner.validate_network_access(&request.url) {
                            if let Some(ref tx) = progress_tx_inner {
                                let _ = tx.send(DownloadProgress {
                                    id: download_id.clone(),
                                    status: DownloadStatus::Failed,
                                    error: Some(format!("Network access to '{}' is not allowed", request.url)),
                                    ..Default::default()
                                });
                            }
                            return Err(anyhow::anyhow!("Network access not allowed"));
                        }
                        
                        let ytdlp_path = ytdlp_path_inner
                            .ok_or_else(|| anyhow::anyhow!("yt-dlp not initialized"))?;
                        
                        // Update status to Downloading
                        if let Some(ref tx) = progress_tx_inner {
                            let _ = tx.send(DownloadProgress {
                                id: download_id.clone(),
                                status: DownloadStatus::Downloading,
                                progress: 0.0,
                                speed: None,
                                eta: None,
                                downloaded_bytes: None,
                                total_bytes: None,
                                error: None,
                                file_path: None,
                            });
                        }
                        
                        println!("=== DOWNLOAD MANAGER: Starting actual download ===");
                        println!("URL: {}", request.url);
                        println!("Output Dir: {}", request.output_dir.display());
                        println!("Quality: {}", request.quality);
                        
                        // Construct yt-dlp command with quality suffix in filename
                        let quality_suffix = get_quality_suffix(&request.quality);
                        let filename_template = format!("%(title)s{}.%(ext)s", quality_suffix);
                        let quality_selector = format_quality_selector(&request.quality);
                        
                        println!("=== DOWNLOAD MANAGER: Quality processing ===");
                        println!("=== Raw quality from frontend: '{}' ===", request.quality);
                        println!("=== Quality suffix for filename: '{}' ===", quality_suffix);
                        println!("=== Quality selector for yt-dlp: '{}' ===", quality_selector);
                        
                        let mut cmd = tokio::process::Command::new(&ytdlp_path);
                        cmd.arg("--progress")
                           .arg("--newline")
                           .arg("-f")
                           .arg(&quality_selector)
                           .arg("-o")
                           .arg(request.output_dir.join(&filename_template))
                           .arg(&request.url);
                           
                        // Set up stdio
                        cmd.stdout(std::process::Stdio::piped())
                           .stderr(std::process::Stdio::piped());
                           
                        println!("=== DOWNLOAD MANAGER: Executing command: {:?} ===", cmd);
                        
                        let mut child = cmd.spawn()?;
                        
                        // Monitor download progress
                        if let Some(stdout) = child.stdout.take() {
                            let tx = progress_tx_inner.clone();
                            let id = download_id.clone();
                            
                            tokio::spawn(async move {
                                use tokio::io::{AsyncBufReadExt, BufReader};
                                let reader = BufReader::new(stdout);
                                let mut lines = reader.lines();
                                
                                while let Ok(Some(line)) = lines.next_line().await {
                                    println!("=== DOWNLOAD MANAGER: yt-dlp output: {} ===", line);
                                    
                                    // Parse yt-dlp progress line
                                    if let Some((progress, speed, eta, downloaded_bytes, total_bytes)) = parse_ytdlp_progress(line.as_str()) {
                                        if let Some(ref tx) = tx {
                                            let _ = tx.send(DownloadProgress {
                                                id: id.clone(),
                                                status: DownloadStatus::Downloading,
                                                progress,
                                                speed,
                                                eta,
                                                downloaded_bytes,
                                                total_bytes,
                                                error: None,
                                                file_path: None,
                                            });
                                        }
                                    }
                                }
                            });
                        }
                        
                        // Wait for download to complete or cancellation
                        tokio::select! {
                            result = child.wait() => {
                                match result {
                                    Ok(status) => {
                                        if status.success() {
                                            println!("=== DOWNLOAD MANAGER: Download completed successfully ===");
                                            
                                            // If conversion is needed
                                            if let Some(convert_format) = request.convert_format {
                                                if let Some(ffmpeg) = ffmpeg_controller_inner {
                                                    println!("=== DOWNLOAD MANAGER: Starting conversion ===");
                                                    
                                                    // Update status to Converting
                                                    if let Some(ref tx) = progress_tx_inner {
                                                        let _ = tx.send(DownloadProgress {
                                                            id: download_id.clone(),
                                                            status: DownloadStatus::Converting,
                                                            progress: 0.0,
                                                            speed: None,
                                                            eta: None,
                                                            downloaded_bytes: None,
                                                            total_bytes: None,
                                                            error: None,
                                                            file_path: None,
                                                        });
                                                    }

                                                    // Find the downloaded file
                                                    match find_downloaded_file(&request.output_dir).await {
                                                        Ok(downloaded_file) => {
                                                                                                        let conversion_request = ConversionRequest {
                                                id: download_id.clone(),
                                                input_file: downloaded_file.clone(),
                                                output_file: downloaded_file.with_extension(ffmpeg.get_output_extension(&convert_format)),
                                                format: convert_format,
                                                progress_tx: None, // Progress adapter can't be accessed from here
                                            };
                                                            
                                                            if let Err(e) = ffmpeg.convert_video(conversion_request).await {
                                                                if let Some(ref tx) = progress_tx_inner {
                                                                    let _ = tx.send(DownloadProgress {
                                                                        id: download_id.clone(),
                                                                        status: DownloadStatus::Failed,
                                                                        error: Some(format!("Conversion failed: {}", e)),
                                                                        ..Default::default()
                                                                    });
                                                                }
                                                                return Err(e);
                                                            }
                                                        }
                                                        Err(e) => {
                                                            if let Some(ref tx) = progress_tx_inner {
                                                                let _ = tx.send(DownloadProgress {
                                                                    id: download_id.clone(),
                                                                    status: DownloadStatus::Failed,
                                                                    error: Some(format!("Could not find downloaded file: {}", e)),
                                                                    ..Default::default()
                                                                });
                                                            }
                                                            return Err(e);
                                                        }
                                                    }
                                                }
                                            }

                                            // Find the downloaded file and update status to Completed
                                            let downloaded_file_path = find_downloaded_file(&request.output_dir).await
                                                .map(|path| path.to_string_lossy().to_string())
                                                .ok();
                                            
                                            if let Some(ref tx) = progress_tx_inner {
                                                let _ = tx.send(DownloadProgress {
                                                    id: download_id.clone(),
                                                    status: DownloadStatus::Completed,
                                                    progress: 100.0,
                                                    file_path: downloaded_file_path.clone(),
                                                    ..Default::default()
                                                });
                                            }
                                            
                                            Ok(())
                                        } else {
                                            let error_msg = "Download process failed".to_string();
                                            println!("=== DOWNLOAD MANAGER: Download failed: {} ===", error_msg);
                                            
                                            if let Some(ref tx) = progress_tx_inner {
                                                let _ = tx.send(DownloadProgress {
                                                    id: download_id.clone(),
                                                    status: DownloadStatus::Failed,
                                                    error: Some(error_msg.clone()),
                                                    ..Default::default()
                                                });
                                            }
                                            
                                            Err(anyhow::anyhow!("{}", error_msg))
                                        }
                                    }
                                    Err(e) => {
                                        let error_msg = format!("Failed to wait for download process: {}", e);
                                        println!("=== DOWNLOAD MANAGER: Error: {} ===", error_msg);
                                        
                                        if let Some(ref tx) = progress_tx_inner {
                                            let _ = tx.send(DownloadProgress {
                                                id: download_id.clone(),
                                                status: DownloadStatus::Failed,
                                                error: Some(error_msg.clone()),
                                                ..Default::default()
                                            });
                                        }
                                        
                                        Err(anyhow::anyhow!("{}", error_msg))
                                    }
                                }
                            }
                            _ = cancel_rx.recv() => {
                                println!("=== DOWNLOAD MANAGER: Download cancelled ===");
                                let _ = child.kill().await;
                                
                                if let Some(ref tx) = progress_tx_inner {
                                    let _ = tx.send(DownloadProgress {
                                        id: download_id.clone(),
                                        status: DownloadStatus::Cancelled,
                                        ..Default::default()
                                    });
                                }
                                
                                Err(anyhow::anyhow!("Download cancelled"))
                            }
                        }
                    });
                    
                    // Store the download handle
                    let download_handle = DownloadHandle {
                        task: download_task,
                        cancel_tx,
                    };
                    
                     active_downloads.lock().await.insert(download_id_for_handle.clone(), download_handle);
                     
                     // Clean up completed downloads
                     let mut active = active_downloads.lock().await;
                    let mut to_remove = Vec::new();
                    
                    for (id, handle) in active.iter() {
                        if handle.task.is_finished() {
                            to_remove.push(id.clone());
                        }
                    }
                    
                    for id in to_remove {
                        active.remove(&id);
                    }
                    
                                         println!("=== DOWNLOAD MANAGER: Started download {}, active downloads: {} ===", download_id_for_handle, active.len());
                    
                } else {
                    // No downloads available right now, wait a bit before checking again
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }
            
            // Reset the processing flag when done
            *processing_flag.lock().await = false;
            println!("=== DOWNLOAD MANAGER: Queue processing finished ===");
        });
        
        Ok(())
    }

    pub async fn pause_download(&self, _id: &str) -> Result<()> {
        // TODO: Implement pausing
        // This might involve sending a signal to the download task
        // or using a more sophisticated download library
        unimplemented!("Pausing is not yet supported");
    }

    pub async fn resume_download(&self, _id: &str) -> Result<()> {
        // TODO: Implement resuming
        unimplemented!("Resuming is not yet supported");
    }

    pub async fn cancel_download(&self, id: &str) -> Result<()> {
        if let Some(handle) = self.active_downloads.lock().await.remove(id) {
            handle.cancel_tx.send(())?;
        }
        Ok(())
    }

    pub async fn get_active_downloads(&self) -> Vec<String> {
        self.active_downloads.lock().await.keys().cloned().collect()
    }

    fn create_progress_adapter(&self, download_id: String) -> Option<mpsc::UnboundedSender<ConversionProgress>> {
        if let Some(tx) = &self.progress_tx {
            let progress_tx = tx.clone();
            
            let (conversion_tx, mut conversion_rx) = mpsc::unbounded_channel::<ConversionProgress>();
            
            tokio::spawn(async move {
                while let Some(conv_progress) = conversion_rx.recv().await {
                    let dl_progress = DownloadProgress {
                        id: download_id.clone(),
                        status: DownloadStatus::Converting,
                        progress: conv_progress.progress,
                        speed: conv_progress.speed,
                        eta: conv_progress.eta,
                        downloaded_bytes: None,
                        total_bytes: None,
                        error: conv_progress.error,
                        file_path: None,
                    };
                    let _ = progress_tx.send(dl_progress);
                }
            });
            
            Some(conversion_tx)
        } else {
            None
        }
    }

    pub fn set_progress_callback(&mut self, tx: mpsc::UnboundedSender<DownloadProgress>) {
        self.progress_tx = Some(tx);
    }

    pub fn get_ffmpeg_controller(&self) -> Option<&FFmpegController> {
        self.ffmpeg_controller.as_ref()
    }


}

impl Default for DownloadProgress {
    fn default() -> Self {
        DownloadProgress {
            id: String::new(),
            status: DownloadStatus::Queued,
            progress: 0.0,
            speed: None,
            eta: None,
            downloaded_bytes: None,
            total_bytes: None,
            error: None,
            file_path: None,
        }
    }
}

fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;

    if hours > 0 {
        format!("{}:{:02}:{:02}", hours, minutes, secs)
    } else {
        format!("{}:{:02}", minutes, secs)
    }
}

fn parse_formats(formats_json: &serde_json::Value) -> Vec<VideoFormat> {
    let mut formats = Vec::new();
    
    if let Some(formats_array) = formats_json.as_array() {
        for format_json in formats_array {
            if let Some(format_id) = format_json["format_id"].as_str() {
                formats.push(VideoFormat {
                    format_id: format_id.to_string(),
                    ext: format_json["ext"].as_str().unwrap_or("unknown").to_string(),
                    resolution: format_json["resolution"].as_str().map(String::from),
                    filesize: format_json["filesize"].as_u64(),
                    vcodec: format_json["vcodec"].as_str().map(String::from),
                    acodec: format_json["acodec"].as_str().map(String::from),
                    abr: format_json["abr"].as_f64().map(|x| x as f32),
                    vbr: format_json["vbr"].as_f64().map(|x| x as f32),
                });
            }
        }
    }
    
    formats
}

async fn find_downloaded_file(output_dir: &PathBuf) -> Result<PathBuf> {
    // Valid video file extensions
    let video_extensions = vec![
        "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "3gp", "ogv",
        "mp3", "m4a", "flac", "wav", "ogg", "aac", "opus", "wma"
    ];
    
    let mut read_dir = tokio::fs::read_dir(output_dir).await?;
    let mut entries = Vec::new();
    
    while let Some(entry) = read_dir.next_entry().await? {
        let path = entry.path();
        let file_name = path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        
        // Skip system files and non-video files
        if file_name.starts_with('.') || file_name == "Thumbs.db" {
            continue;
        }
        
        // Check if it's a video/audio file
        if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
            if video_extensions.contains(&extension.to_lowercase().as_str()) {
                entries.push(entry);
            }
        }
    }
    
    if entries.is_empty() {
        return Err(anyhow::anyhow!("No video files found in download directory"));
    }
    
    // Sort by creation time (most recent first)
    let mut entries_with_metadata = Vec::new();
    for entry in entries {
        let metadata = entry.metadata().await?;
        let created = metadata.created()?;
        entries_with_metadata.push((entry, created));
    }
    
    entries_with_metadata.sort_by_key(|(_, created)| *created);
    entries_with_metadata.reverse(); // Most recent first
    
    if let Some((entry, _)) = entries_with_metadata.first() {
        Ok(entry.path())
    } else {
        Err(anyhow::anyhow!("Could not find downloaded file"))
    }
}

// Helper function to get quality suffix for filenames
fn get_quality_suffix(quality: &str) -> String {
    let normalized_quality = quality.to_lowercase();
    
    // Handle common quality formats
    if normalized_quality.contains("2160") || normalized_quality.contains("4k") {
        return "_2160".to_string();
    }
    if normalized_quality.contains("1440") {
        return "_1440".to_string();
    }
    if normalized_quality.contains("1080") {
        return "_1080".to_string();
    }
    if normalized_quality.contains("720") {
        return "_720".to_string();
    }
    if normalized_quality.contains("480") {
        return "_480".to_string();
    }
    if normalized_quality.contains("360") {
        return "_360".to_string();
    }
    if normalized_quality.contains("240") {
        return "_240".to_string();
    }
    if normalized_quality.contains("144") {
        return "_144".to_string();
    }
    
    // Handle special cases
    if normalized_quality.contains("best") || normalized_quality.contains("highest") {
        return "_best".to_string();
    }
    if normalized_quality.contains("worst") || normalized_quality.contains("lowest") {
        return "_worst".to_string();
    }
    
    // Default case - use quality as-is but sanitized
    format!("_{}", quality.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase())
}

fn format_quality_selector(quality: &str) -> String {
    let normalized_quality = quality.to_lowercase();
    match normalized_quality.as_str() {
        "best" | "best available" => "best".to_string(),
        "worst" => "worst".to_string(),
        "720p" => "best[height<=720]".to_string(),
        "1080p" => "best[height<=1080]".to_string(),
        "1440p" => "best[height<=1440]".to_string(),
        "2160p" | "4k" => "best[height<=2160]".to_string(),
        "480p" => "best[height<=480]".to_string(),
        "360p" => "best[height<=360]".to_string(),
        "240p" => "best[height<=240]".to_string(),
        "144p" => "best[height<=144]".to_string(),
        _ => {
            // For any unrecognized quality, try to extract height if it's in format like "1080p", "720p", etc.
            if let Some(height_match) = normalized_quality.strip_suffix('p') {
                if let Ok(height) = height_match.parse::<u32>() {
                    return format!("best[height<={}]", height);
                }
            }
            // Fallback to original quality string
            quality.to_string()
        }
    }
}

/// Parse yt-dlp progress line to extract detailed progress information
/// Example line: "[download]  19.1% of   10.44MiB at   41.49MiB/s ETA 00:00"
fn parse_ytdlp_progress(line: &str) -> Option<(f32, Option<String>, Option<String>, Option<u64>, Option<u64>)> {
    if !line.contains("[download]") || !line.contains("%") {
        return None;
    }
    
    let mut progress = 0.0;
    let mut speed = None;
    let mut eta = None;
    let mut downloaded_bytes = None;
    let mut total_bytes = None;
    
    // Extract progress percentage
    if let Some(percent_start) = line.find(char::is_numeric) {
        if let Some(percent_end) = line[percent_start..].find('%') {
            if let Ok(prog) = line[percent_start..percent_start + percent_end].parse::<f32>() {
                progress = prog;
            }
        }
    }
    
    // Extract file size information (e.g., "of 10.44MiB" or "of ~ 250.8MiB")
    if let Some(of_pos) = line.find(" of ") {
        let after_of = &line[of_pos + 4..];
        if let Some(size_end) = after_of.find(" at ") {
            let size_str = after_of[..size_end].trim();
            // Remove "~" if present for estimated sizes
            let size_str = size_str.trim_start_matches("~ ");
            
            if let Some(size_bytes) = parse_size_string(size_str) {
                total_bytes = Some(size_bytes);
                // Calculate downloaded bytes from percentage
                if progress > 0.0 {
                    downloaded_bytes = Some((size_bytes as f32 * progress / 100.0) as u64);
                }
            }
        }
    }
    
    // Extract download speed (e.g., "at 41.49MiB/s")
    if let Some(at_pos) = line.find(" at ") {
        let after_at = &line[at_pos + 4..];
        if let Some(speed_end) = after_at.find(" ETA ") {
            let speed_str = after_at[..speed_end].trim();
            if speed_str != "Unknown B/s" && !speed_str.is_empty() {
                speed = Some(speed_str.to_string());
            }
        }
    }
    
    // Extract ETA (e.g., "ETA 00:01")
    if let Some(eta_pos) = line.find("ETA ") {
        let eta_str = &line[eta_pos + 4..].trim();
        if eta_str != &"Unknown" && !eta_str.is_empty() {
            eta = Some(eta_str.to_string());
        }
    }
    
    Some((progress, speed, eta, downloaded_bytes, total_bytes))
}

/// Parse size strings like "10.44MiB", "250.8MiB", "1.2GiB" into bytes
fn parse_size_string(size_str: &str) -> Option<u64> {
    let size_str = size_str.trim();
    
    // Find the unit (MiB, GiB, KiB, etc.)
    let (number_part, unit) = if size_str.ends_with("GiB") {
        (size_str.trim_end_matches("GiB"), "GiB")
    } else if size_str.ends_with("MiB") {
        (size_str.trim_end_matches("MiB"), "MiB") 
    } else if size_str.ends_with("KiB") {
        (size_str.trim_end_matches("KiB"), "KiB")
    } else if size_str.ends_with("B") {
        (size_str.trim_end_matches("B"), "B")
    } else {
        // Try decimal units as fallback
        if size_str.ends_with("GB") {
            (size_str.trim_end_matches("GB"), "GB")
        } else if size_str.ends_with("MB") {
            (size_str.trim_end_matches("MB"), "MB")
        } else if size_str.ends_with("KB") {
            (size_str.trim_end_matches("KB"), "KB")
        } else {
            return None;
        }
    };
    
    if let Ok(number) = number_part.parse::<f64>() {
        let bytes = match unit {
            "GiB" => (number * 1024.0 * 1024.0 * 1024.0) as u64,
            "MiB" => (number * 1024.0 * 1024.0) as u64,
            "KiB" => (number * 1024.0) as u64,
            "GB" => (number * 1000.0 * 1000.0 * 1000.0) as u64,
            "MB" => (number * 1000.0 * 1000.0) as u64,
            "KB" => (number * 1000.0) as u64,
            "B" => number as u64,
            _ => return None,
        };
        Some(bytes)
    } else {
        None
    }
}