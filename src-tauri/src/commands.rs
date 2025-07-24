use crate::url_parser::{URLExtractor, URLExtractionResult, Platform};
use crate::download_manager::{DownloadManager, DownloadRequest, VideoMetadata};
use crate::ffmpeg_controller::ConversionFormat;
use crate::security_manager::SecurityManager;
use crate::update_manager::{UpdateManager, UpdateChannel, UpdateInfo};
use crate::dependency_manager::{DependencyManager, DependencyStatus};
use anyhow::Result;
use std::sync::{OnceLock, Arc};
use tokio::sync::Mutex;
use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Emitter};

// Global instances
static URL_EXTRACTOR: OnceLock<URLExtractor> = OnceLock::new();
static DOWNLOAD_MANAGER: OnceLock<Arc<Mutex<DownloadManager>>> = OnceLock::new();
static SECURITY_MANAGER: OnceLock<SecurityManager> = OnceLock::new();
static UPDATE_MANAGER: OnceLock<Arc<Mutex<UpdateManager>>> = OnceLock::new();
static DEPENDENCY_MANAGER: OnceLock<Arc<Mutex<DependencyManager>>> = OnceLock::new();

fn get_url_extractor() -> &'static URLExtractor {
    URL_EXTRACTOR.get_or_init(|| {
        URLExtractor::new().expect("Failed to initialize URL extractor")
    })
}

fn get_download_manager() -> Arc<Mutex<DownloadManager>> {
    DOWNLOAD_MANAGER.get_or_init(|| {
        let manager = DownloadManager::new().expect("Failed to initialize download manager");
        Arc::new(Mutex::new(manager))
    }).clone()
}

fn get_security_manager() -> &'static SecurityManager {
    SECURITY_MANAGER.get_or_init(|| {
        SecurityManager::new().expect("Failed to initialize security manager")
    })
}

fn get_update_manager(app_handle: &AppHandle) -> Arc<Mutex<UpdateManager>> {
    UPDATE_MANAGER.get_or_init(|| {
        let manager = UpdateManager::new(app_handle.clone()).expect("Failed to initialize update manager");
        Arc::new(Mutex::new(manager))
    }).clone()
}

fn get_dependency_manager(app_handle: &AppHandle) -> Arc<Mutex<DependencyManager>> {
    DEPENDENCY_MANAGER.get_or_init(|| {
        let manager = DependencyManager::new(app_handle).expect("Failed to initialize dependency manager");
        Arc::new(Mutex::new(manager))
    }).clone()
}

pub fn get_dependency_manager_if_initialized() -> Option<Arc<Mutex<DependencyManager>>> {
    DEPENDENCY_MANAGER.get().cloned()
}

#[tauri::command]
pub async fn extract_urls_from_text(text: String) -> Result<URLExtractionResult, String> {
    let extractor = get_url_extractor();
    
    extractor.extract_urls(&text)
        .map_err(|e| format!("Failed to extract URLs: {}", e))
}

#[tauri::command]
pub async fn get_supported_platforms() -> Result<Vec<Platform>, String> {
    let extractor = get_url_extractor();
    Ok(extractor.get_supported_platforms())
}

