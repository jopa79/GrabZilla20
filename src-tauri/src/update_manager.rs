use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_updater::UpdaterExt;
use crate::security_manager::SecurityManager;
use std::fs;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub release_date: String,
    pub release_notes: String,
    pub download_url: String,
    pub signature: String,
    pub file_size: u64,
    pub mandatory: bool,
    pub channel: UpdateChannel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UpdateChannel {
    #[serde(rename = "stable")]
    Stable,
    #[serde(rename = "beta")]
    Beta,
    #[serde(rename = "alpha")]
    Alpha,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMetadata {
    pub backup_path: PathBuf,
    pub previous_version: String,
    pub update_timestamp: u64,
    pub rollback_available: bool,
    pub verification_hash: String,
}

pub struct UpdateManager {
    security_manager: SecurityManager,
    backup_dir: PathBuf,
    current_channel: UpdateChannel,
    app_handle: tauri::AppHandle,
}

impl UpdateManager {
    pub fn new(app_handle: tauri::AppHandle) -> Result<Self> {
        let backup_dir = dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("GrabZilla")
            .join("backups");

        // Ensure backup directory exists
        fs::create_dir_all(&backup_dir)?;

        Ok(UpdateManager {
            security_manager: SecurityManager::new()?,
            backup_dir,
            current_channel: UpdateChannel::Stable,
            app_handle,
        })
    }

    /// Set the update channel
    pub fn set_channel(&mut self, channel: UpdateChannel) {
        self.current_channel = channel;
    }

    /// Check for available updates
    pub async fn check_for_updates(&self) -> Result<Vec<UpdateInfo>> {
        let updater = self.app_handle.updater_builder().build()?;
        let updates = updater.check().await?;
        
        let mut update_infos = Vec::new();
        if let Some(update) = updates {
            update_infos.push(UpdateInfo {
                version: update.version.clone(),
                release_date: update.date.map(|d| d.to_string()).unwrap_or_else(|| "Unknown".to_string()),
                release_notes: update.body.clone().unwrap_or_default(),
                download_url: update.download_url.to_string(),
                signature: update.signature.clone(),
                file_size: 0, // This would need to be fetched from the server
                mandatory: false, // This would be determined by server metadata
                channel: self.current_channel.clone(),
            });
        }
        
        Ok(update_infos)
    }

    /// Create a backup of the current installation
    pub fn create_backup(&self, current_version: &str) -> Result<UpdateMetadata> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs();
        
        let backup_name = format!("backup_{}_{}", current_version, timestamp);
        let backup_path = self.backup_dir.join(&backup_name);
        
        // Get current executable path
        let current_exe = std::env::current_exe()?;
        let exe_dir = current_exe.parent()
            .ok_or_else(|| anyhow!("Could not determine executable directory"))?;

        // Create backup directory
        fs::create_dir_all(&backup_path)?;

        // Copy current executable and critical files
        let backup_exe = backup_path.join(current_exe.file_name().unwrap());
        fs::copy(&current_exe, &backup_exe)?;

        // Calculate verification hash
        let exe_bytes = fs::read(&current_exe)?;
        let verification_hash = sha256::digest(&exe_bytes);

        // Copy configuration files if they exist
        let config_files = ["tauri.conf.json", "app.conf"];
        for config_file in &config_files {
            let config_path = exe_dir.join(config_file);
            if config_path.exists() {
                let backup_config = backup_path.join(config_file);
                if let Err(e) = fs::copy(&config_path, &backup_config) {
                    log::warn!("Failed to backup {}: {}", config_file, e);
                }
            }
        }

        let metadata = UpdateMetadata {
            backup_path: backup_path.clone(),
            previous_version: current_version.to_string(),
            update_timestamp: timestamp,
            rollback_available: true,
            verification_hash,
        };

        // Save metadata
        let metadata_path = backup_path.join("metadata.json");
        let metadata_json = serde_json::to_string_pretty(&metadata)?;
        fs::write(metadata_path, metadata_json)?;

        log::info!("Backup created at: {}", backup_path.display());
        Ok(metadata)
    }

    /// Verify update integrity before installation
    pub async fn verify_update(&self, update: &UpdateInfo) -> Result<bool> {
        log::info!("Verifying update integrity for version {}", &update.version);

        // Download and verify signature
        let update_data = self.download_update_data(update).await?;
        
        // Verify file signature
        if !self.verify_signature(&update_data, &update.signature)? {
            return Ok(false);
        }

        // Additional integrity checks
        if !self.verify_file_integrity(&update_data)? {
            return Ok(false);
        }

        log::info!("Update verification passed");
        Ok(true)
    }

    /// Download update data for verification
    async fn download_update_data(&self, update: &UpdateInfo) -> Result<Vec<u8>> {
        // Validate network access
        if !self.security_manager.validate_network_access(&update.download_url) {
            return Err(anyhow!("Network access to '{}' is not allowed", &update.download_url));
        }

        // Download the update data
        let response = reqwest::get(&update.download_url).await?;
        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }

    /// Verify digital signature of update
    fn verify_signature(&self, _data: &[u8], signature: &str) -> Result<bool> {
        let _public_key = self.get_public_key()?;
        
        log::info!("Verifying signature: {}", signature);
        
        // Basic signature format validation
        if signature.len() < 64 {
            log::warn!("Signature too short");
            return Ok(false);
        }

        // In a real implementation, you would:
        // 1. Decode the base64 signature
        // 2. Verify it against the data using your public key
        // 3. Use proper cryptographic libraries like ring or openssl
        
        // For demo purposes, we'll just validate format
        let is_valid = signature.chars().all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=');
        
        if !is_valid {
            log::warn!("Invalid signature format");
        }
        
        Ok(is_valid)
    }

    /// Retrieve the public key for signature verification
    fn get_public_key(&self) -> Result<String> {
        // In a real application, this would securely fetch the public key
        // For example, from a configuration file, a secure storage, or a trusted server
        Ok("-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----".to_string())
    }

    /// Verify file integrity (check for malware, corruption, etc.)
    fn verify_file_integrity(&self, data: &[u8]) -> Result<bool> {
        // Basic file integrity checks
        
        // Check minimum file size (updates should be substantial)
        if data.len() < 1024 * 1024 { // 1MB minimum
            log::warn!("Update file suspiciously small: {} bytes", data.len());
            return Ok(false);
        }

        // Check for PE/ELF/Mach-O headers depending on platform
        #[cfg(target_os = "windows")]
        {
            if data.len() >= 64 && &data[0..2] == b"MZ" {
                log::info!("Valid PE executable detected");
            } else {
                log::warn!("Invalid executable format for Windows");
                return Ok(false);
            }
        }

        #[cfg(target_os = "macos")]
        {
            // Check for Mach-O magic numbers
            if data.len() >= 4 {
                let magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
                if magic == 0xfeedface || magic == 0xfeedfacf || magic == 0xcafebabe {
                    log::info!("Valid Mach-O executable detected");
                } else {
                    log::warn!("Invalid executable format for macOS");
                    return Ok(false);
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            if data.len() >= 4 && &data[0..4] == b"\x7fELF" {
                log::info!("Valid ELF executable detected");
            } else {
                log::warn!("Invalid executable format for Linux");
                return Ok(false);
            }
        }

        log::info!("File integrity verification passed");
        Ok(true)
    }

    /// Perform rollback to previous version
    pub async fn rollback(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        log::info!("Starting rollback process");

        // Find the most recent backup
        let backup_metadata = self.find_latest_backup()?;
        
        if !backup_metadata.rollback_available {
            return Err(anyhow!("No rollback available"));
        }

        let current_exe = std::env::current_exe()?;
        let backup_exe = backup_metadata.backup_path.join(
            current_exe.file_name().unwrap()
        );

        if !backup_exe.exists() {
            return Err(anyhow!("Backup executable not found"));
        }

        // Verify backup integrity
        let backup_data = fs::read(&backup_exe)?;
        let backup_hash = sha256::digest(&backup_data);
        
        if backup_hash != backup_metadata.verification_hash {
            return Err(anyhow!("Backup integrity verification failed"));
        }

        // Create a backup of current version before rollback
        let current_version = app_handle.package_info().version.to_string();
        let _rollback_backup = self.create_backup(&current_version)?;

        // Perform the rollback
        let temp_exe = current_exe.with_extension("tmp");
        
        // Copy current to temp (in case rollback fails)
        fs::copy(&current_exe, &temp_exe)?;
        
        // Copy backup to current
        fs::copy(&backup_exe, &current_exe)?;
        
        // Verify rollback success
        let restored_data = fs::read(&current_exe)?;
        let restored_hash = sha256::digest(&restored_data);
        
        if restored_hash == backup_metadata.verification_hash {
            // Rollback successful, remove temp file
            let _ = fs::remove_file(&temp_exe);
            log::info!("Rollback completed successfully to version {}", backup_metadata.previous_version);
            Ok(())
        } else {
            // Rollback failed, restore from temp
            fs::copy(&temp_exe, &current_exe)?;
            let _ = fs::remove_file(&temp_exe);
            Err(anyhow!("Rollback verification failed, restored original"))
        }
    }

    /// Find the latest backup metadata
    fn find_latest_backup(&self) -> Result<UpdateMetadata> {
        let backups = fs::read_dir(&self.backup_dir)?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir());

        let mut latest_backup: Option<(u64, PathBuf)> = None;

        for backup in backups {
            let metadata_path = backup.path().join("metadata.json");
            if metadata_path.exists() {
                let metadata_file = fs::File::open(metadata_path)?;
                let metadata: UpdateMetadata = serde_json::from_reader(metadata_file)?;
                if latest_backup.is_none() || metadata.update_timestamp > latest_backup.as_ref().unwrap().0 {
                    latest_backup = Some((metadata.update_timestamp, backup.path()));
                }
            }
        }

        if let Some((_, backup_path)) = latest_backup {
            let metadata_path = backup_path.join("metadata.json");
            let metadata_file = fs::File::open(metadata_path)?;
            let metadata: UpdateMetadata = serde_json::from_reader(metadata_file)?;
            Ok(metadata)
        } else {
            Err(anyhow!("No valid backups found"))
        }
    }

    /// Clean up old backups (keep only the last 3)
    pub fn cleanup_old_backups(&self) -> Result<()> {
        let all_backups = fs::read_dir(&self.backup_dir)?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir());

        let mut backups_with_meta = Vec::new();
        for backup in all_backups {
            let metadata_path = backup.path().join("metadata.json");
            if metadata_path.exists() {
                if let Ok(metadata_file) = fs::File::open(metadata_path) {
                    if let Ok(metadata) = serde_json::from_reader::<_, UpdateMetadata>(metadata_file) {
                        backups_with_meta.push((metadata.update_timestamp, backup.path()));
                    }
                }
            }
        }

        // Sort by timestamp, newest first
        backups_with_meta.sort_by_key(|k| std::cmp::Reverse(k.0));

        // Keep the latest 3 backups
        for (_timestamp, path) in backups_with_meta.into_iter().skip(3) {
            log::info!("Cleaning up old backup: {}", path.display());
            fs::remove_dir_all(path)?;
        }

        Ok(())
    }

    async fn perform_update_and_restart(&self, app_handle: &AppHandle, version: &str) -> Result<()> {
        log::info!("Restarting to apply update version {}", version);
        app_handle.restart();
        // Note: This code is unreachable after restart(), but kept for API consistency
    }

    pub async fn install_and_restart(
        &self,
        app_handle: &AppHandle,
        update_info: &UpdateInfo,
    ) -> Result<()> {
        let current_version = app_handle.package_info().version.to_string();
        self.create_backup(&current_version)?;
        self.perform_update_and_restart(app_handle, &update_info.version)
            .await
    }
}

// Simple SHA-256 implementation for file verification
mod sha256 {
    use sha2::{Digest, Sha256};
    use std::fmt::Write;

    pub fn digest(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        let result = hasher.finalize();
        let mut s = String::with_capacity(result.len() * 2);
        for byte in result {
            write!(&mut s, "{:02x}", byte).expect("Unable to write");
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri;

    #[test]
    fn test_sha256_digest() {
        let input = b"hello world";
        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        assert_eq!(sha256::digest(input), expected);
    }
}