import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { URLExtractionResult, Platform, VideoMetadata, ConversionFormat, DownloadStatus } from '../types';

// Progress update interface
interface DownloadProgress {
  id: string;
  status: DownloadStatus;
  progress: number;
  speed?: string;
  eta?: string;
  downloaded_bytes?: number;
  total_bytes?: number;
  error?: string;
  file_path?: string;
}

export class TauriAPI {
  /**
   * Extract URLs from text using the Rust backend
   */
  static async extractUrlsFromText(text: string): Promise<URLExtractionResult> {
    try {
      const result = await invoke<URLExtractionResult>('extract_urls_from_text', { text });
      return result;
    } catch (error) {
      console.error('Failed to extract URLs:', error);
      throw new Error(`URL extraction failed: ${error}`);
    }
  }

  /**
   * Get list of supported platforms
   */
  static async getSupportedPlatforms(): Promise<Platform[]> {
    try {
      const platforms = await invoke<Platform[]>('get_supported_platforms');
      return platforms;
    } catch (error) {
      console.error('Failed to get supported platforms:', error);
      throw new Error(`Failed to get platforms: ${error}`);
    }
  }

  /**
   * Validate a single URL
   */
  static async validateSingleUrl(url: string): Promise<boolean> {
    try {
      const isValid = await invoke<boolean>('validate_single_url', { url });
      return isValid;
    } catch (error) {
      console.error('Failed to validate URL:', error);
      return false;
    }
  }

  /**
   * Clean URL by removing tracking parameters
   */
  static async cleanUrl(url: string): Promise<string> {
    try {
      const cleanedUrl = await invoke<string>('clean_url', { url });
      return cleanedUrl;
    } catch (error) {
      console.error('Failed to clean URL:', error);
      return url; // Return original URL if cleaning fails
    }
  }

  /**
   * Test connection to backend
   */
  static async testConnection(): Promise<string> {
    try {
      const result = await invoke<string>('test_connection');
      return result;
    } catch (error) {
      console.error('Failed to test connection:', error);
      throw new Error(`Connection test failed: ${error}`);
    }
  }

  /**
   * Get video metadata for a URL
   */
  static async getVideoMetadata(url: string): Promise<VideoMetadata> {
    try {
      console.log('Frontend: Calling get_video_metadata with URL:', url);
      const metadata = await invoke<VideoMetadata>('get_video_metadata', { url });
      console.log('Frontend: Received metadata:', metadata);
      return metadata;
    } catch (error) {
      console.error('Failed to get video metadata:', error);
      throw new Error(`Metadata retrieval failed: ${error}`);
    }
  }

  /**
   * Start a video download
   */
  static async startDownload(
    id: string,
    url: string,
    quality: string,
    format: string,
    outputDir: string,
    convertFormat?: ConversionFormat,
    keepOriginal?: boolean
  ): Promise<void> {
    try {
      const params = {
        id,
        url,
        quality,
        format,
        outputDir: outputDir,
        convert_format: convertFormat,
        keep_original: keepOriginal,
      };
      
      console.log('=== TAURI API: Starting download with params ===');
      console.log('Parameters:', JSON.stringify(params, null, 2));
      
      await invoke('start_download', params);
      
      console.log('=== TAURI API: Download started successfully ===');
    } catch (error) {
      console.error('Failed to start download:', error);
      throw new Error(`Download start failed: ${error}`);
    }
  }

  /**
   * Cancel a download
   */
  static async cancelDownload(id: string): Promise<void> {
    try {
      await invoke('cancel_download', { id });
    } catch (error) {
      console.error('Failed to cancel download:', error);
      throw new Error(`Download cancellation failed: ${error}`);
    }
  }

  /**
   * Get default download directory
   */
  static async getDefaultDownloadDir(): Promise<string> {
    try {
      const dir = await invoke<string>('get_default_download_dir');
      return dir;
    } catch (error) {
      console.error('Failed to get default download directory:', error);
      throw new Error(`Failed to get download directory: ${error}`);
    }
  }

  /**
   * Set maximum concurrent downloads
   */
  static async setMaxConcurrentDownloads(max: number): Promise<void> {
    try {
      await invoke('set_max_concurrent_downloads', { max });
    } catch (error) {
      console.error('Failed to set max concurrent downloads:', error);
      throw new Error(`Failed to set max concurrent downloads: ${error}`);
    }
  }

