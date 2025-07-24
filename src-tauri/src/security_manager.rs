use anyhow::{anyhow, Result};
use std::process::Command;
use url::Url;

#[cfg(target_os = "windows")]
use {
    std::collections::HashMap,
    std::sync::{Arc, Mutex},
    winapi::shared::minwindef::DWORD,
    winapi::um::{
        jobapi2::{CreateJobObjectW, SetInformationJobObject},
        winnt::{
            JobObjectExtendedLimitInformation, HANDLE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
    },
};

/// Security manager for process sandboxing and privilege management
#[derive(Debug, Clone)]
pub struct SecurityManager {
    #[cfg(target_os = "windows")]
    job_objects: Arc<Mutex<HashMap<u32, HANDLE>>>,
    allowed_processes: Vec<String>,
    network_whitelist: Vec<String>,
}

impl SecurityManager {
    /// Create a new security manager
    pub fn new() -> Result<Self> {
        Ok(Self {
            #[cfg(target_os = "windows")]
            job_objects: Arc::new(Mutex::new(HashMap::new())),
            allowed_processes: vec![
                "yt-dlp.exe".to_string(),
                "ffmpeg.exe".to_string(),
                "curl.exe".to_string(),
            ],
            network_whitelist: vec![
                "youtube.com".to_string(),
                "youtu.be".to_string(),
                "vimeo.com".to_string(),
                "dailymotion.com".to_string(),
            ],
        })
    }

    /// Create a job object for a process on Windows to ensure it's terminated
    #[cfg(target_os = "windows")]
    pub fn create_job_object_for_process(&self, pid: u32) -> Result<()> {
        let job_name = format!("GrabZillaJob_{}", pid);
        let mut job_name_w: Vec<u16> = job_name.encode_utf16().collect();
        job_name_w.push(0);

        let job_handle = unsafe { CreateJobObjectW(std::ptr::null_mut(), job_name_w.as_ptr()) };
        if job_handle.is_null() {
            return Err(anyhow!("Failed to create job object"));
        }

        let mut limit_info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        limit_info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let res = unsafe {
            SetInformationJobObject(
                job_handle,
                JobObjectExtendedLimitInformation,
                &mut limit_info as *mut _ as *mut _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as DWORD,
            )
        };

        if res == 0 {
            return Err(anyhow!("Failed to set job object information"));
        }

        self.job_objects.lock().unwrap().insert(pid, job_handle);
        Ok(())
    }

    /// Validate network access against whitelist
    pub fn validate_network_access(&self, url: &str) -> bool {
        if let Ok(parsed_url) = Url::parse(url) {
            if let Some(host) = parsed_url.host_str() {
                return self
                    .network_whitelist
                    .iter()
                    .any(|whitelisted| host.ends_with(whitelisted));
            }
        }
        false
    }

    /// Sanitize file path to prevent directory traversal
    pub fn sanitize_file_path(&self, path: &str) -> Result<String> {
        use std::path::{Path, PathBuf};
        
        let path = Path::new(path);
        let mut sanitized = PathBuf::new();
        
        for component in path.components() {
            match component {
                std::path::Component::Normal(name) => {
                    // Allow normal path components
                    sanitized.push(name);
                }
                std::path::Component::RootDir => {
                    // Allow root directory on absolute paths
                    sanitized.push(component);
                }
                std::path::Component::CurDir => {
                    // Skip current directory references
                    continue;
                }
                std::path::Component::ParentDir => {
                    // Block parent directory traversal
                    return Err(anyhow!("Parent directory traversal not allowed"));
                }
                std::path::Component::Prefix(_) => {
                    // Allow drive prefixes on Windows
                    #[cfg(target_os = "windows")]
                    sanitized.push(component);
                    #[cfg(not(target_os = "windows"))]
                    return Err(anyhow!("Path prefixes not allowed on this platform"));
                }
            }
        }
        
        Ok(sanitized.to_string_lossy().to_string())
    }

    /// Cleanup job objects when processes terminate
    #[cfg(target_os = "windows")]
    pub fn cleanup_process(&self, process_id: u32) {
        if let Ok(mut job_objects) = self.job_objects.lock() {
            if let Some(job_handle) = job_objects.remove(&process_id) {
                unsafe {
                    CloseHandle(job_handle);
                }
            }
        }
    }

    pub fn validate_process(&self, process_name: &str) -> bool {
        let normalized_name = process_name.to_lowercase();
        
        // Basic security check against common shell commands
        let blocked_patterns = [
            "cmd.exe", "powershell.exe", "wscript.exe", "cscript.exe",
            "mshta.exe", "rundll32.exe", "regsvr32.exe", "certutil.exe",
            "bitsadmin.exe", "wmic.exe", "sc.exe", "net.exe", "taskkill.exe",
        ];
        
        for pattern in &blocked_patterns {
            if normalized_name.contains(pattern) {
                return false;
            }
        }
        
        true
    }

    pub fn validate_process_name(&self, process_name: &str) -> bool {
        self.allowed_processes.iter().any(|p| p == process_name)
    }

    pub fn create_secure_command(&self, program: &str, args: &[&str]) -> Result<Command> {
        let mut cmd = Command::new(program);
        cmd.args(args);
        Ok(cmd)
    }

    pub fn is_running_elevated(&self) -> Result<bool> {
        // Implement privilege check here
        Ok(false)
    }
}

impl Drop for SecurityManager {
    fn drop(&mut self) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(job_objects) = self.job_objects.lock() {
                for (_, job_handle) in job_objects.iter() {
                    unsafe {
                        CloseHandle(*job_handle);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_validation() {
        let security_manager = SecurityManager::new().unwrap();
        
        // Test allowed domains
        assert!(security_manager.validate_network_access("https://youtube.com/watch?v=test"));
        assert!(security_manager.validate_network_access("https://vimeo.com/123456"));
        
        // Test blocked domains
        assert!(!security_manager.validate_network_access("https://malicious-site.com"));
        assert!(!security_manager.validate_network_access("http://localhost:8080"));
    }

    #[test]
    fn test_path_sanitization() {
        let security_manager = SecurityManager::new().unwrap();
        
        // Test normal paths
        assert!(security_manager.sanitize_file_path("downloads/video.mp4").is_ok());
        
        // Test directory traversal attempts
        assert!(security_manager.sanitize_file_path("../../../etc/passwd").is_err());
        assert!(security_manager.sanitize_file_path("downloads/../../../system32").is_err());
    }
}