import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Tooltip,
  Alert,
  Chip,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  ContentPaste as PasteIcon,
  Clear as ClearIcon,
  Link as LinkIcon,
  FileUpload as FileUploadIcon,
} from '@mui/icons-material';
import { ExtractedUrl, URLExtractionResult } from '../types';
import { TauriAPI, isTauriEnvironment } from '../services/tauri-api';

interface URLInputProps {
  onURLsExtracted: (result: URLExtractionResult) => void;
  disabled?: boolean;
}

export function URLInput({ onURLsExtracted, disabled = false }: URLInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [lastExtraction, setLastExtraction] = useState<URLExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL extraction with Rust backend fallback to JavaScript
  const extractURLs = useCallback(async (text: string): Promise<URLExtractionResult> => {
    // Try Rust backend first if available
    if (isTauriEnvironment()) {
      try {
        const result = await TauriAPI.extractUrlsFromText(text);
        
        // Check if any of the URLs are playlists and expand them
        const expandedUrls: ExtractedUrl[] = [];
        let totalFound = result.total_found;
        let duplicatesRemoved = result.duplicates_removed;
        
        for (const url of result.urls) {
          if (url.is_playlist) {
            console.log('=== URLInput: Found playlist, extracting individual videos ===');
            try {
              const videoUrls = await TauriAPI.extractPlaylistVideos(url.url);
              console.log(`=== URLInput: Extracted ${videoUrls.length} videos from playlist ===`);
              
              // Convert each video URL to an ExtractedUrl
              for (let i = 0; i < videoUrls.length; i++) {
                const videoUrl = videoUrls[i];
                const videoId = videoUrl.match(/(?:v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
                expandedUrls.push({
                  url: videoUrl,
                  title: `Video ${i + 1}${videoId ? ` (${videoId})` : ''}`, // Add a proper title
                  platform: url.platform, // Same platform as playlist
                  is_valid: true,
                  original_text: `${url.original_text} (Video ${i + 1})`,
                  is_playlist: false,
                  playlist_count: undefined,
                });
              }
              totalFound += videoUrls.length - 1; // Adjust count (replace 1 playlist with N videos)
            } catch (error) {
              console.warn('Failed to extract playlist videos, keeping playlist URL:', error);
              expandedUrls.push(url); // Keep original playlist URL as fallback
            }
          } else {
            expandedUrls.push(url);
          }
        }
        
        return {
          urls: expandedUrls,
          total_found: totalFound,
          valid_urls: expandedUrls.length,
          duplicates_removed: duplicatesRemoved,
        };
      } catch (error) {
        console.warn('Rust backend failed, falling back to JavaScript:', error);
        // Fall through to JavaScript implementation
      }
    }

    // Fallback JavaScript implementation
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const matches = text.match(urlRegex) || [];
    
    // Platform-specific patterns
    const platformPatterns = [
      { platform: 'youtube', regex: /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/ },
      { platform: 'vimeo', regex: /vimeo\.com\/(\d+)/ },
      { platform: 'twitch', regex: /twitch\.tv\/videos\/(\d+)/ },
      { platform: 'tiktok', regex: /tiktok\.com\/@[\w.-]+\/video\/(\d+)/ },
    ];

    const extractedUrls: ExtractedUrl[] = [];
    const seenUrls = new Set<string>();
    let duplicatesRemoved = 0;

    for (const url of matches) {
      // Remove tracking parameters
      const cleanUrl = url.replace(/[?&](utm_[^&]*|ref[^&]*|fbclid[^&]*)/g, '').replace(/[?&]$/, '');
      
      if (seenUrls.has(cleanUrl)) {
        duplicatesRemoved++;
        continue;
      }
      seenUrls.add(cleanUrl);

      // Detect platform
      let platform = 'generic';
      for (const pattern of platformPatterns) {
        if (pattern.regex.test(cleanUrl)) {
          platform = pattern.platform;
          break;
        }
      }

      extractedUrls.push({
        url: cleanUrl,
        platform: platform as any,
        is_valid: true, // Will be validated by backend
        original_text: url,
        is_playlist: cleanUrl.includes('list=') || cleanUrl.includes('playlist') || cleanUrl.includes('/channel/'),
        playlist_count: undefined,
      });
    }

    return {
      urls: extractedUrls,
      total_found: matches.length,
      valid_urls: extractedUrls.length,
      duplicates_removed: duplicatesRemoved,
    };
  }, []);

  const handleExtractURLs = useCallback(async () => {
    if (!inputValue.trim()) {
      setError('Please enter some text containing URLs');
      return;
    }

    console.log('=== URLInput: Starting URL extraction ===');
    console.log('Input text:', inputValue);
    
    setIsExtracting(true);
    setError(null);

    try {
      const result = await extractURLs(inputValue);
      console.log('=== URLInput: Extraction result:', result);
      setLastExtraction(result);
      
      console.log('=== URLInput: Calling onURLsExtracted with result ===');
      onURLsExtracted(result);
      
      if (result.valid_urls === 0) {
        setError('No valid URLs found in the provided text');
      }
    } catch (err) {
      setError('Failed to extract URLs. Please try again.');
      console.error('URL extraction error:', err);
    } finally {
      setIsExtracting(false);
    }
  }, [inputValue, extractURLs, onURLsExtracted]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputValue(prev => prev + (prev ? '\n' : '') + text);
      
      // Auto-extract if pasted content contains URLs or common URL patterns
      const urlPatterns = [
        /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi,
        /youtube\.com\/watch\?v=/gi,
        /youtu\.be\//gi,
        /vimeo\.com\/\d+/gi,
        /tiktok\.com\/@[\w.-]+\/video\/\d+/gi,
        /twitch\.tv\/videos\/\d+/gi,
        /instagram\.com\/(?:p|reel|tv)\//gi,
        /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/gi,
      ];
      
      const hasUrls = urlPatterns.some(pattern => pattern.test(text));
      if (hasUrls) {
        setTimeout(() => handleExtractURLs(), 250); // Debounced
      }
    } catch (err) {
      setError('Failed to access clipboard. Please paste manually.');
    }
  }, [handleExtractURLs]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(txt|url)$/i)) {
      setError('Please select a .txt or .url file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setInputValue(prev => prev + (prev ? '\n' : '') + content);
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(file);
  }, []);

  const handleClear = useCallback(() => {
    setInputValue('');
    setLastExtraction(null);
    setError(null);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [inputValue]);

  return (
    <Box>
      {/* Input Section */}
      <Box
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 2,
          p: 1.5,
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinkIcon />
          URL Input
        </Typography>

        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter video URLs or paste text containing links..."
          disabled={disabled || isExtracting}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
            },
          }}
        />

        {/* Action Buttons and Status */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleExtractURLs}
            disabled={disabled || isExtracting || !inputValue.trim()}
            sx={{ minWidth: 140 }}
          >
            {isExtracting ? 'Extracting...' : 'Add Videos'}
          </Button>

          {/* Utility buttons - moved to left side */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Paste from clipboard">
              <IconButton
                onClick={handlePaste}
                disabled={disabled || isExtracting}
                sx={{ color: 'primary.main' }}
                size="small"
              >
                <PasteIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Upload text file">
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isExtracting}
                sx={{ color: 'primary.main' }}
                size="small"
              >
                <FileUploadIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Clear input">
              <IconButton
                onClick={handleClear}
                disabled={disabled || isExtracting || !inputValue}
                sx={{ color: 'text.secondary' }}
                size="small"
              >
                <ClearIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Extraction Status - Moved to far right */}
          {lastExtraction && (
            <Box
              sx={{
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                borderRadius: 1,
                px: 2,
                py: 0.5,
                border: '1px solid rgba(76, 175, 80, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                ml: 'auto',
              }}
            >
              <Typography variant="body2" sx={{ color: 'success.main', fontSize: '0.875rem' }}>
                ✓ Extraction Complete
              </Typography>
              <Chip
                label={`${lastExtraction.valid_urls} URLs found`}
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 24 }}
              />
              {lastExtraction.duplicates_removed > 0 && (
                <Chip
                  label={`${lastExtraction.duplicates_removed} duplicates removed`}
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ height: 24 }}
                />
              )}
            </Box>
          )}
        </Stack>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.url"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

      </Box>
    </Box>
  );
}