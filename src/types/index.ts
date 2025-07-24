export interface ExtractedUrl {
  url: string;
  platform: Platform;
  title?: string;
  is_valid: boolean;
  original_text: string;
  is_playlist: boolean;
  playlist_count?: number;
}

export enum Platform {
  YouTube = 'youtube',
  Vimeo = 'vimeo',
  Twitch = 'twitch',
  TikTok = 'tiktok',
  Instagram = 'instagram',
  Twitter = 'twitter',
  Facebook = 'facebook',
  Generic = 'generic',
}

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  duration: string;
  thumbnail: string;
  platform: Platform;
  status: DownloadStatus;
  progress: number;
  speed?: string;
  eta?: string;
  quality: string;
  format: string;
  size: string;
  error?: string;
  metadataLoading?: boolean;
  downloadedBytes?: number;
  totalBytes?: number;
  filePath?: string;
  isDuplicate?: boolean;
  duplicateType?: 'url' | 'file';
  duplicateAction?: 'overwrite' | 'skip' | 'rename';
  shouldAutoConvert?: boolean;
}

export enum DownloadStatus {
  Queued = 'queued',
  Downloading = 'downloading',
  Converting = 'converting',
  Completed = 'completed',
  Failed = 'failed',
  Paused = 'paused',
  Cancelled = 'cancelled',
  Duplicate = 'duplicate',
  Skipped = 'skipped',
}

export enum ConversionFormat {
  H264 = 'h264',
  DNxHR = 'dnxhr',
  ProRes = 'prores',
  MP3 = 'mp3',
}

export interface DownloadSettings {
  quality: string;
  format: string;
  outputPath: string;
  parallelDownloads: number;
  conversionFormat?: ConversionFormat;
  keepOriginal: boolean;
}

export interface URLExtractionResult {
  urls: ExtractedUrl[];
  total_found: number;
  valid_urls: number;
  duplicates_removed: number;
}

export interface PlatformPattern {
  platform: Platform;
  regex: RegExp;
  priority: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  metadata?: {
    title?: string;
    duration?: string;
    thumbnail?: string;
    quality?: string[];
  };
}

export interface VideoMetadata {
  title: string;
  duration?: string;
  uploader?: string;
  description?: string;
  thumbnail?: string;
  view_count?: number;
  upload_date?: string;
  formats: VideoFormat[];
}

export interface VideoFormat {
  format_id: string;
  ext: string;
  resolution?: string;
  filesize?: number;
  vcodec?: string;
  acodec?: string;
  abr?: number;
  vbr?: number;
}

export interface DownloadProgress {
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

export interface DownloadRequest {
  id: string;
  url: string;
  quality: string;
  format: string;
  output_dir: string;
  convert_format?: ConversionFormat;
  keep_original: boolean;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType?: 'url' | 'file';
  existingItem?: DownloadItem;
  existingFilePath?: string;
  settingsMatch?: boolean;
}

export interface DuplicateHandlingOptions {
  onUrlDuplicate: 'skip' | 'allow' | 'ask';
  onFileDuplicate: 'overwrite' | 'skip' | 'rename' | 'ask';
  showDuplicateWarnings: boolean;
}