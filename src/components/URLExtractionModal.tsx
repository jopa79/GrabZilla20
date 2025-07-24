import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Divider,
  Alert,
} from '@mui/material';
import {
  YouTube as YouTubeIcon,
  VideoLibrary as VimeoIcon,
  SportsEsports as TwitchIcon,
  MusicVideo as TikTokIcon,
  Link as GenericIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  Delete as DeleteIcon,
  PlaylistPlay as PlaylistIcon,
} from '@mui/icons-material';
import { ExtractedUrl, Platform, URLExtractionResult } from '../types';

interface URLExtractionModalProps {
  open: boolean;
  onClose: () => void;
  extractionResult: URLExtractionResult | null;
  onConfirm: (selectedUrls: ExtractedUrl[]) => void;
}

const platformIcons: Record<Platform, React.ComponentType<any>> = {
  [Platform.YouTube]: YouTubeIcon,
  [Platform.Vimeo]: VimeoIcon,
  [Platform.Twitch]: TwitchIcon,
  [Platform.TikTok]: TikTokIcon,
  [Platform.Instagram]: GenericIcon,
  [Platform.Twitter]: GenericIcon,
  [Platform.Facebook]: GenericIcon,
  [Platform.Generic]: GenericIcon,
};

const platformColors: Record<Platform, string> = {
  [Platform.YouTube]: '#FF0000',
  [Platform.Vimeo]: '#1AB7EA',
  [Platform.Twitch]: '#9146FF',
  [Platform.TikTok]: '#000000',
  [Platform.Instagram]: '#E4405F',
  [Platform.Twitter]: '#1DA1F2',
  [Platform.Facebook]: '#1877F2',
  [Platform.Generic]: '#757575',
};

