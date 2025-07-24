use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Platform {
    #[serde(rename = "youtube")]
    YouTube,
    #[serde(rename = "vimeo")]
    Vimeo,
    #[serde(rename = "twitch")]
    Twitch,
    #[serde(rename = "tiktok")]
    TikTok,
    #[serde(rename = "instagram")]
    Instagram,
    #[serde(rename = "twitter")]
    Twitter,
    #[serde(rename = "facebook")]
    Facebook,
    #[serde(rename = "generic")]
    Generic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedUrl {
    pub url: String,
    pub platform: Platform,
    pub title: Option<String>,
    pub is_valid: bool,
    pub original_text: String,
    pub is_playlist: bool,
    pub playlist_count: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct URLExtractionResult {
    pub urls: Vec<ExtractedUrl>,
    pub total_found: usize,
    pub valid_urls: usize,
    pub duplicates_removed: usize,
}

pub struct PlatformPattern {
    pub platform: Platform,
    pub regex: Regex,
}

pub struct URLExtractor {
    platform_patterns: Vec<PlatformPattern>,
    generic_url_regex: Regex,
}

impl URLExtractor {
    pub fn new() -> Result<Self> {
        let platform_patterns = vec![
            // YouTube patterns
            PlatformPattern {
                platform: Platform::YouTube,
                regex: Regex::new(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/)([a-zA-Z0-9_-]{11})")?,
            },
            PlatformPattern {
                platform: Platform::YouTube,
                regex: Regex::new(r"youtube\.com/playlist\?list=([a-zA-Z0-9_-]+)")?,
            },
            // Vimeo patterns
            PlatformPattern {
                platform: Platform::Vimeo,
                regex: Regex::new(r"vimeo\.com/(?:channels/[^/]+/)?(?:groups/[^/]+/videos/)?(\d+)")?,
            },
            // Twitch patterns
            PlatformPattern {
                platform: Platform::Twitch,
                regex: Regex::new(r"twitch\.tv/videos/(\d+)")?,
            },
            PlatformPattern {
                platform: Platform::Twitch,
                regex: Regex::new(r"twitch\.tv/[^/]+/clip/([a-zA-Z0-9_-]+)")?,
            },
            // TikTok patterns
            PlatformPattern {
                platform: Platform::TikTok,
                regex: Regex::new(r"tiktok\.com/@[\w.-]+/video/(\d+)")?,
            },
            PlatformPattern {
                platform: Platform::TikTok,
                regex: Regex::new(r"vm\.tiktok\.com/([a-zA-Z0-9]+)")?,
            },
            // Instagram patterns
            PlatformPattern {
                platform: Platform::Instagram,
                regex: Regex::new(r"instagram\.com/(?:p|reel|tv)/([a-zA-Z0-9_-]+)")?,
            },
            // Twitter patterns
            PlatformPattern {
                platform: Platform::Twitter,
                regex: Regex::new(r"(?:twitter\.com|x\.com)/[^/]+/status/(\d+)")?,
            },
            // Facebook patterns
            PlatformPattern {
                platform: Platform::Facebook,
                regex: Regex::new(r"facebook\.com/.*?/videos/(\d+)")?,
            },
        ];

        let generic_url_regex = Regex::new(r"https?://[^\s<>]+[^\s<>.,;:]")?;

        Ok(URLExtractor {
            platform_patterns,
            generic_url_regex,
        })
    }

    pub fn extract_urls(&self, text: &str) -> Result<URLExtractionResult> {
        let mut found_urls = Vec::new();
        let mut seen_urls = HashSet::new();
        let mut duplicates_removed = 0;

        // Preprocess text to handle different formats
        let preprocessed_text = self.preprocess_text(text);

        // First pass: Extract all potential URLs using generic regex
        for cap in self.generic_url_regex.find_iter(&preprocessed_text) {
            let url_str = cap.as_str();
            
            // Clean the URL (remove tracking parameters, etc.)
            let cleaned_url = self.clean_url(url_str)?;
            
            // Check for duplicates
            if seen_urls.contains(&cleaned_url) {
                duplicates_removed += 1;
                continue;
            }
            seen_urls.insert(cleaned_url.clone());

            // Determine platform
            let platform = self.detect_platform(&cleaned_url);
            
            // Validate URL
            let is_valid = self.validate_url(&cleaned_url);

            let is_playlist = self.detect_playlist(&cleaned_url);
            
            found_urls.push(ExtractedUrl {
                url: cleaned_url,
                platform,
                title: None, // Will be populated by metadata fetching later
                is_valid,
                original_text: url_str.to_string(),
                is_playlist,
                playlist_count: None, // Will be populated later if it's a playlist
            });
        }

        let total_found = found_urls.len() + duplicates_removed;
        let valid_urls = found_urls.iter().filter(|u| u.is_valid).count();

        Ok(URLExtractionResult {
            urls: found_urls,
            total_found,
            valid_urls,
            duplicates_removed,
        })
    }

    fn preprocess_text(&self, text: &str) -> String {
        let mut processed = text.to_string();

        // Handle HTML-encoded URLs
        processed = processed
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&#x2F;", "/")
            .replace("&#x3D;", "=");

        // Handle RTF-style URLs (remove RTF formatting)
        if processed.contains("\\field") {
            // RTF hyperlink pattern: {\field{\*\fldinst{HYPERLINK "URL"}}{\fldrslt{Text}}}
            let rtf_regex = regex::Regex::new(r#"\\field\{[^}]*HYPERLINK\s+"([^"]+)"[^}]*\}[^}]*\}"#).unwrap();
            for cap in rtf_regex.captures_iter(&processed.clone()) {
                if let Some(url) = cap.get(1) {
                    processed.push('\n');
                    processed.push_str(url.as_str());
                }
            }
        }

        // Handle markdown-style links: [text](URL)
        let markdown_regex = regex::Regex::new(r"\[([^\]]*)\]\(([^)]+)\)").unwrap();
        for cap in markdown_regex.captures_iter(&processed.clone()) {
            if let Some(url) = cap.get(2) {
                processed.push('\n');
                processed.push_str(url.as_str());
            }
        }

        // Handle HTML anchor tags: <a href="URL">text</a>
        let html_regex = regex::Regex::new(r#"<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>"#).unwrap();
        for cap in html_regex.captures_iter(&processed.clone()) {
            if let Some(url) = cap.get(1) {
                processed.push('\n');
                processed.push_str(url.as_str());
            }
        }

        // Handle URL-encoded characters
        processed = urlencoding::decode(&processed).unwrap_or(std::borrow::Cow::Borrowed(&processed)).to_string();

        processed
    }

    fn clean_url(&self, url: &str) -> Result<String> {
        let mut parsed_url = Url::parse(url)?;
        
        // Remove common tracking parameters
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

        // Expand shortened URLs (basic cases)
        let cleaned = parsed_url.to_string();
        Ok(self.expand_shortened_url(&cleaned))
    }

    fn expand_shortened_url(&self, url: &str) -> String {
        // Handle common YouTube short URLs
        if url.contains("youtu.be/") {
            if let Some(video_id) = url.split("youtu.be/").nth(1) {
                let video_id = video_id.split('?').next().unwrap_or(video_id).split('&').next().unwrap_or(video_id);
                return format!("https://www.youtube.com/watch?v={}", video_id);
            }
        }
        
        // Handle YouTube Shorts
        if url.contains("youtube.com/shorts/") {
            if let Some(video_id) = url.split("shorts/").nth(1) {
                let video_id = video_id.split('?').next().unwrap_or(video_id).split('&').next().unwrap_or(video_id);
                return format!("https://www.youtube.com/watch?v={}", video_id);
            }
        }

        // Handle Vimeo short URLs
        if url.contains("vimeo.com/") && !url.contains("/video/") {
            // Already in correct format
            return url.to_string();
        }

        // Handle TikTok short URLs
        if url.contains("vm.tiktok.com/") || url.contains("vt.tiktok.com/") {
            // These need HTTP resolution in real implementation
            // For now, return as-is since yt-dlp can handle them
            return url.to_string();
        }

        // Handle Twitter/X short URLs
        if url.contains("t.co/") {
            // These need HTTP resolution in real implementation
            // For now, return as-is
            return url.to_string();
        }

        // Handle Instagram short URLs
        if url.contains("instagr.am/") {
            return url.replace("instagr.am/", "instagram.com/");
        }

        // Handle other common URL shorteners
        let shorteners = ["bit.ly", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly"];
        for shortener in &shorteners {
            if url.contains(shortener) {
                // In a real implementation, we'd make HTTP HEAD requests to resolve these
                // For now, return as-is since yt-dlp might handle some of them
                return url.to_string();
            }
        }
        
        url.to_string()
    }

    fn detect_platform(&self, url: &str) -> Platform {
        // Sort patterns by priority and check each one
        for pattern in &self.platform_patterns {
            if pattern.regex.is_match(url) {
                return pattern.platform.clone();
            }
        }
        
        Platform::Generic
    }

    fn detect_playlist(&self, url: &str) -> bool {
        // YouTube playlist patterns
        if url.contains("youtube.com") && (url.contains("list=") || url.contains("playlist")) {
            return true;
        }
        
        // YouTube channel URLs (can be treated as playlists)
        if url.contains("youtube.com") && (url.contains("/channel/") || url.contains("/c/") || url.contains("/@")) {
            return true;
        }
        
        // Vimeo showcases/albums
        if url.contains("vimeo.com") && (url.contains("/showcase/") || url.contains("/album/")) {
            return true;
        }
        
        // TikTok user profiles (can be treated as playlists)
        if url.contains("tiktok.com") && url.contains("/@") && !url.contains("/video/") {
            return true;
        }
        
        // Twitch collections
        if url.contains("twitch.tv") && url.contains("/collection/") {
            return true;
        }
        
        false
    }

    fn validate_url(&self, url: &str) -> bool {
        // Basic URL validation
        match Url::parse(url) {
            Ok(parsed_url) => {
                // Check for valid scheme
                matches!(parsed_url.scheme(), "http" | "https") &&
                // Check for valid host
                parsed_url.host().is_some() &&
                // Basic domain validation
                !parsed_url.host_str().unwrap_or("").is_empty()
            }
            Err(_) => false,
        }
    }

    pub fn get_supported_platforms(&self) -> Vec<Platform> {
        let mut platforms: HashSet<_> = self.platform_patterns
            .iter()
            .map(|p| p.platform.clone())
            .collect();
        
        platforms.insert(Platform::Generic);
        platforms.into_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_youtube_url_extraction() {
        let extractor = URLExtractor::new().unwrap();
        let text = "Check this out: https://www.youtube.com/watch?v=dQw4w9WgXcQ and also https://youtu.be/jNQXAC9IVRw";
        
        let result = extractor.extract_urls(text).unwrap();
        
        assert_eq!(result.urls.len(), 2);
        assert!(result.urls.iter().all(|u| matches!(u.platform, Platform::YouTube)));
        assert!(result.urls.iter().all(|u| u.is_valid));
    }

    #[test]
    fn test_mixed_platforms() {
        let extractor = URLExtractor::new().unwrap();
        let text = "
            YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ
            Vimeo: https://vimeo.com/123456789
            TikTok: https://tiktok.com/@user/video/1234567890
        ";
        
        let result = extractor.extract_urls(text).unwrap();
        
        assert_eq!(result.urls.len(), 3);
        assert_eq!(result.valid_urls, 3);
    }

    #[test]
    fn test_duplicate_removal() {
        let extractor = URLExtractor::new().unwrap();
        let text = "
            https://www.youtube.com/watch?v=dQw4w9WgXcQ
            https://www.youtube.com/watch?v=dQw4w9WgXcQ
            https://youtu.be/dQw4w9WgXcQ
        ";
        
        let result = extractor.extract_urls(text).unwrap();
        
        // Should have 2 unique URLs (the youtu.be gets expanded to different format)
        assert!(result.duplicates_removed > 0 || result.urls.len() == 2);
    }

    #[test]
    fn test_url_cleaning() {
        let extractor = URLExtractor::new().unwrap();
        let text = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=share&fbclid=12345";
        
        let result = extractor.extract_urls(text).unwrap();
        
        assert_eq!(result.urls.len(), 1);
        assert!(!result.urls[0].url.contains("utm_source"));
        assert!(!result.urls[0].url.contains("fbclid"));
    }
}