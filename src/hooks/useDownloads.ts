import { useState, useCallback, useEffect } from 'react';
import { DownloadItem, DownloadStatus, ExtractedUrl, VideoMetadata, ConversionFormat, DownloadProgress, DuplicateCheckResult } from '../types';
import { TauriAPI, isTauriEnvironment } from '../services/tauri-api';

// Duplicate confirmation state
interface DuplicateConfirmation {
  url: ExtractedUrl;
  duplicateCheck: DuplicateCheckResult;
  resolve: (action: 'overwrite' | 'skip' | 'rename' | 'allow') => void;
}

// Helper function to convert quality to resolution suffix for filenames
const getResolutionSuffix = (quality: string): string => {
  const normalizedQuality = quality.toLowerCase();
  
  // Handle common quality formats
  if (normalizedQuality.includes('2160') || normalizedQuality.includes('4k')) {
    return '_2160';
  }
  if (normalizedQuality.includes('1440')) {
    return '_1440';
  }
  if (normalizedQuality.includes('1080')) {
    return '_1080';
  }
  if (normalizedQuality.includes('720')) {
    return '_720';
  }
  if (normalizedQuality.includes('480')) {
    return '_480';
  }
  if (normalizedQuality.includes('360')) {
    return '_360';
  }
  if (normalizedQuality.includes('240')) {
    return '_240';
  }
  if (normalizedQuality.includes('144')) {
    return '_144';
  }
  
  // Handle special cases
  if (normalizedQuality.includes('best') || normalizedQuality.includes('highest')) {
    return '_best';
  }
  if (normalizedQuality.includes('worst') || normalizedQuality.includes('lowest')) {
    return '_worst';
  }
  
  // Default case - use quality as-is but sanitized
  return '_' + quality.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
};

// Settings interface
interface AppSettings {
  maxConcurrentDownloads: number;
  defaultQuality: string;
  outputDirectory: string;
  conversionFormat?: ConversionFormat;
  keepOriginal: boolean;
  notificationsEnabled: boolean;
  onUrlDuplicate: 'skip' | 'allow' | 'ask';
  onFileDuplicate: 'overwrite' | 'skip' | 'rename' | 'ask';
  showDuplicateWarnings: boolean;
  autoConvertAfterDownload: boolean;
}

const defaultSettings: AppSettings = {
  maxConcurrentDownloads: 5,
  defaultQuality: '1080p',
  outputDirectory: '~/Desktop/GrabZilla',
  keepOriginal: true,
  notificationsEnabled: true,
  onUrlDuplicate: 'ask',
  onFileDuplicate: 'ask',
  showDuplicateWarnings: true,
  autoConvertAfterDownload: false,
};

// Settings persistence helpers
const saveSettings = (settings: AppSettings) => {
  try {
    localStorage.setItem('grabzilla-settings', JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save settings:', error);
  }
};

const loadSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem('grabzilla-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { 
        ...defaultSettings, 
        ...parsed,
        // Ensure conversionFormat is properly typed
        conversionFormat: parsed.conversionFormat ? parsed.conversionFormat as ConversionFormat : undefined
      };
    }
  } catch (error) {
    console.warn('Failed to load settings:', error);
  }
  return defaultSettings;
};

// Helper function to normalize quality consistently
const normalizeQuality = (quality: string): string => {
  if (quality === 'best') return 'Best Available';
  if (quality === 'worst') return 'Worst';
  return quality;
};