  /**
   * Check if running with elevated privileges
   */
  static async checkPrivilegeElevation(): Promise<boolean> {
    try {
      const isElevated = await invoke<boolean>('check_privilege_elevation');
      return isElevated;
    } catch (error) {
      console.error('Failed to check privilege elevation:', error);
      return false;
    }
  }

  /**
   * Validate and sanitize file path
   */
  static async validateFilePath(path: string): Promise<string> {
    try {
      const sanitizedPath = await invoke<string>('validate_file_path', { path });
      return sanitizedPath;
    } catch (error) {
      console.error('Failed to validate file path:', error);
      throw new Error(`Invalid file path: ${error}`);
    }
  }

  /**
   * Expand tilde paths to absolute paths
   */
  static async expandPath(path: string): Promise<string> {
    try {
      const expandedPath = await invoke<string>('expand_path', { path });
      return expandedPath;
    } catch (error) {
      console.error('Failed to expand path:', error);
      throw new Error(`Path expansion failed: ${error}`);
    }
  }

  /**
   * Validate network URL against whitelist
   */
  static async validateNetworkUrl(url: string): Promise<boolean> {
    try {
      const isValid = await invoke<boolean>('validate_network_url', { url });
      return isValid;
    } catch (error) {
      console.error('Failed to validate network URL:', error);
      return false;
    }
  }

  /**
   * Extract individual video URLs from a playlist
   */
  static async extractPlaylistVideos(playlistUrl: string): Promise<string[]> {
    try {
      console.log('Frontend: Calling extract_playlist_videos with URL:', playlistUrl);
      const videoUrls = await invoke<string[]>('extract_playlist_videos', { playlistUrl: playlistUrl });
      console.log('Frontend: Received video URLs:', videoUrls);
      return videoUrls;
    } catch (error) {
      console.error('Failed to extract playlist videos:', error);
      throw new Error(`Playlist extraction failed: ${error}`);
    }
  }

  static async getBasicVideoMetadata(url: string): Promise<VideoMetadata> {
    try {
      console.log('Frontend: Calling get_basic_video_metadata with URL:', url);
      const metadata = await invoke<VideoMetadata>('get_basic_video_metadata', { url });
      console.log('Frontend: Received basic metadata:', metadata);
      return metadata;
    } catch (error) {
      console.error('Failed to get basic video metadata:', error);
      throw new Error(`Basic metadata retrieval failed: ${error}`);
    }
  }

  /**
   * Load video metadata with quality selection
   */
  static async loadVideoMetadata(id: string, url: string, quality: string): Promise<VideoMetadata> {
    try {
      console.log('Frontend: Loading video metadata for:', { id, url, quality });
      const metadata = await this.getVideoMetadata(url);
      console.log('Frontend: Loaded metadata for', id, ':', metadata);
      return metadata;
    } catch (error) {
      console.error('Failed to load video metadata:', error);
      throw new Error(`Metadata loading failed: ${error}`);
    }
  }

  /**
   * Listen to download progress updates
   */
  static async listenToProgressUpdates(callback: (progress: DownloadProgress) => void): Promise<() => void> {
    try {
      if (!isTauriEnvironment()) {
        console.warn('Not in Tauri environment, cannot listen to progress updates');
        return () => {};
      }

      console.log('=== FRONTEND: Setting up download progress listener ===');
      console.log('=== FRONTEND: Event name: download-progress ===');
      console.log('=== FRONTEND: Callback function:', typeof callback);
      
      const unlisten = await listen('download-progress', (event: any) => {
        console.log('=== FRONTEND: *** EVENT RECEIVED *** ===');
        console.log('=== FRONTEND: Raw event:', event);
        console.log('=== FRONTEND: Event payload:', event.payload);
        console.log('=== FRONTEND: Payload type:', typeof event.payload);
        
        const progress = event.payload as DownloadProgress;
        console.log('=== FRONTEND: Parsed progress:', progress);
        console.log('=== FRONTEND: Calling callback with progress ===');
        
        try {
          callback(progress);
          console.log('=== FRONTEND: Callback executed successfully ===');
        } catch (callbackError) {
          console.error('=== FRONTEND: Error in callback:', callbackError);
        }
      });

      console.log('=== FRONTEND: Download progress listener set up successfully ===');
      console.log('=== FRONTEND: Unlisten function type:', typeof unlisten);
      return unlisten;
    } catch (error) {
      console.error('Failed to set up progress listener:', error);
      return () => {};
    }
  }