#[tauri::command]
pub async fn validate_single_url(url: String) -> Result<bool, String> {
    // Basic URL validation
    match url::Url::parse(&url) {
        Ok(parsed_url) => {
            let is_valid = matches!(parsed_url.scheme(), "http" | "https") &&
                parsed_url.host().is_some() &&
                !parsed_url.host_str().unwrap_or("").is_empty();
            Ok(is_valid)
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command] 
pub async fn clean_url(url: String) -> Result<String, String> {
    use url::Url;
    
    let mut parsed_url = Url::parse(&url)
        .map_err(|e| format!("Invalid URL: {}", e))?;
    
    // Remove tracking parameters
    let tracking_params = [
        "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
        "fbclid", "gclid", "ref", "referrer", "source", "campaign",
    ];
    
    // Collect pairs to keep
    let pairs_to_keep: Vec<_> = parsed_url
        .query_pairs()
        .filter(|pair| !tracking_params.contains(&pair.0.as_ref()))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    
    // Clear and rebuild query
    parsed_url.set_query(None);
    if !pairs_to_keep.is_empty() {
        let query_string = pairs_to_keep
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("&");
        parsed_url.set_query(Some(&query_string));
    }

    Ok(parsed_url.to_string())
}

#[tauri::command]
pub async fn test_connection() -> Result<String, String> {
    println!("Test connection called successfully!");
    Ok("Backend connection working!".to_string())
}

#[tauri::command]
pub async fn get_video_metadata(url: String) -> Result<VideoMetadata, String> {
    println!("=== GET_VIDEO_METADATA CALLED ===");
    println!("URL: {}", url);
    
    let manager = get_download_manager();
    {
        let mut manager_guard = manager.lock().await;
        
        // Initialize download manager if needed
        println!("Initializing download manager...");
        if let Err(e) = manager_guard.initialize().await {
            let error_msg = format!("Failed to initialize download manager: {}", e);
            println!("Initialization error: {}", error_msg);
            return Err(error_msg);
        }
        println!("Download manager initialized successfully");
    }
    
    let manager_guard = manager.lock().await;
    println!("Calling get_video_metadata...");
    match manager_guard.get_video_metadata(&url).await {
        Ok(metadata) => {
            println!("Successfully got metadata: title={}", metadata.title);
            Ok(metadata)
        }
        Err(e) => {
            let error_msg = format!("Failed to get video metadata: {}", e);
            println!("Metadata error: {}", error_msg);
            Err(error_msg)
        }
    }
}

#[tauri::command]
pub async fn start_download(
    app_handle: tauri::AppHandle,
    id: String,
    url: String,
    quality: String,
    format: String,
    #[allow(non_snake_case)] outputDir: String,
    convert_format: Option<String>,
    keep_original: Option<bool>,
) -> Result<(), String> {
    let manager = get_download_manager();
    {
        let mut manager_guard = manager.lock().await;
        
        // Initialize download manager if needed
        if let Err(e) = manager_guard.initialize().await {
            return Err(format!("Failed to initialize download manager: {}", e));
        }
        
        // Set up progress callback to emit Tauri events
        let app_handle_clone = app_handle.clone();
        let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel();
        
        // Spawn a task to listen for progress updates and emit them as Tauri events
        tokio::spawn(async move {
            while let Some(progress) = progress_rx.recv().await {
                println!("=== BACKEND: Emitting progress event: {:?} ===", progress);
                if let Err(e) = app_handle_clone.emit("download-progress", &progress) {
                    eprintln!("Failed to emit progress event: {}", e);
                }
            }
        });
        
        // Set the progress callback in the download manager
        manager_guard.set_progress_callback(progress_tx);
    }
    
    // Parse conversion format
    let parsed_convert_format = convert_format.and_then(|f| match f.as_str() {
        "h264" => Some(ConversionFormat::H264HighProfile),
        "dnxhr" => Some(ConversionFormat::DNxHRSQ),
        "prores" => Some(ConversionFormat::ProResProxy),
        "mp3" => Some(ConversionFormat::MP3Audio),
        _ => None,
    });

    let request = DownloadRequest {
        id,
        url,
        quality,
        format,
        output_dir: PathBuf::from(outputDir),
        convert_format: parsed_convert_format,
        keep_original: keep_original.unwrap_or(true),
    };
    
    let mut manager_guard = manager.lock().await;
    manager_guard.queue_download(request)
        .await
        .map_err(|e| format!("Failed to queue download: {}", e))
}

#[tauri::command]
pub async fn set_max_concurrent_downloads(max: usize) -> Result<(), String> {
    let manager = get_download_manager();
    let mut manager_guard = manager.lock().await;
    
    manager_guard.set_max_concurrent_downloads(max);
    Ok(())
}

#[tauri::command]
pub async fn cancel_download(id: String) -> Result<(), String> {
    let manager = get_download_manager();
    let manager = manager.lock().await;
    
    manager.cancel_download(&id)
        .await
        .map_err(|e| format!("Failed to cancel download: {}", e))
}

#[tauri::command]
pub async fn get_default_download_dir() -> Result<String, String> {
    // Try to get the Desktop directory first (preferred)
    let base_dir = if let Some(desktop_dir) = dirs::desktop_dir() {
        desktop_dir
    } else if let Some(home_dir) = dirs::home_dir() {
        // Fallback: try common desktop paths
        #[cfg(target_os = "windows")]
        let desktop_path = home_dir.join("Desktop");
        #[cfg(target_os = "macos")]
        let desktop_path = home_dir.join("Desktop");
        #[cfg(target_os = "linux")]
        let desktop_path = home_dir.join("Desktop");
        
        if desktop_path.exists() {
            desktop_path
        } else {
            // Final fallback: use Downloads directory
            if let Some(downloads_dir) = dirs::download_dir() {
                downloads_dir
            } else {
                home_dir.join("Downloads")
            }
        }
    } else {
        return Err("Could not determine user directory".to_string());
    };
    
    let grabzilla_dir = base_dir.join("GrabZilla");
    
    // Create the GrabZilla directory if it doesn't exist
    if !grabzilla_dir.exists() {
        if let Err(e) = fs::create_dir_all(&grabzilla_dir) {
            return Err(format!("Failed to create GrabZilla directory at {}: {}", 
                grabzilla_dir.display(), e));
        }
        println!("Created GrabZilla directory at: {}", grabzilla_dir.display());
    } else {
        println!("Using existing GrabZilla directory at: {}", grabzilla_dir.display());
    }
    
    Ok(grabzilla_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn check_privilege_elevation() -> Result<bool, String> {
    let security_manager = get_security_manager();
    security_manager.is_running_elevated()
        .map_err(|e| format!("Failed to check privilege elevation: {}", e))
}

#[tauri::command]
pub async fn validate_file_path(path: String) -> Result<String, String> {
    let security_manager = get_security_manager();
    security_manager.sanitize_file_path(&path)
        .map_err(|e| format!("Invalid file path: {}", e))
}

#[tauri::command]
pub async fn expand_path(path: String) -> Result<String, String> {
    use std::path::PathBuf;
    
    let expanded = if path.starts_with("~/") {
        if let Some(home_dir) = dirs::home_dir() {
            let relative_path = &path[2..]; // Remove "~/"
            home_dir.join(relative_path)
        } else {
            return Err("Could not determine home directory".to_string());
        }
    } else if path.starts_with("~") && path.len() == 1 {
        if let Some(home_dir) = dirs::home_dir() {
            home_dir
        } else {
            return Err("Could not determine home directory".to_string());
        }
    } else {
        PathBuf::from(path)
    };
    
    Ok(expanded.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn validate_network_url(url: String) -> Result<bool, String> {
    let security_manager = get_security_manager();
    Ok(security_manager.validate_network_access(&url))
}

#[tauri::command]
pub async fn check_for_updates(app_handle: tauri::AppHandle) -> Result<Vec<UpdateInfo>, String> {
    let update_manager = get_update_manager(&app_handle);
    let manager = update_manager.lock().await;
    
    manager.check_for_updates()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))
}

#[tauri::command]
pub async fn set_update_channel(app_handle: tauri::AppHandle, channel: String) -> Result<(), String> {
    let update_manager = get_update_manager(&app_handle);
    let mut manager = update_manager.lock().await;
    
    let parsed_channel = match channel.as_str() {
        "stable" => UpdateChannel::Stable,
        "beta" => UpdateChannel::Beta,
        "alpha" => UpdateChannel::Alpha,
        _ => return Err("Invalid update channel".to_string()),
    };
    
    manager.set_channel(parsed_channel);
    Ok(())
}

#[tauri::command]
pub async fn rollback_update(app_handle: tauri::AppHandle) -> Result<(), String> {
    let update_manager = get_update_manager(&app_handle);
    let manager = update_manager.lock().await;
    
    manager.rollback(&app_handle)
        .await
        .map_err(|e| format!("Failed to rollback: {}", e))
}

#[tauri::command]
pub async fn cleanup_old_backups(app_handle: tauri::AppHandle) -> Result<(), String> {
    let update_manager = get_update_manager(&app_handle);
    let manager = update_manager.lock().await;
    
    manager.cleanup_old_backups()
        .map_err(|e| format!("Failed to cleanup backups: {}", e))
}

#[tauri::command]
pub async fn extract_playlist_videos(#[allow(non_snake_case)] playlistUrl: String) -> Result<Vec<String>, String> {
    println!("=== EXTRACT_PLAYLIST_VIDEOS CALLED ===");
    println!("Playlist URL: {}", playlistUrl);
    
    let manager = get_download_manager();
    {
        let mut manager_guard = manager.lock().await;
        
        // Initialize download manager if needed
        println!("Initializing download manager...");
        if let Err(e) = manager_guard.initialize().await {
            let error_msg = format!("Failed to initialize download manager: {}", e);
            println!("Initialization error: {}", error_msg);
            return Err(error_msg);
        }
        println!("Download manager initialized successfully");
    }
    
    let manager_guard = manager.lock().await;
    println!("Calling extract_playlist_videos...");
    match manager_guard.extract_playlist_videos(&playlistUrl).await {
        Ok(video_urls) => {
            println!("Successfully extracted {} videos from playlist", video_urls.len());
            Ok(video_urls)
        }
        Err(e) => {
            let error_msg = format!("Failed to extract playlist videos: {}", e);
            println!("Playlist extraction error: {}", error_msg);
            Err(error_msg)
        }
    }
}

#[tauri::command]
pub async fn get_basic_video_metadata(url: String) -> Result<VideoMetadata, String> {
    println!("=== GET_BASIC_VIDEO_METADATA CALLED ===");
    println!("URL: {}", url);
    
    let manager = get_download_manager();
    {
        let mut manager_guard = manager.lock().await;
        
        // Initialize download manager if needed
        println!("Initializing download manager...");
        if let Err(e) = manager_guard.initialize().await {
            let error_msg = format!("Failed to initialize download manager: {}", e);
            println!("Initialization error: {}", error_msg);
            return Err(error_msg);
        }
        println!("Download manager initialized successfully");
    }
    
    let manager_guard = manager.lock().await;
    println!("Calling get_basic_video_info...");
    match manager_guard.get_basic_video_info(&url).await {
        Ok(metadata) => {
            println!("Successfully got basic metadata: title={}", metadata.title);
            Ok(metadata)
        }
        Err(e) => {
            let error_msg = format!("Failed to get basic video metadata: {}", e);
            println!("Basic metadata error: {}", error_msg);
            Err(error_msg)
        }
    }
}

#[tauri::command]
pub async fn convert_video_file(
    app_handle: tauri::AppHandle,
    id: String,
    #[allow(non_snake_case)] inputFile: String,
    #[allow(non_snake_case)] outputFile: String,
    format: String,
    #[allow(non_snake_case)] _keepOriginal: Option<bool>,
) -> Result<(), String> {
    println!("=== CONVERT_VIDEO_FILE CALLED ===");
    println!("Input file: {}", inputFile);
    println!("Output file: {}", outputFile);
    println!("Format: {}", format);
    
    // Parse conversion format
    let parsed_format = match format.as_str() {
        "h264" => ConversionFormat::H264HighProfile,
        "dnxhr" => ConversionFormat::DNxHRSQ,
        "prores" => ConversionFormat::ProResProxy,
        "mp3" => ConversionFormat::MP3Audio,
        _ => return Err("Invalid conversion format".to_string()),
    };
    
    let manager = get_download_manager();
    let manager_guard = manager.lock().await;
    
    // Get the FFmpeg controller from the download manager
    if let Some(ffmpeg) = manager_guard.get_ffmpeg_controller() {
        use std::path::PathBuf;
        use crate::ffmpeg_controller::ConversionRequest;
        use crate::download_manager::{DownloadProgress, DownloadStatus};
        
        // Emit conversion started status update via download-progress event
        let converting_progress = DownloadProgress {
            id: id.clone(),
            status: DownloadStatus::Converting,
            progress: 0.0,
            speed: None,
            eta: None,
            downloaded_bytes: None,
            total_bytes: None,
            error: None,
            file_path: Some(inputFile.clone()),
        };
        println!("=== COMMANDS: Emitting conversion started progress event: {:?} ===", converting_progress);
        let _ = app_handle.emit("download-progress", &converting_progress);
        
        // Create a progress channel for conversion updates
        let (conversion_tx, mut conversion_rx) = tokio::sync::mpsc::unbounded_channel::<crate::ffmpeg_controller::ConversionProgress>();
        let app_handle_clone = app_handle.clone();
        let conversion_id = id.clone();
        let input_file_clone = inputFile.clone();
        
        // Spawn task to forward conversion progress to download-progress events
        tokio::spawn(async move {
            while let Some(conv_progress) = conversion_rx.recv().await {
                let dl_progress = DownloadProgress {
                    id: conversion_id.clone(),
                    status: DownloadStatus::Converting,
                    progress: conv_progress.progress,
                    speed: conv_progress.speed,
                    eta: conv_progress.eta,
                    downloaded_bytes: None,
                    total_bytes: None,
                    error: conv_progress.error,
                    file_path: Some(input_file_clone.clone()),
                };
                println!("=== COMMANDS: Forwarding conversion progress: {:.1}% ===", conv_progress.progress);
                let _ = app_handle_clone.emit("download-progress", &dl_progress);
            }
        });
        
        let conversion_request = ConversionRequest {
            id: id.clone(),
            input_file: PathBuf::from(inputFile.clone()),
            output_file: PathBuf::from(outputFile.clone()),
            format: parsed_format,
            progress_tx: Some(conversion_tx),
        };
        
        match ffmpeg.convert_video(conversion_request).await {
            Ok(output_path) => {
                println!("Conversion completed successfully: {:?}", output_path);
                
                // Small delay to ensure FFmpeg controller's final progress update is processed first
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                
                // Emit completion status update via download-progress event
                let completed_progress = DownloadProgress {
                    id: id.clone(),
                    status: DownloadStatus::Completed,
                    progress: 100.0,
                    speed: None,
                    eta: None,
                    downloaded_bytes: None,
                    total_bytes: None,
                    error: None,
                    file_path: Some(output_path.to_string_lossy().to_string()),
                };
                println!("=== COMMANDS: Emitting conversion completed progress event: {:?} ===", completed_progress);
                let _ = app_handle.emit("download-progress", &completed_progress);
                
                // Also emit legacy conversion event for compatibility
                println!("=== COMMANDS: Emitting legacy conversion-completed event for id: {} ===", id);
                let _ = app_handle.emit("conversion-completed", &id);
                Ok(())
            }
            Err(e) => {
                let error_msg = format!("Conversion failed: {}", e);
                println!("Conversion error: {}", error_msg);
                
                // Emit failure status update via download-progress event
                let failed_progress = DownloadProgress {
                    id: id.clone(),
                    status: DownloadStatus::Failed,
                    progress: 0.0,
                    speed: None,
                    eta: None,
                    downloaded_bytes: None,
                    total_bytes: None,
                    error: Some(error_msg.clone()),
                    file_path: Some(inputFile),
                };
                println!("=== COMMANDS: Emitting conversion failed progress event: {:?} ===", failed_progress);
                let _ = app_handle.emit("download-progress", &failed_progress);
                
                // Also emit legacy conversion event for compatibility
                println!("=== COMMANDS: Emitting legacy conversion-failed event for id: {} ===", id);
                let _ = app_handle.emit("conversion-failed", &id);
                Err(error_msg)
            }
        }
    } else {
        Err("FFmpeg not initialized".to_string())
    }
}

#[tauri::command]
pub async fn check_file_exists(
    #[allow(non_snake_case)] filePath: String,
) -> Result<bool, String> {
    use std::path::Path;
    
    let path = Path::new(&filePath);
    let exists = path.exists() && path.is_file();
    
    println!("=== CHECK_FILE_EXISTS: Path: {} | Exists: {} ===", filePath, exists);
    Ok(exists)
}

#[tauri::command]
pub async fn generate_conversion_filename(
    #[allow(non_snake_case)] inputFilePath: String,
    quality: String,
    format: String,
) -> Result<String, String> {
    println!("=== GENERATE_CONVERSION_FILENAME CALLED ===");
    println!("Input file: {}", inputFilePath);
    println!("Quality: {}", quality);
    println!("Format: {}", format);
    
    use std::path::Path;
    
    let input_path = Path::new(&inputFilePath);
    
    // Get the directory containing the input file
    let parent_dir = input_path.parent()
        .ok_or("Could not get parent directory")?
        .to_string_lossy();
    
    // Get the filename without extension
    let file_stem = input_path.file_stem()
        .ok_or("Could not get file stem")?
        .to_string_lossy();
    
    // Determine the correct file extension based on format
    let extension = match format.as_str() {
        "h264" => "mp4",
        "dnxhr" => "mov", 
        "prores" => "mov",
        "mp3" => "mp3",
        _ => return Err("Invalid conversion format".to_string()),
    };
    
    // Helper function to get quality suffix for filenames
    fn get_quality_suffix_for_conversion(quality: &str) -> String {
        let normalized_quality = quality.to_lowercase();
        
        // Handle common quality formats
        if normalized_quality.contains("2160") || normalized_quality.contains("4k") {
            return "2160".to_string();
        }
        if normalized_quality.contains("1440") {
            return "1440".to_string();
        }
        if normalized_quality.contains("1080") {
            return "1080".to_string();
        }
        if normalized_quality.contains("720") {
            return "720".to_string();
        }
        if normalized_quality.contains("480") {
            return "480".to_string();
        }
        if normalized_quality.contains("360") {
            return "360".to_string();
        }
        if normalized_quality.contains("240") {
            return "240".to_string();
        }
        if normalized_quality.contains("144") {
            return "144".to_string();
        }
        
        // Handle special cases
        if normalized_quality.contains("best") || normalized_quality.contains("highest") {
            return "best".to_string();
        }
        if normalized_quality.contains("worst") || normalized_quality.contains("lowest") {
            return "worst".to_string();
        }
        
        // Default case - use quality as-is but sanitized
        quality.chars()
            .filter(|c| c.is_alphanumeric())
            .collect::<String>()
            .to_lowercase()
    }
    
    let resolution_suffix = get_quality_suffix_for_conversion(&quality);
    
    // Generate filename following pattern: Filename_RESOLUTION_CODEC.SUFFIX
    let output_filename = format!("{}_{}_{}.{}", 
        file_stem, 
        resolution_suffix,
        format,
        extension
    );
    
    let output_path = format!("{}/{}", parent_dir, output_filename);
    
    println!("Generated output path: {}", output_path);
    Ok(output_path)
}

#[tauri::command]
pub async fn open_download_folder(id: String) -> Result<(), String> {
    use std::process::Command;
    
    println!("=== OPEN_DOWNLOAD_FOLDER CALLED ===");
    println!("Download ID: {}", id);
    
    // For now, just open the default download directory
    // TODO: In the future, we could track individual download locations per ID
    let folder_path = get_default_download_dir().await?;
    
    println!("Opening folder path: {}", folder_path);
    
    let result = if cfg!(target_os = "windows") {
        Command::new("explorer")
            .arg(&folder_path)
            .spawn()
    } else if cfg!(target_os = "macos") {
        Command::new("open")
            .arg(&folder_path)
            .spawn()
    } else {
        // Linux
        Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
    };
    
    match result {
        Ok(_) => {
            println!("Successfully opened folder: {}", folder_path);
            Ok(())
        }
        Err(e) => {
            let error_msg = format!("Failed to open folder: {}", e);
            println!("Error: {}", error_msg);
            Err(error_msg)
        }
    }
}

// Dependency Management Commands

#[tauri::command]
pub async fn check_dependencies(app_handle: AppHandle) -> Result<DependencyStatus, String> {
    let manager = get_dependency_manager(&app_handle);
    let manager = manager.lock().await;
    
    manager.check_dependencies()
        .await
        .map_err(|e| format!("Failed to check dependencies: {}", e))
}

#[tauri::command]
pub async fn install_yt_dlp(app_handle: AppHandle) -> Result<(), String> {
    let manager = get_dependency_manager(&app_handle);
    let manager = manager.lock().await;
    
    manager.install_yt_dlp(&app_handle)
        .await
        .map_err(|e| format!("Failed to install yt-dlp: {}", e))
}

#[tauri::command]
pub async fn install_ffmpeg(app_handle: AppHandle) -> Result<(), String> {
    let manager = get_dependency_manager(&app_handle);
    let manager = manager.lock().await;
    
    manager.install_ffmpeg(&app_handle)
        .await
        .map_err(|e| format!("Failed to install FFmpeg: {}", e))
}

#[tauri::command]
pub async fn uninstall_dependency(app_handle: AppHandle, dependency: String) -> Result<(), String> {
    let manager = get_dependency_manager(&app_handle);
    let manager = manager.lock().await;
    
    manager.uninstall_dependency(&dependency)
        .await
        .map_err(|e| format!("Failed to uninstall {}: {}", dependency, e))
}

#[tauri::command]
pub async fn get_dependency_paths(app_handle: AppHandle) -> Result<(String, String), String> {
    let manager = get_dependency_manager(&app_handle);
    let manager = manager.lock().await;
    
    let yt_dlp_path = manager.get_yt_dlp_path().to_string_lossy().to_string();
    let ffmpeg_path = manager.get_ffmpeg_path().to_string_lossy().to_string();
    
    Ok((yt_dlp_path, ffmpeg_path))
}