export function URLExtractionModal({
  open,
  onClose,
  extractionResult,
  onConfirm,
}: URLExtractionModalProps) {
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);

  // Initialize selection when modal opens and reset when closed
  useEffect(() => {
    if (extractionResult && open) {
      const allUrls = new Set(extractionResult.urls.map(url => url.url));
      setSelectedUrls(allUrls);
      setSelectAll(true);
    } else if (!open) {
      // Reset state when modal closes
      setSelectedUrls(new Set());
      setSelectAll(true);
    }
  }, [extractionResult, open]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (!extractionResult) return;
    
    if (checked) {
      const allUrls = new Set(extractionResult.urls.map(url => url.url));
      setSelectedUrls(allUrls);
    } else {
      setSelectedUrls(new Set());
    }
    setSelectAll(checked);
  }, [extractionResult]);

  const handleToggleUrl = useCallback((url: string) => {
    setSelectedUrls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(url)) {
        newSet.delete(url);
      } else {
        newSet.add(url);
      }
      
      // Update select all state  
      const totalUrls = extractionResult?.urls.length || 0;
      setSelectAll(newSet.size === totalUrls);
      
      return newSet;
    });
  }, [extractionResult]);

  const handleRemoveUrl = useCallback((urlToRemove: string) => {
    if (!extractionResult) return;
    
    // Remove from extraction result
    extractionResult.urls = extractionResult.urls.filter(url => url.url !== urlToRemove);
    extractionResult.valid_urls = extractionResult.urls.length;
    
    // Remove from selection
    setSelectedUrls(prev => {
      const newSet = new Set(prev);
      newSet.delete(urlToRemove);
      return newSet;
    });
  }, [extractionResult]);

  const handleConfirm = useCallback(() => {
    console.log('=== MODAL: handleConfirm called ===');
    if (!extractionResult) {
      console.log('=== MODAL: No extraction result, returning ===');
      return;
    }
    
    const selectedUrlObjects = extractionResult.urls.filter(url => 
      selectedUrls.has(url.url)
    );
    
    console.log('=== MODAL: Selected URLs:', selectedUrlObjects);
    console.log('=== MODAL: Calling onConfirm with selected URLs ===');
    onConfirm(selectedUrlObjects);
    onClose();
  }, [extractionResult, selectedUrls, onConfirm, onClose]);

  const getPlatformIcon = (platform: Platform) => {
    const IconComponent = platformIcons[platform] || GenericIcon;
    return <IconComponent sx={{ color: platformColors[platform] }} />;
  };

  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  };

  if (!extractionResult) {
    return null;
  }

  const { urls, total_found, valid_urls, duplicates_removed } = extractionResult;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#2D2D2D',
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle>
        <Box>
          <Typography variant="h6">
            URL Extraction Results
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review and select URLs to add to download queue
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Summary */}
        <Box sx={{ mb: 3 }}>
          <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
            <Chip
              label={`${valid_urls} URLs found`}
              color="success"
              variant="outlined"
              size="small"
            />
            {total_found > valid_urls && (
              <Chip
                label={`${total_found - valid_urls} invalid`}
                color="warning"
                variant="outlined"
                size="small"
              />
            )}
            {duplicates_removed > 0 && (
              <Chip
                label={`${duplicates_removed} duplicates removed`}
                color="info"
                variant="outlined"
                size="small"
              />
            )}
          </Box>

          {valid_urls === 0 ? (
            <Alert severity="warning">
              No valid video URLs were found in the provided text. Please check your input and try again.
            </Alert>
          ) : (
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectAll}
                  indeterminate={selectedUrls.size > 0 && selectedUrls.size < valid_urls}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  icon={<CheckBoxOutlineBlankIcon />}
                  checkedIcon={<CheckBoxIcon />}
                />
              }
              label={`Select All (${selectedUrls.size}/${valid_urls})`}
            />
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* URL List */}
        {valid_urls > 0 && (
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {urls.map((extractedUrl, index) => (
              <ListItem
                key={`${extractedUrl.url}-${index}`}
                sx={{
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: selectedUrls.has(extractedUrl.url)
                    ? 'rgba(33, 150, 243, 0.1)'
                    : 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <ListItemIcon>
                  <Checkbox
                    checked={selectedUrls.has(extractedUrl.url)}
                    onChange={() => handleToggleUrl(extractedUrl.url)}
                    icon={<CheckBoxOutlineBlankIcon />}
                    checkedIcon={<CheckBoxIcon />}
                  />
                </ListItemIcon>

                <ListItemIcon sx={{ minWidth: 40 }}>
                  {getPlatformIcon(extractedUrl.platform)}
                </ListItemIcon>

                <ListItemText
                  primary={
                    <Box>
                      <Typography variant="body2" noWrap>
                        {formatUrl(extractedUrl.url)}
                      </Typography>
                      <Box display="flex" gap={0.5} mt={0.5}>
                        <Chip
                          label={extractedUrl.platform}
                          size="small"
                          variant="outlined"
                          sx={{ 
                            fontSize: '0.7rem',
                            height: 20,
                            textTransform: 'capitalize',
                          }}
                        />
                        {extractedUrl.is_playlist && (
                          <Chip
                            icon={<PlaylistIcon sx={{ fontSize: '12px !important' }} />}
                            label={extractedUrl.playlist_count ? `${extractedUrl.playlist_count} videos` : 'Playlist'}
                            size="small"
                            variant="outlined"
                            color="secondary"
                            sx={{ 
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                  }
                  secondary={
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        wordBreak: 'break-all',
                        display: 'block',
                        mt: 0.5,
                      }}
                    >
                      {extractedUrl.url}
                    </Typography>
                  }
                />

                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    onClick={() => handleRemoveUrl(extractedUrl.url)}
                    size="small"
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={selectedUrls.size === 0}
        >
          Add {selectedUrls.size} Video{selectedUrls.size !== 1 ? 's' : ''} to Queue
        </Button>
      </DialogActions>
    </Dialog>
  );
}