// Check for duplicates in existing downloads and files
const checkForDuplicates = async (url: ExtractedUrl, existingDownloads: DownloadItem[], outputDirectory: string, currentSettings: AppSettings): Promise<DuplicateCheckResult> => {
  console.log(`=== FRONTEND: checkForDuplicates called for URL: ${url.url} ===`);
  console.log(`=== FRONTEND: Current settings - Raw quality: "${currentSettings.defaultQuality}" ===`);
  console.log(`=== FRONTEND: Existing downloads count: ${existingDownloads.length} ===`);
  if (existingDownloads.length > 0) {
    console.log(`=== FRONTEND: Existing downloads:`, existingDownloads.map(d => ({ url: d.url, quality: d.quality, autoConvert: d.shouldAutoConvert })));
  }
  // Check for URL duplicates in existing queue
  const existingItem = existingDownloads.find(item => item.url === url.url);
  if (existingItem) {
    // Compare the key settings that affect the download
    const existingQuality = existingItem.quality;
    // Normalize the new quality consistently
    const newQuality = normalizeQuality(currentSettings.defaultQuality);
    const existingAutoConvert = existingItem.shouldAutoConvert || false;
    const newAutoConvert = currentSettings.autoConvertAfterDownload && !!currentSettings.conversionFormat;
    
    console.log(`=== FRONTEND: URL duplicate found - comparing settings ===`);
    console.log(`=== FRONTEND: Existing quality: "${existingQuality}" vs New quality: "${newQuality}" (normalized) ===`);
    console.log(`=== FRONTEND: Existing auto-convert: ${existingAutoConvert} vs New auto-convert: ${newAutoConvert} ===`);
    
    // Settings match if quality AND auto-convert settings are the same
    const qualityMatches = existingQuality === newQuality;
    const autoConvertMatches = existingAutoConvert === newAutoConvert;
    const settingsMatch = qualityMatches && autoConvertMatches;
    
    console.log(`=== FRONTEND: Quality matches: ${qualityMatches}, Auto-convert matches: ${autoConvertMatches}, Overall match: ${settingsMatch} ===`);
    
    // Only consider it a duplicate if ALL settings match
    if (settingsMatch) {
      console.log(`=== FRONTEND: Settings match - treating as duplicate ===`);
      return {
        isDuplicate: true,
        duplicateType: 'url',
        existingItem,
        settingsMatch: true,
      };
    } else {
      // Same URL but different settings - allow as new download
      console.log(`=== FRONTEND: Settings differ - allowing as new download ===`);
      return { isDuplicate: false };
    }
  }

  // Check for file duplicates (if we have metadata with title)
  if (url.title && isTauriEnvironment()) {
    try {
      // Generate potential file paths that might exist based on current settings
      const potentialExtensions = ['mp4', 'webm', 'mkv', 'mov', 'avi'];
      const sanitizedTitle = url.title.replace(/[<>:"/\\|?*]/g, '_'); // Basic sanitization
      
      // Check for files with current quality settings
      const qualityTag = currentSettings.defaultQuality !== 'Best Available' ? `_${currentSettings.defaultQuality}` : '';
      const conversionTag = currentSettings.conversionFormat ? `_${currentSettings.conversionFormat}` : '';
      
      for (const ext of potentialExtensions) {
        // Check exact match with current settings
        const exactPath = `${outputDirectory}/${sanitizedTitle}${qualityTag}${conversionTag}.${ext}`;
        // Check without quality/conversion tags
        const basicPath = `${outputDirectory}/${sanitizedTitle}.${ext}`;
        
        try {
          let fileExists = await TauriAPI.checkFileExists(exactPath);
          let matchingPath = exactPath;
          
          if (!fileExists) {
            fileExists = await TauriAPI.checkFileExists(basicPath);
            matchingPath = basicPath;
          }
          
          if (fileExists) {
            // Determine if the existing file matches current settings
            const fileHasQuality = matchingPath.includes(qualityTag);
            const fileHasConversion = matchingPath.includes(conversionTag);
            const settingsMatch = (qualityTag === '' || fileHasQuality) && 
                                (conversionTag === '' || fileHasConversion);
            
            return {
              isDuplicate: true,
              duplicateType: 'file',
              existingFilePath: matchingPath,
              settingsMatch,
            };
          }
        } catch (error) {
          // File doesn't exist or can't be checked, continue
          continue;
        }
      }
    } catch (error) {
      console.warn('Failed to check for file duplicates:', error);
    }
  }

  return { isDuplicate: false };
};

// Determine the actual quality/resolution that will be downloaded
const determineActualQuality = (metadata: VideoMetadata, requestedQuality: string): string => {
  if (!metadata.formats || metadata.formats.length === 0) {
    return requestedQuality;
  }

  // If "Best Available" was requested, find the highest resolution
  if (requestedQuality === 'Best Available' || requestedQuality === 'best') {
    const bestFormat = metadata.formats
      .filter(format => format.resolution && format.resolution !== 'audio only')
      .sort((a, b) => {
        // Extract height from resolution (e.g., "1920x1080" -> 1080)
        const getHeight = (res: string) => {
          const match = res.match(/\d+x(\d+)/);
          return match ? parseInt(match[1]) : 0;
        };
        return getHeight(b.resolution || '') - getHeight(a.resolution || '');
      })[0];
    
    if (bestFormat?.resolution) {
      // Extract height and format as "1080p", "720p", etc.
      const match = bestFormat.resolution.match(/\d+x(\d+)/);
      if (match) {
        return `${match[1]}p`;
      }
      return bestFormat.resolution;
    }
    return 'Best Available';
  }

  // If "Worst" was requested, find the lowest resolution
  if (requestedQuality === 'Worst' || requestedQuality === 'worst') {
    const worstFormat = metadata.formats
      .filter(format => format.resolution && format.resolution !== 'audio only')
      .sort((a, b) => {
        // Extract height from resolution (e.g., "1920x1080" -> 1080)
        const getHeight = (res: string) => {
          const match = res.match(/\d+x(\d+)/);
          return match ? parseInt(match[1]) : 0;
        };
        return getHeight(a.resolution || '') - getHeight(b.resolution || ''); // Sort ascending for worst
      })[0];
    
    if (worstFormat?.resolution) {
      // Extract height and format as "1080p", "720p", etc.
      const match = worstFormat.resolution.match(/\d+x(\d+)/);
      if (match) {
        return `${match[1]}p`;
      }
      return worstFormat.resolution;
    }
    return 'Worst';
  }

  // For specific quality requests (like "1080p"), check if it's available
  const requestedHeight = requestedQuality.replace('p', '');
  const availableFormat = metadata.formats.find(format => 
    format.resolution && format.resolution.includes(`x${requestedHeight}`)
  );

  if (availableFormat?.resolution) {
    return requestedQuality;
  }

  // If requested quality not available, find the closest lower quality
  const availableHeights = metadata.formats
    .filter(format => format.resolution && format.resolution !== 'audio only')
    .map(format => {
      const match = format.resolution!.match(/\d+x(\d+)/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(height => height > 0)
    .sort((a, b) => b - a); // Sort descending

  const targetHeight = parseInt(requestedHeight);
  const fallbackHeight = availableHeights.find(height => height <= targetHeight) || availableHeights[availableHeights.length - 1];
  
  return fallbackHeight ? `${fallbackHeight}p` : requestedQuality;
};

// Create download item from extracted URL
const createDownloadItem = (url: ExtractedUrl, index: number, defaultQuality: string, metadata?: VideoMetadata, shouldAutoConvert?: boolean): DownloadItem => {
  const normalizedQuality = normalizeQuality(defaultQuality);
  console.log(`=== FRONTEND: createDownloadItem - Raw quality: "${defaultQuality}" -> Normalized: "${normalizedQuality}" ===`);
  
  return {
    id: `download-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`, // More unique ID for same URL different settings
    url: url.url,
    title: metadata?.title || url.title || (url.is_playlist ? `Playlist ${index + 1}` : `Video ${index + 1}`),
    duration: metadata?.duration || (url.is_playlist && url.playlist_count ? `${url.playlist_count} videos` : '0:00'),
    thumbnail: metadata?.thumbnail || `https://via.placeholder.com/120x68/333/fff?text=${url.platform.toUpperCase()}${url.is_playlist ? '+PL' : ''}`,
    platform: url.platform,
    status: DownloadStatus.Queued,
    progress: 0,
    speed: '',
    eta: '',
    quality: normalizedQuality,
    format: 'MP4',
    size: '',
    error: undefined,
    metadataLoading: !metadata, // Set to true if no metadata provided initially
    downloadedBytes: undefined,
    totalBytes: undefined,
    shouldAutoConvert: shouldAutoConvert || false,
  };
};

export function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [duplicateConfirmation, setDuplicateConfirmation] = useState<DuplicateConfirmation | null>(null);

  // Initialize proper output directory from backend
  useEffect(() => {
    const initializeOutputDirectory = async () => {
      if (isTauriEnvironment() && settings.outputDirectory === '~/Desktop/GrabZilla') {
        try {
          console.log('=== FRONTEND: Initializing output directory from backend ===');
          const defaultDir = await TauriAPI.getDefaultDownloadDir();
          console.log('=== FRONTEND: Backend default directory:', defaultDir);
          
          setSettings(prev => ({
            ...prev,
            outputDirectory: defaultDir
          }));
        } catch (error) {
          console.error('=== FRONTEND: Failed to get default directory from backend:', error);
          // Fall back to expanding the tilde path
          try {
            const expandedPath = await TauriAPI.expandPath(settings.outputDirectory);
            setSettings(prev => ({
              ...prev,
              outputDirectory: expandedPath
            }));
          } catch (expandError) {
            console.error('=== FRONTEND: Failed to expand tilde path:', expandError);
          }
        }
      }
    };

    initializeOutputDirectory();
  }, []); // Run once on mount

  // Save settings whenever they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Convert video function (defined early to avoid dependency issues)
  const convertVideo = useCallback(async (id: string) => {
    const item = downloads.find(d => d.id === id);
    if (!item) return;

    if (!settings.conversionFormat) {
      console.error('=== FRONTEND: No conversion format set ===');
      return;
    }

    if (!item.filePath) {
      console.error('=== FRONTEND: No file path available for conversion ===');
      return;
    }

    console.log(`=== FRONTEND: Starting conversion for ${item.title} ===`);

    setDownloads(prev => prev.map(d => 
      d.id === id 
        ? { ...d, status: DownloadStatus.Converting, progress: 0 }
        : d
    ));

    if (isTauriEnvironment()) {
      try {
        // Use the actual downloaded file path
        const inputFile = item.filePath;
        
        // Generate proper output filename using backend function
        // This follows the pattern: Filename_RESOLUTION_CODEC.SUFFIX
        const outputFile = await TauriAPI.generateConversionFilename(
          inputFile,
          item.quality,
          settings.conversionFormat
        );

        console.log(`=== FRONTEND: Converting ${inputFile} to ${outputFile} ===`);
        console.log(`=== FRONTEND: Using quality: ${item.quality}, format: ${settings.conversionFormat} ===`);
        console.log(`=== FRONTEND: Expected resolution suffix in filename: ${getResolutionSuffix(item.quality)} ===`);

        await TauriAPI.convertVideoFile(
          id,
          inputFile,
          outputFile,
          settings.conversionFormat,
          settings.keepOriginal
        );
        console.log(`=== FRONTEND: Conversion request sent to backend for ${item.title} ===`);
      } catch (error) {
        console.error(`Failed to start conversion for ${id}:`, error);
        setDownloads(prev => prev.map(d => 
          d.id === id 
            ? { 
                ...d, 
                status: DownloadStatus.Failed, 
                error: error instanceof Error ? error.message : 'Conversion failed'
              }
            : d
        ));
      }
    } else {
      // Simulate conversion for development
      setTimeout(() => {
        setDownloads(prev => prev.map(d => 
          d.id === id ? { ...d, status: DownloadStatus.Completed, progress: 100 } : d
        ));
      }, 2000);
    }
  }, [downloads, settings.conversionFormat, settings.keepOriginal]);

  // Listen for download progress updates
  useEffect(() => {
    console.log('=== FRONTEND: useDownloads effect - setting up progress listener ===');
    
    const setupListener = async () => {
      try {
        console.log('=== FRONTEND: Calling TauriAPI.listenToProgressUpdates ===');
        const unlisten = await TauriAPI.listenToProgressUpdates((progress: DownloadProgress) => {
          console.log('=== FRONTEND: *** PROGRESS CALLBACK TRIGGERED *** ===');
          console.log('=== FRONTEND: Received progress update:', progress);
          console.log('=== FRONTEND: Progress ID:', progress.id, 'Status:', progress.status, 'Progress:', progress.progress);
          
          setDownloads(prev => {
            console.log('=== FRONTEND: Current downloads before update:', prev.map(d => ({id: d.id, status: d.status})));
            
            const updated = prev.map(download => 
              download.id === progress.id 
                ? {
                    ...download,
                    status: progress.status,
                    progress: progress.progress,
                    speed: progress.speed,
                    eta: progress.eta,
                    downloadedBytes: progress.downloaded_bytes,
                    totalBytes: progress.total_bytes,
                    error: progress.error,
                    filePath: progress.file_path,
                  }
                : download
            );
            
            // Log if we found and updated the download
            const foundDownload = prev.find(d => d.id === progress.id);
            if (foundDownload) {
              console.log('=== FRONTEND: Updated download:', foundDownload.title, 'from', foundDownload.status, 'to', progress.status);
              
              // Auto-convert if enabled and download just completed
              if (foundDownload.status !== DownloadStatus.Completed && 
                  progress.status === DownloadStatus.Completed && 
                  settings.autoConvertAfterDownload && 
                  settings.conversionFormat) {
                console.log('=== FRONTEND: Auto-converting completed download:', foundDownload.title);
                // Mark for auto-conversion - will be handled by a separate effect
                setDownloads(prevDownloads => prevDownloads.map(d => 
                  d.id === progress.id 
                    ? { ...d, shouldAutoConvert: true }
                    : d
                ));
              }
            } else {
              console.warn('=== FRONTEND: No download found with ID:', progress.id);
              console.log('=== FRONTEND: Available download IDs:', prev.map(d => d.id));
            }
            
            console.log('=== FRONTEND: Downloads after update:', updated.map(d => ({id: d.id, status: d.status})));
            return updated;
          });
        });
        
        console.log('=== FRONTEND: Progress listener setup completed ===');
        return unlisten;
      } catch (error) {
        console.error('=== FRONTEND: Error setting up progress listener:', error);
        return () => {};
      }
    };
    
    const unlistenPromise = setupListener();

    return () => {
      console.log('=== FRONTEND: Cleaning up progress listener ===');
      unlistenPromise.then((fn: () => void) => fn?.());
    };
  }, [settings.autoConvertAfterDownload, settings.conversionFormat]);

  // Handle auto-conversion for completed downloads
  useEffect(() => {
    const itemsToAutoConvert = downloads.filter(d => d.shouldAutoConvert && d.status === DownloadStatus.Completed);
    
    if (itemsToAutoConvert.length > 0) {
      console.log(`=== FRONTEND: Auto-converting ${itemsToAutoConvert.length} completed downloads ===`);
      
      itemsToAutoConvert.forEach(item => {
        console.log(`=== FRONTEND: Starting auto-conversion for ${item.title} ===`);
        
        // Clear the shouldAutoConvert flag first
        setDownloads(prev => prev.map(d => 
          d.id === item.id ? { ...d, shouldAutoConvert: false } : d
        ));
        
        // Start conversion after a small delay
        setTimeout(() => {
          convertVideo(item.id);
        }, 100);
      });
    }
  }, [downloads, convertVideo]);

  const addDownloads = useCallback(async (urls: ExtractedUrl[]) => {
    console.log('=== FRONTEND: addDownloads called with URLs:', urls);
    
    // Test connection first if in Tauri environment
    if (isTauriEnvironment()) {
      console.log('=== FRONTEND: In Tauri environment, testing connection ===');
      try {
        const connectionTest = await TauriAPI.testConnection();
        console.log('=== FRONTEND: Connection test result:', connectionTest);
      } catch (error) {
        console.error('=== FRONTEND: Connection test failed:', error);
      }
    } else {
      console.log('=== FRONTEND: NOT in Tauri environment ===');
    }
    
    // Check for duplicates and handle according to settings
    const processedUrls: ExtractedUrl[] = [];
    const duplicateItems: DownloadItem[] = [];
    
    for (const url of urls) {
      console.log(`=== FRONTEND: Checking duplicates for URL: ${url.url} ===`);
      console.log(`=== FRONTEND: Current settings - Quality: "${settings.defaultQuality}", Auto-convert: ${settings.autoConvertAfterDownload && !!settings.conversionFormat} ===`);
      
      const duplicateCheck = await checkForDuplicates(url, downloads, settings.outputDirectory, settings);
      
      if (duplicateCheck.isDuplicate) {
        console.log(`=== FRONTEND: Duplicate detected for ${url.url} ===`);
        console.log(`=== FRONTEND: Duplicate type: ${duplicateCheck.duplicateType} ===`);
        
        const relevantSetting = duplicateCheck.duplicateType === 'url' ? settings.onUrlDuplicate : settings.onFileDuplicate;
        
        if (relevantSetting === 'skip') {
          console.log(`=== FRONTEND: Skipping duplicate ${duplicateCheck.duplicateType}: ${url.url} ===`);
          // Don't add anything to the queue when skipping
          continue;
        } else if (relevantSetting === 'allow' || relevantSetting === 'overwrite') {
          console.log(`=== FRONTEND: Allowing duplicate ${duplicateCheck.duplicateType}: ${url.url} ===`);
          processedUrls.push(url);
        } else if (relevantSetting === 'ask') {
          console.log(`=== FRONTEND: User confirmation needed for duplicate: ${url.url} ===`);
          
          // Show duplicate confirmation modal and wait for user response
          const userAction = await new Promise<'overwrite' | 'skip' | 'rename' | 'allow'>((resolve) => {
            setDuplicateConfirmation({
              url,
              duplicateCheck,
              resolve,
            });
          });
          
          console.log(`=== FRONTEND: User selected action: ${userAction} ===`);
          
          if (userAction === 'skip') {
            console.log(`=== FRONTEND: Skipping duplicate ${duplicateCheck.duplicateType}: ${url.url} ===`);
            // Don't add anything to the queue when skipping
            continue;
          } else if (userAction === 'allow' || userAction === 'overwrite' || userAction === 'rename') {
            const item = createDownloadItem(
              url, 
              downloads.length + processedUrls.length, 
              settings.defaultQuality,
              undefined, // metadata
              settings.autoConvertAfterDownload && !!settings.conversionFormat // shouldAutoConvert
            );
            if (userAction === 'rename') {
              item.duplicateAction = 'rename';
            } else if (userAction === 'overwrite') {
              item.duplicateAction = 'overwrite';
            }
            processedUrls.push(url);
          }
        }
      } else {
        processedUrls.push(url);
      }
    }
    
    // Add processed URLs to queue
    const newDownloads: DownloadItem[] = processedUrls.map((url, i) => 
      createDownloadItem(
        url, 
        downloads.length + i, 
        settings.defaultQuality,
        undefined, // metadata will be fetched later
        settings.autoConvertAfterDownload && !!settings.conversionFormat // shouldAutoConvert
      )
    );
    
    // Add new downloads to state (skipped duplicates are not added)
    const allNewItems = [...newDownloads, ...duplicateItems];
    
    console.log('=== FRONTEND: Adding downloads to state:', allNewItems);
    setDownloads(prev => [...prev, ...allNewItems]);
    
    // Skip metadata fetch if not in Tauri environment
    if (!isTauriEnvironment()) {
      console.log('=== FRONTEND: Not in Tauri environment, skipping metadata fetch ===');
      // Set metadataLoading to false for all items since we won't fetch any metadata
      setDownloads(prev => prev.map(download => 
        newDownloads.some(newDl => newDl.id === download.id)
          ? { ...download, metadataLoading: false }
          : download
      ));
      return;
    }
    
    // Process metadata with concurrency control for better performance
    // Dynamically detect CPU cores and scale for I/O-bound tasks
    const detectedCores = navigator.hardwareConcurrency || 4; // Fallback to 4 if detection fails
    const ioBoundMultiplier = 2; // I/O-bound tasks can benefit from more concurrency than CPU cores
    const optimalConcurrency = detectedCores * ioBoundMultiplier;
    
    // Apply reasonable bounds: min 3 (proven working), max 12 (prevent overwhelming backend)
    const CONCURRENT_METADATA_FETCHES = Math.max(3, Math.min(12, optimalConcurrency));
    
    console.log(`=== FRONTEND: CPU Detection ===`);
    console.log(`=== FRONTEND: Detected ${detectedCores} CPU cores ===`);
    console.log(`=== FRONTEND: Optimal concurrency: ${detectedCores} cores × ${ioBoundMultiplier} = ${optimalConcurrency} ===`);
    console.log(`=== FRONTEND: Using ${CONCURRENT_METADATA_FETCHES} concurrent metadata fetches (bounded 3-12) ===`);
    console.log(`=== FRONTEND: Processing ${urls.length} videos with max ${CONCURRENT_METADATA_FETCHES} concurrent fetches ===`);
    
    // Helper function to process a single video's metadata
    const processVideoMetadata = async (url: ExtractedUrl, index: number) => {
      const downloadId = newDownloads[index].id;
      console.log(`=== FRONTEND: Processing metadata for URL ${index + 1}/${urls.length}: ${url.url} ===`);
      
      let metadata: VideoMetadata | undefined;
      
      try {
        console.log('=== FRONTEND: Calling getVideoMetadata ===');
        metadata = await TauriAPI.getVideoMetadata(url.url);
        console.log('=== FRONTEND: Metadata received:', metadata);
        
        // Determine actual quality/resolution from metadata
        const currentDownload = newDownloads[index];
        const actualQuality = determineActualQuality(metadata!, currentDownload.quality);
        
        // Update the specific download item with fetched metadata
        setDownloads(prev => prev.map(download => 
          download.id === downloadId 
            ? {
                ...download,
                title: metadata!.title,
                duration: metadata!.duration || '0:00',
                thumbnail: metadata!.thumbnail || download.thumbnail,
                quality: actualQuality,
                metadataLoading: false,
              }
            : download
        ));
        
      } catch (error) {
        console.error(`=== FRONTEND: Failed to get metadata for ${url.url}:`, error);
        // Check if it's a bot detection error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Sign in to confirm you\'re not a bot') || 
            errorMessage.includes('bot detection') ||
            errorMessage.includes('cookies')) {
          console.warn(`=== FRONTEND: Bot detection for ${url.url}, trying basic metadata ===`);
          
          // Try the lightweight metadata method first
          try {
            console.log('=== FRONTEND: Attempting basic metadata fetch ===');
            metadata = await TauriAPI.getBasicVideoMetadata(url.url);
            console.log('=== FRONTEND: Basic metadata successful:', metadata);
            
            // Update with basic metadata
            setDownloads(prev => prev.map(download => 
              download.id === downloadId 
                ? {
                    ...download,
                    title: metadata!.title,
                    duration: metadata!.duration || '0:00',
                    thumbnail: metadata!.thumbnail || download.thumbnail,
                    metadataLoading: false,
                  }
                : download
            ));
            
          } catch (basicError) {
            console.warn('=== FRONTEND: Basic metadata also failed, using manual fallback ===');
            // Create basic metadata from URL for bot-detected videos
            const hostname = new URL(url.url).hostname;
            const videoId = url.url.match(/(?:v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
            const fallbackMetadata = {
              title: `Video from ${hostname}`,
              duration: '0:00',
              thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : `https://via.placeholder.com/120x68/333/fff?text=${url.platform.toUpperCase()}`,
            };
            
            // Update with fallback metadata
            setDownloads(prev => prev.map(download => 
              download.id === downloadId 
                ? {
                    ...download,
                    title: fallbackMetadata.title,
                    duration: fallbackMetadata.duration,
                    thumbnail: fallbackMetadata.thumbnail,
                    metadataLoading: false,
                  }
                : download
            ));
          }
        } else {
          // For other errors, still provide a fallback
          const hostname = new URL(url.url).hostname;
          setDownloads(prev => prev.map(download => 
            download.id === downloadId 
              ? {
                  ...download,
                  title: `Video from ${hostname}`,
                  duration: '0:00',
                  metadataLoading: false,
                }
              : download
          ));
        }
      }
    };
    
    // Process videos in batches with concurrency control
    const processInBatches = async () => {
      const totalVideos = urls.length;
      const totalBatches = Math.ceil(totalVideos / CONCURRENT_METADATA_FETCHES);
      let processedCount = 0;
      const startTime = Date.now();
      
      console.log(`=== FRONTEND: Starting concurrent metadata processing ===`);
      console.log(`=== FRONTEND: ${totalVideos} videos, ${totalBatches} batches, max ${CONCURRENT_METADATA_FETCHES} concurrent ===`);
      
      // Create batches of URLs to process concurrently
      for (let i = 0; i < totalVideos; i += CONCURRENT_METADATA_FETCHES) {
        const batch = urls.slice(i, i + CONCURRENT_METADATA_FETCHES);
        const batchNumber = Math.floor(i / CONCURRENT_METADATA_FETCHES) + 1;
        const batchStart = Date.now();
        
        const batchPromises = batch.map((url, batchIndex) => 
          processVideoMetadata(url, i + batchIndex)
        );
        
        console.log(`=== FRONTEND: Processing batch ${batchNumber}/${totalBatches} (videos ${i + 1}-${Math.min(i + CONCURRENT_METADATA_FETCHES, totalVideos)}) ===`);
        
        // Wait for all videos in this batch to complete before starting the next batch
        await Promise.all(batchPromises);
        
        processedCount += batch.length;
        const batchTime = Date.now() - batchStart;
        console.log(`=== FRONTEND: Batch ${batchNumber} completed in ${batchTime}ms - Progress: ${processedCount}/${totalVideos} ===`);
      }
      
      const totalTime = Date.now() - startTime;
      const averageTimePerVideo = totalTime / totalVideos;
      const theoreticalSequentialTime = averageTimePerVideo * totalVideos;
      const speedupFactor = (theoreticalSequentialTime / totalTime).toFixed(1);
      
      console.log(`=== FRONTEND: All ${totalVideos} videos processed in ${totalTime}ms ===`);
      console.log(`=== FRONTEND: Average time per video: ${averageTimePerVideo.toFixed(1)}ms ===`);
      console.log(`=== FRONTEND: Performance: ${speedupFactor}x speedup with ${CONCURRENT_METADATA_FETCHES}-way concurrency (${detectedCores} CPU cores detected) ===`);
      console.log(`=== FRONTEND: System utilization: ${((CONCURRENT_METADATA_FETCHES / detectedCores) * 100).toFixed(1)}% of available cores ===`);
    };
    
    // Start processing batches (don't await, let it run in background)
    processInBatches().catch(error => {
      console.error('=== FRONTEND: Error processing video batches:', error);
    });
    
  }, [downloads.length, settings]);

  const startDownload = useCallback(async (id: string) => {
    const item = downloads.find(d => d.id === id);
    if (!item) return;

    // Ensure we have a valid output directory
    if (!settings.outputDirectory) {
      console.error('=== FRONTEND: No output directory set, cannot start download ===');
      setDownloads(prev => prev.map(d => 
        d.id === id 
          ? { 
              ...d, 
              status: DownloadStatus.Failed, 
              error: 'Output directory not available. Please check settings.'
            }
          : d
      ));
      return;
    }

    console.log(`=== FRONTEND: Starting download for ${item.title} ===`);
    console.log(`=== FRONTEND: Download directory: ${settings.outputDirectory} ===`);
    console.log(`=== FRONTEND: Using quality: ${item.quality} (individual item quality, not default) ===`);

    setDownloads(prev => prev.map(d => 
      d.id === id 
        ? { ...d, status: DownloadStatus.Downloading, error: undefined }
        : d
    ));

    if (isTauriEnvironment()) {
      try {
        await TauriAPI.startDownload(
          id,
          item.url,
          item.quality,                // ← Use item's specific quality (e.g., "1080p", "Best Available", "worst")
          item.format,                 // ← format (e.g., "MP4")
          settings.outputDirectory,    // ← output directory
          settings.conversionFormat,
          settings.keepOriginal
        );
        console.log(`=== FRONTEND: Download request sent to backend for ${item.title} ===`);
        console.log(`=== FRONTEND: Backend should generate filename with quality suffix: ${getResolutionSuffix(item.quality)} ===`);
      } catch (error) {
        console.error(`Failed to start download for ${id}:`, error);
        setDownloads(prev => prev.map(d => 
          d.id === id 
            ? { 
                ...d, 
                status: DownloadStatus.Failed, 
                error: error instanceof Error ? error.message : 'Download failed'
              }
            : d
        ));
      }
    } else {
      console.log(`=== FRONTEND: Simulating download for ${item.title} (not in Tauri environment) ===`);
      // Fallback: simulate download progress for development
      const interval = setInterval(() => {
        setDownloads(prev => {
          const currentItem = prev.find(d => d.id === id);
          if (!currentItem || currentItem.status !== DownloadStatus.Downloading) {
            clearInterval(interval);
            return prev;
          }

          const newProgress = Math.min(currentItem.progress + Math.random() * 10, 100);
          
          return prev.map(d => 
            d.id === id 
              ? {
                  ...d,
                  progress: newProgress,
                  eta: newProgress >= 100 ? '' : `${Math.ceil((100 - newProgress) / 10)}m`,
                  status: newProgress >= 100 ? DownloadStatus.Completed : d.status,
                  size: newProgress >= 100 ? '145.2 MB' : '',
                  speed: newProgress >= 100 ? '' : '2.5 MB/s',
                }
              : d
          );
        });
      }, 500);
    }
  }, [downloads, settings.outputDirectory, settings.defaultQuality]);

  const pauseDownload = useCallback(async (id: string) => {
    if (isTauriEnvironment()) {
      try {
        await TauriAPI.cancelDownload(id);
      } catch (error) {
        console.error(`Failed to pause download ${id}:`, error);
      }
    }
    
    setDownloads(prev => prev.map(item => 
      item.id === id 
        ? { ...item, status: DownloadStatus.Paused, speed: '', eta: '' }
        : item
    ));
  }, []);

  const stopDownload = useCallback(async (id: string) => {
    if (isTauriEnvironment()) {
      try {
        await TauriAPI.cancelDownload(id);
      } catch (error) {
        console.error(`Failed to cancel download ${id}:`, error);
      }
    }
    
    setDownloads(prev => prev.map(item => 
      item.id === id 
        ? { ...item, status: DownloadStatus.Cancelled, speed: '', eta: '', progress: 0 }
        : item
    ));
  }, []);

  const retryDownload = useCallback((id: string) => {
    startDownload(id);
  }, [startDownload]);

  const removeDownload = useCallback((id: string) => {
    setDownloads(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearAllDownloads = useCallback(() => {
    setDownloads([]);
  }, []);

  const startAllDownloads = useCallback(() => {
    downloads
      .filter(item => item.status === DownloadStatus.Queued || item.status === DownloadStatus.Failed)
      .forEach(item => startDownload(item.id));
  }, [downloads, startDownload]);

  const pauseAllDownloads = useCallback(() => {
    downloads
      .filter(item => item.status === DownloadStatus.Downloading || item.status === DownloadStatus.Converting)
      .forEach(item => pauseDownload(item.id));
  }, [downloads, pauseDownload]);

  const openFolder = useCallback((id: string) => {
    TauriAPI.openDownloadFolder(id).catch(error => {
      console.error('Failed to open folder:', error);
    });
  }, []);

  const convertAllCompleted = useCallback(async () => {
    const completedItems = downloads.filter(d => d.status === DownloadStatus.Completed);
    
    if (completedItems.length === 0) {
      console.log('=== FRONTEND: No completed downloads to convert ===');
      return;
    }

    if (!settings.conversionFormat) {
      console.error('=== FRONTEND: No conversion format set for batch conversion ===');
      return;
    }

    console.log(`=== FRONTEND: Starting batch conversion of ${completedItems.length} videos ===`);
    
    // Convert all completed items
    for (const item of completedItems) {
      await convertVideo(item.id);
      // Add a small delay to prevent overwhelming the backend
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }, [downloads, convertVideo, settings.conversionFormat]);

  const openOutputFolder = useCallback(() => {
    // TODO: Implement with Tauri file system API
    console.log('Opening output folder:', settings.outputDirectory);
  }, [settings.outputDirectory]);

  const resetSettings = useCallback(() => {
    setSettings(prev => ({ ...prev, ...defaultSettings }));
  }, []);

  // Settings management functions
  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // Duplicate confirmation handlers
  const handleDuplicateConfirmation = useCallback((action: 'overwrite' | 'skip' | 'rename' | 'allow') => {
    if (duplicateConfirmation) {
      duplicateConfirmation.resolve(action);
      setDuplicateConfirmation(null);
    }
  }, [duplicateConfirmation]);

  const closeDuplicateConfirmation = useCallback(() => {
    if (duplicateConfirmation) {
      duplicateConfirmation.resolve('skip'); // Default to skip if modal is closed
      setDuplicateConfirmation(null);
    }
  }, [duplicateConfirmation]);

  // Mark a specific download for auto-conversion when it completes
  const markForAutoConversion = useCallback((id: string) => {
    setDownloads(prev => prev.map(d => 
      d.id === id ? { ...d, shouldAutoConvert: true } : d
    ));
  }, []);

  // Start download with auto-conversion enabled for this specific item
  const startDownloadWithConversion = useCallback(async (id: string) => {
    // First mark it for auto-conversion
    markForAutoConversion(id);
    // Then start the download
    await startDownload(id);
  }, [markForAutoConversion, startDownload]);

  return {
    downloads,
    settings,
    updateSettings,
    addDownloads,
    startDownload,
    startDownloadWithConversion,
    pauseDownload,
    stopDownload,
    retryDownload,
    removeDownload,
    clearAllDownloads,
    startAllDownloads,
    pauseAllDownloads,
    openFolder,
    convertVideo,
    convertAllCompleted,
    markForAutoConversion,
    openOutputFolder,
    resetSettings,
    duplicateConfirmation,
    handleDuplicateConfirmation,
    closeDuplicateConfirmation,
  };
}