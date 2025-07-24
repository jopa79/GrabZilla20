use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use tokio::process::Command;
use reqwest;
use tauri::{AppHandle, Manager, Emitter};
use crate::security_manager::SecurityManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyInfo {
    pub name: String,
    pub version: Option<String>,
    pub installed: bool,
    pub path: Option<PathBuf>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub yt_dlp: DependencyInfo,
    pub ffmpeg: DependencyInfo,
    pub all_installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProgress {
    pub dependency: String,
    pub stage: String,
    pub progress: f32,
    pub message: String,
}

pub struct DependencyManager {
    app_data_dir: PathBuf,
    security_manager: SecurityManager,
}

impl DependencyManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow!("Failed to get app data directory: {}", e))?;
        
        // Create dependencies directory
        let deps_dir = app_data_dir.join("dependencies");
        fs::create_dir_all(&deps_dir)?;
        
        Ok(Self {
            app_data_dir: deps_dir,
            security_manager: SecurityManager::new()?,
        })
    }

    pub async fn check_dependencies(&self) -> Result<DependencyStatus> {
        let yt_dlp_info = self.check_yt_dlp().await?;
        let ffmpeg_info = self.check_ffmpeg().await?;
        
        let all_installed = yt_dlp_info.installed && ffmpeg_info.installed;
        
        Ok(DependencyStatus {
            yt_dlp: yt_dlp_info,
            ffmpeg: ffmpeg_info,
            all_installed,
        })
    }

    async fn check_yt_dlp(&self) -> Result<DependencyInfo> {
        let yt_dlp_path = self.get_yt_dlp_path();
        
        let mut info = DependencyInfo {
            name: "yt-dlp".to_string(),
            version: None,
            installed: false,
            path: None,
            size: None,
        };

        if yt_dlp_path.exists() {
            info.installed = true;
            info.path = Some(yt_dlp_path.clone());
            
            // Get file size
            if let Ok(metadata) = fs::metadata(&yt_dlp_path) {
                info.size = Some(metadata.len());
            }
            
            // Get version
            if let Ok(output) = Command::new(&yt_dlp_path)
                .arg("--version")
                .output()
                .await
            {
                if output.status.success() {
                    info.version = Some(String::from_utf8_lossy(&output.stdout).trim().to_string());
                }
            }
        }

        Ok(info)
    }

    async fn check_ffmpeg(&self) -> Result<DependencyInfo> {
        let ffmpeg_path = self.get_ffmpeg_path();
        
        let mut info = DependencyInfo {
            name: "ffmpeg".to_string(),
            version: None,
            installed: false,
            path: None,
            size: None,
        };

        if ffmpeg_path.exists() {
            info.installed = true;
            info.path = Some(ffmpeg_path.clone());
            
            // Get file size
            if let Ok(metadata) = fs::metadata(&ffmpeg_path) {
                info.size = Some(metadata.len());
            }
            
            // Get version
            if let Ok(output) = Command::new(&ffmpeg_path)
                .arg("-version")
                .output()
                .await
            {
                if output.status.success() {
                    let version_output = String::from_utf8_lossy(&output.stdout);
                    if let Some(line) = version_output.lines().next() {
                        if let Some(version) = line.split_whitespace().nth(2) {
                            info.version = Some(version.to_string());
                        }
                    }
                }
            }
        }

        Ok(info)
    }

    pub async fn install_yt_dlp(&self, app_handle: &AppHandle) -> Result<()> {
        let yt_dlp_path = self.get_yt_dlp_path();
        
        // Emit progress
        self.emit_progress(app_handle, "yt-dlp", "downloading", 0.0, "Starting yt-dlp download...").await;
        
        // Download URL based on platform
        let download_url = self.get_yt_dlp_download_url()?;
        
        // Download the file
        let response = reqwest::get(&download_url).await?;
        if !response.status().is_success() {
            return Err(anyhow!("Failed to download yt-dlp: HTTP {}", response.status()));
        }
        
        self.emit_progress(app_handle, "yt-dlp", "downloading", 25.0, "Downloading yt-dlp...").await;
        
        let bytes = response.bytes().await?;
        
        self.emit_progress(app_handle, "yt-dlp", "installing", 50.0, "Installing yt-dlp...").await;
        
        // Write to file
        fs::write(&yt_dlp_path, &bytes)?;
        
        // Make executable on Unix systems
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&yt_dlp_path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&yt_dlp_path, perms)?;
        }
        
        self.emit_progress(app_handle, "yt-dlp", "verifying", 75.0, "Verifying installation...").await;
        
        // Verify installation
        let output = Command::new(&yt_dlp_path)
            .arg("--version")
            .output()
            .await?;
            
        if !output.status.success() {
            return Err(anyhow!("yt-dlp installation verification failed"));
        }
        
        self.emit_progress(app_handle, "yt-dlp", "completed", 100.0, "yt-dlp installed successfully!").await;
        
        Ok(())
    }

    pub async fn install_ffmpeg(&self, app_handle: &AppHandle) -> Result<()> {
        let ffmpeg_dir = self.app_data_dir.join("ffmpeg");
        fs::create_dir_all(&ffmpeg_dir)?;
        
        self.emit_progress(app_handle, "ffmpeg", "downloading", 0.0, "Starting FFmpeg download...").await;
        
        // Download URL based on platform
        let download_url = self.get_ffmpeg_download_url()?;
        
        // Download the archive
        let response = reqwest::get(&download_url).await?;
        if !response.status().is_success() {
            return Err(anyhow!("Failed to download FFmpeg: HTTP {}", response.status()));
        }
        
        self.emit_progress(app_handle, "ffmpeg", "downloading", 25.0, "Downloading FFmpeg...").await;
        
        let bytes = response.bytes().await?;
        
        self.emit_progress(app_handle, "ffmpeg", "extracting", 50.0, "Extracting FFmpeg...").await;
        
        // Save and extract archive
        let archive_path = ffmpeg_dir.join("ffmpeg.zip");
        fs::write(&archive_path, &bytes)?;
        
        // Extract archive (this is a simplified version - you may want to use a proper zip library)
        self.extract_ffmpeg_archive(&archive_path, &ffmpeg_dir).await?;
        
        self.emit_progress(app_handle, "ffmpeg", "verifying", 75.0, "Verifying installation...").await;
        
        // Verify installation
        let ffmpeg_path = self.get_ffmpeg_path();
        let output = Command::new(&ffmpeg_path)
            .arg("-version")
            .output()
            .await?;
            
        if !output.status.success() {
            return Err(anyhow!("FFmpeg installation verification failed"));
        }
        
        // Clean up archive
        let _ = fs::remove_file(&archive_path);
        
        self.emit_progress(app_handle, "ffmpeg", "completed", 100.0, "FFmpeg installed successfully!").await;
        
        Ok(())
    }

    async fn extract_ffmpeg_archive(&self, archive_path: &Path, extract_dir: &Path) -> Result<()> {
        // For now, we'll use a simple approach
        // In a production app, you'd want to use a proper zip extraction library
        
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("unzip")
                .arg("-o")
                .arg(archive_path)
                .arg("-d")
                .arg(extract_dir)
                .output()
                .await?;
                
            if !output.status.success() {
                return Err(anyhow!("Failed to extract FFmpeg archive"));
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            // Use PowerShell to extract
            let output = Command::new("powershell")
                .arg("-Command")
                .arg(&format!(
                    "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    archive_path.display(),
                    extract_dir.display()
                ))
                .output()
                .await?;
                
            if !output.status.success() {
                return Err(anyhow!("Failed to extract FFmpeg archive"));
            }
        }
        
        Ok(())
    }

    fn get_yt_dlp_download_url(&self) -> Result<String> {
        let url = match std::env::consts::OS {
            "macos" => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
            "windows" => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
            "linux" => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
            _ => return Err(anyhow!("Unsupported platform for yt-dlp")),
        };
        Ok(url.to_string())
    }

    fn get_ffmpeg_download_url(&self) -> Result<String> {
        let url = match std::env::consts::OS {
            "macos" => "https://evermeet.cx/ffmpeg/getrelease/zip",
            "windows" => "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
            "linux" => "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
            _ => return Err(anyhow!("Unsupported platform for FFmpeg")),
        };
        Ok(url.to_string())
    }

    pub fn get_yt_dlp_path(&self) -> PathBuf {
        let filename = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
        self.app_data_dir.join(filename)
    }

    pub fn get_ffmpeg_path(&self) -> PathBuf {
        let filename = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
        
        // Check in various possible locations after extraction
        let possible_paths = vec![
            self.app_data_dir.join("ffmpeg").join(filename),
            self.app_data_dir.join("ffmpeg").join("bin").join(filename),
            self.app_data_dir.join("ffmpeg").join("ffmpeg").join("bin").join(filename),
        ];
        
        for path in possible_paths {
            if path.exists() {
                return path;
            }
        }
        
        // Default path
        self.app_data_dir.join("ffmpeg").join(filename)
    }

    async fn emit_progress(&self, app_handle: &AppHandle, dependency: &str, stage: &str, progress: f32, message: &str) {
        let progress_data = InstallProgress {
            dependency: dependency.to_string(),
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
        };
        
        let _ = app_handle.emit("dependency_install_progress", &progress_data);
    }

    pub async fn uninstall_dependency(&self, dependency: &str) -> Result<()> {
        match dependency {
            "yt-dlp" => {
                let path = self.get_yt_dlp_path();
                if path.exists() {
                    fs::remove_file(path)?;
                }
            }
            "ffmpeg" => {
                let ffmpeg_dir = self.app_data_dir.join("ffmpeg");
                if ffmpeg_dir.exists() {
                    fs::remove_dir_all(ffmpeg_dir)?;
                }
            }
            _ => return Err(anyhow!("Unknown dependency: {}", dependency)),
        }
        Ok(())
    }
}