  /**
   * Listen to conversion events
   */
  static async listenToConversionEvents(): Promise<{
    onStarted: (callback: (id: string) => void) => Promise<() => void>;
    onCompleted: (callback: (id: string) => void) => Promise<() => void>;
    onFailed: (callback: (id: string) => void) => Promise<() => void>;
  }> {
    if (!isTauriEnvironment()) {
      console.warn('Not in Tauri environment, cannot listen to conversion events');
      return {
        onStarted: async () => () => {},
        onCompleted: async () => () => {},
        onFailed: async () => () => {},
      };
    }

    return {
      onStarted: async (callback: (id: string) => void) => {
        return await listen('conversion-started', (event: any) => {
          console.log('=== FRONTEND: Conversion started:', event.payload);
          callback(event.payload as string);
        });
      },
      onCompleted: async (callback: (id: string) => void) => {
        return await listen('conversion-completed', (event: any) => {
          console.log('=== FRONTEND: Conversion completed:', event.payload);
          callback(event.payload as string);
        });
      },
      onFailed: async (callback: (id: string) => void) => {
        return await listen('conversion-failed', (event: any) => {
          console.log('=== FRONTEND: Conversion failed:', event.payload);
          callback(event.payload as string);
        });
      },
    };
  }

  /**
   * Generate a proper conversion filename following the pattern: Filename_RESOLUTION_CODEC.SUFFIX
   */
  static async generateConversionFilename(
    inputFilePath: string,
    quality: string,
    format: ConversionFormat
  ): Promise<string> {
    try {
      console.log('=== TAURI API: Generating conversion filename ===');
      console.log('Params:', { inputFilePath, quality, format });
      
      const outputPath = await invoke<string>('generate_conversion_filename', {
        inputFilePath,
        quality,
        format,
      });
      
      console.log('=== TAURI API: Generated filename:', outputPath);
      return outputPath;
    } catch (error) {
      console.error('Failed to generate conversion filename:', error);
      throw new Error(`Filename generation failed: ${error}`);
    }
  }

  /**
   * Convert a video file to a different format
   */
  static async convertVideoFile(
    id: string,
    inputFile: string,
    outputFile: string,
    format: ConversionFormat,
    keepOriginal?: boolean
  ): Promise<void> {
    try {
      console.log('=== TAURI API: Starting video conversion ===');
      console.log('Conversion params:', { id, inputFile, outputFile, format, keepOriginal });
      
      await invoke('convert_video_file', {
        id,
        inputFile,
        outputFile,
        format,
        keepOriginal,
      });
      
      console.log('=== TAURI API: Video conversion started successfully ===');
    } catch (error) {
      console.error('Failed to start video conversion:', error);
      throw new Error(`Video conversion failed: ${error}`);
    }
  }

  /**
   * Open download folder for a specific download
   */
  static async openDownloadFolder(id: string): Promise<void> {
    try {
      // For now, just open the default download directory
      // TODO: Implement backend command to open specific download folder
      console.log('Opening download folder for:', id);
      await invoke('open_download_folder', { id });
    } catch (error) {
      console.error('Failed to open download folder:', error);
      throw new Error(`Failed to open folder: ${error}`);
    }
  }

  /**
   * Check if a file exists at the given path
   */
  static async checkFileExists(filePath: string): Promise<boolean> {
    try {
      console.log('=== TAURI API: Checking if file exists:', filePath);
      const exists = await invoke<boolean>('check_file_exists', { filePath });
      console.log('=== TAURI API: File exists result:', exists);
      return exists;
    } catch (error) {
      console.error('Failed to check file existence:', error);
      return false; // Assume file doesn't exist if we can't check
    }
  }
}

// Helper function to check if we're running in Tauri (v2 compatible)
export function isTauriEnvironment(): boolean {
  try {
    // In Tauri v2, we try to access the invoke function
    // If it's available, we're in Tauri environment
    return typeof invoke === 'function';
  } catch {
    return false;
  }
}