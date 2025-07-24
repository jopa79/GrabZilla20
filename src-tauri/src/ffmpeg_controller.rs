use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command as AsyncCommand;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConversionFormat {
    #[serde(rename = "h264")]
    H264HighProfile,
    #[serde(rename = "dnxhr")]
    DNxHRSQ,
    #[serde(rename = "prores")]
    ProResProxy,
    #[serde(rename = "mp3")]
    MP3Audio,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversionProgress {
    pub id: String,
    pub progress: f32,
    pub speed: Option<String>,
    pub eta: Option<String>,
    pub current_pass: Option<u8>,
    pub total_passes: Option<u8>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ConversionRequest {
    pub id: String,
    pub input_file: PathBuf,
    pub output_file: PathBuf,
    pub format: ConversionFormat,
    pub progress_tx: Option<mpsc::UnboundedSender<ConversionProgress>>,
}

#[derive(Clone)]
pub struct FFmpegController {
    ffmpeg_path: Option<PathBuf>,
}

impl FFmpegController {
    pub fn new() -> Result<Self> {
        Ok(FFmpegController {
            ffmpeg_path: None,
        })
    }

    pub async fn initialize(&mut self) -> Result<()> {
        self.ensure_ffmpeg().await?;
        Ok(())
    }

    async fn ensure_ffmpeg(&mut self) -> Result<()> {
        // Check if FFmpeg is available in PATH
        if let Ok(output) = AsyncCommand::new("ffmpeg")
            .arg("-version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
        {
            if output.status.success() {
                self.ffmpeg_path = Some(PathBuf::from("ffmpeg"));
                return Ok(());
            }
        }

        // TODO: Download FFmpeg if not found
        // For now, just check if it's available
        Err(anyhow!("FFmpeg not found. Please install FFmpeg first."))
    }

    pub async fn convert_video(&self, request: ConversionRequest) -> Result<PathBuf> {
        println!("=== FFMPEG CONTROLLER: Starting conversion ===");
        println!("Input file: {:?}", request.input_file);
        println!("Output file: {:?}", request.output_file);
        println!("Format: {:?}", request.format);
        
        let ffmpeg_path = self.ffmpeg_path.as_ref()
            .ok_or_else(|| anyhow!("FFmpeg not initialized"))?;

        // Ensure output directory exists
        if let Some(parent) = request.output_file.parent() {
            tokio::fs::create_dir_all(parent).await?;
            println!("=== FFMPEG CONTROLLER: Created output directory: {:?} ===", parent);
        }

        let mut cmd = AsyncCommand::new(ffmpeg_path);
        
        // Input file
        cmd.arg("-i").arg(&request.input_file);
        
        // Add format-specific arguments
        self.add_format_args(&mut cmd, &request.format)?;
        
        // Progress reporting
        cmd.arg("-progress").arg("pipe:1");
        
        // Overwrite output files
        cmd.arg("-y");
        
        // Output file
        cmd.arg(&request.output_file);

        // Log the full command
        println!("=== FFMPEG CONTROLLER: Executing command: {:?} ===", cmd);

        // Set up stdio
        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped());

        println!("=== FFMPEG CONTROLLER: Spawning FFmpeg process ===");
        let mut child = cmd.spawn()?;

        // Monitor conversion progress
        if let Some(ref progress_tx) = request.progress_tx {
            let tx = progress_tx.clone();
            let id = request.id.clone();
            
            // Create a copy of stdout for monitoring
            if let Some(stdout) = child.stdout.take() {
                println!("=== FFMPEG CONTROLLER: Starting progress monitoring ===");
                
                // Spawn a separate task to monitor progress
                tokio::spawn(async move {
                    use tokio::io::{AsyncBufReadExt, BufReader};
                    let reader = BufReader::new(stdout);
                    let mut lines = reader.lines();
                    
                    while let Ok(Some(line)) = lines.next_line().await {
                        println!("=== FFMPEG PROGRESS: {} ===", line);
                        
                        if let Some(progress) = parse_ffmpeg_progress(&line) {
                            println!("=== FFMPEG CONTROLLER: Conversion progress: {:.1}% ===", progress);
                            
                            let _ = tx.send(ConversionProgress {
                                id: id.clone(),
                                progress,
                                speed: None, // TODO: Parse from FFmpeg output
                                eta: None,   // TODO: Calculate based on progress and speed
                                current_pass: None,
                                total_passes: None,
                                error: None,
                            });
                        }
                    }
                    
                    println!("=== FFMPEG CONTROLLER: Progress monitoring finished ===");
                });
            }
        }

        // Wait for conversion to complete
        println!("=== FFMPEG CONTROLLER: Waiting for conversion to complete ===");
        let output = child.wait_with_output().await?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            println!("=== FFMPEG CONTROLLER: Conversion failed with error: {} ===", error);
            
            // Send error progress update
            if let Some(ref progress_tx) = request.progress_tx {
                let _ = progress_tx.send(ConversionProgress {
                    id: request.id.clone(),
                    progress: 0.0,
                    speed: None,
                    eta: None,
                    current_pass: None,
                    total_passes: None,
                    error: Some(error.to_string()),
                });
            }
            
            return Err(anyhow!("FFmpeg conversion failed: {}", error));
        }

        println!("=== FFMPEG CONTROLLER: Conversion completed successfully ===");
        
        // Send completion progress update
        if let Some(ref progress_tx) = request.progress_tx {
            println!("=== FFMPEG CONTROLLER: Sending completion progress update ===");
            let _ = progress_tx.send(ConversionProgress {
                id: request.id,
                progress: 100.0,
                speed: None,
                eta: None,
                current_pass: None,
                total_passes: None,
                error: None,
            });
        }

        println!("=== FFMPEG CONTROLLER: Returning output file: {:?} ===", request.output_file);
        Ok(request.output_file)
    }

    fn add_format_args(&self, cmd: &mut AsyncCommand, format: &ConversionFormat) -> Result<()> {
        match format {
            ConversionFormat::H264HighProfile => {
                // H.264 High Profile @ Level 4.1
                cmd.arg("-c:v").arg("libx264")
                   .arg("-profile:v").arg("high")
                   .arg("-level:v").arg("4.1")
                   .arg("-preset").arg("medium")
                   .arg("-crf").arg("18")
                   .arg("-c:a").arg("aac")
                   .arg("-b:a").arg("192k")
                   .arg("-movflags").arg("+faststart");
            }
            ConversionFormat::DNxHRSQ => {
                // DNxHR SQ for Avid workflows
                cmd.arg("-c:v").arg("dnxhd")
                   .arg("-profile:v").arg("dnxhr_sq")
                   .arg("-c:a").arg("pcm_s24le")
                   .arg("-f").arg("mov");
            }
            ConversionFormat::ProResProxy => {
                // ProRes Proxy for Apple workflows
                cmd.arg("-c:v").arg("prores_ks")
                   .arg("-profile:v").arg("0") // Proxy profile
                   .arg("-c:a").arg("pcm_s16le")
                   .arg("-f").arg("mov");
            }
            ConversionFormat::MP3Audio => {
                // MP3 audio extraction
                cmd.arg("-vn") // No video
                   .arg("-c:a").arg("libmp3lame")
                   .arg("-b:a").arg("320k")
                   .arg("-q:a").arg("0");
            }
        }
        Ok(())
    }

    pub fn get_output_extension(&self, format: &ConversionFormat) -> &str {
        match format {
            ConversionFormat::H264HighProfile => "mp4",
            ConversionFormat::DNxHRSQ => "mov",
            ConversionFormat::ProResProxy => "mov",
            ConversionFormat::MP3Audio => "mp3",
        }
    }

    pub async fn probe_video_info(&self, file_path: &Path) -> Result<VideoInfo> {
        let _ffmpeg_path = self.ffmpeg_path.as_ref()
            .ok_or_else(|| anyhow!("FFmpeg not initialized"))?;

        let output = AsyncCommand::new("ffprobe")
            .arg("-v").arg("quiet")
            .arg("-print_format").arg("json")
            .arg("-show_format")
            .arg("-show_streams")
            .arg(file_path)
            .output()
            .await?;

        if !output.status.success() {
            return Err(anyhow!("Failed to probe video info"));
        }

        let json_str = String::from_utf8(output.stdout)?;
        let probe_data: ProbeData = serde_json::from_str(&json_str)?;

        Ok(VideoInfo::from_probe_data(probe_data))
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ProbeData {
    format: ProbeFormat,
    streams: Vec<ProbeStream>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
    size: Option<String>,
    bit_rate: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProbeStream {
    codec_type: String,
    codec_name: String,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    bit_rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub duration: Option<f64>,
    pub file_size: Option<u64>,
    pub bit_rate: Option<u64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
}

impl VideoInfo {
    fn from_probe_data(data: ProbeData) -> Self {
        let video_stream = data.streams.iter().find(|s| s.codec_type == "video");
        let audio_stream = data.streams.iter().find(|s| s.codec_type == "audio");

        Self {
            duration: data.format.duration.and_then(|d| d.parse::<f64>().ok()),
            file_size: data.format.size.and_then(|s| s.parse::<u64>().ok()),
            bit_rate: data.format.bit_rate.and_then(|b| b.parse::<u64>().ok()),
            video_codec: video_stream.map(|s| s.codec_name.clone()),
            audio_codec: audio_stream.map(|s| s.codec_name.clone()),
            width: video_stream.and_then(|s| s.width),
            height: video_stream.and_then(|s| s.height),
            frame_rate: video_stream.and_then(|s| {
                s.r_frame_rate.as_ref().and_then(|r| {
                    let parts: Vec<&str> = r.split('/').collect();
                    if parts.len() == 2 {
                        let num = parts[0].parse::<f64>().ok()?;
                        let den = parts[1].parse::<f64>().ok()?;
                        if den != 0.0 {
                            Some(num / den)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
            }),
        }
    }
}

fn parse_ffmpeg_progress(line: &str) -> Option<f32> {
    // FFmpeg progress output with -progress pipe:1 gives us key=value pairs
    // We need to track out_time and duration to calculate percentage
    
    // Look for out_time_ms (current position in microseconds)
    if line.starts_with("out_time_ms=") {
        if let Some(time_str) = line.strip_prefix("out_time_ms=") {
            if let Ok(current_ms) = time_str.parse::<i64>() {
                // For now, we'll use a simple heuristic
                // In a real implementation, we'd need to track duration from the start
                // This is just for demonstration - actual progress calculation requires
                // knowing the total duration of the input file
                return Some(50.0); // Placeholder
            }
        }
    }
    
    // Look for progress=end to know when it's done
    if line.starts_with("progress=end") {
        return Some(100.0);
    }
    
    // For now, we'll just return None and rely on the completion detection
    None
}