import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  YouTube as YouTubeIcon,
  VideoLibrary as VimeoIcon,
  SportsEsports as TwitchIcon,
  MusicVideo as TikTokIcon,
  Link as GenericIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { ExtractedUrl, Platform, DuplicateCheckResult } from '../types';

interface DuplicateInfo {
  url: ExtractedUrl;
  duplicateCheck: DuplicateCheckResult;
}

interface DuplicateConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  duplicateInfo: DuplicateInfo | null;
  onConfirm: (action: 'overwrite' | 'skip' | 'rename' | 'allow') => void;
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

export function DuplicateConfirmationModal({
  open,
  onClose,
  duplicateInfo,
  onConfirm,
}: DuplicateConfirmationModalProps) {
  const [selectedAction, setSelectedAction] = useState<'overwrite' | 'skip' | 'rename' | 'allow'>('skip');

  if (!duplicateInfo) {
    return null;
  }

  const { url, duplicateCheck } = duplicateInfo;
  const isUrlDuplicate = duplicateCheck.duplicateType === 'url';
  const isFileDuplicate = duplicateCheck.duplicateType === 'file';
  const settingsMatch = duplicateCheck.settingsMatch;

  const getPlatformIcon = (platform: Platform) => {
    const IconComponent = platformIcons[platform] || GenericIcon;
    return <IconComponent sx={{ color: platformColors[platform] }} />;
  };

  const getActionOptions = () => {
    if (isUrlDuplicate) {
      return [
        { value: 'skip', label: 'Skip this video', description: 'Don\'t add to queue again' },
        { value: 'allow', label: 'Add anyway', description: 'Allow duplicate in queue' },
      ];
    } else {
      return [
        { value: 'skip', label: 'Skip download', description: 'Don\'t download, keep existing file' },
        { value: 'overwrite', label: 'Overwrite existing', description: 'Replace the existing file' },
        { value: 'rename', label: 'Download with new name', description: 'Add suffix to avoid conflict' },
      ];
    }
  };

  const getStatusInfo = () => {
    if (isUrlDuplicate) {
      return {
        icon: <WarningIcon color="warning" />,
        title: 'URL Already in Queue',
        message: settingsMatch 
          ? 'This video is already queued with the same download settings.'
          : 'This video is already queued but with different download settings.',
      };
    } else {
      return {
        icon: settingsMatch ? <CheckCircleIcon color="success" /> : <ErrorIcon color="error" />,
        title: 'File Already Exists',
        message: settingsMatch 
          ? 'A file with the same name and settings already exists in your download folder.'
          : 'A file exists but was downloaded with different settings (quality/format).',
      };
    }
  };

  const statusInfo = getStatusInfo();

  const handleConfirm = () => {
    onConfirm(selectedAction);
    onClose();
  };

  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#2D2D2D',
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          {statusInfo.icon}
          <Typography variant="h6">
            {statusInfo.title}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Alert with status message */}
        <Alert 
          severity={settingsMatch ? "info" : "warning"} 
          sx={{ mb: 3 }}
          icon={false}
        >
          {statusInfo.message}
        </Alert>

        {/* Video Information */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Video Details
          </Typography>
          <List sx={{ py: 0 }}>
            <ListItem
              sx={{
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                px: 2,
                py: 1,
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getPlatformIcon(url.platform)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {url.title || formatUrl(url.url)}
                  </Typography>
                }
                secondary={
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                      {url.url}
                    </Typography>
                    <Box display="flex" gap={0.5} mt={0.5}>
                      <Chip
                        label={url.platform}
                        size="small"
                        variant="outlined"
                        sx={{ 
                          fontSize: '0.7rem',
                          height: 20,
                          textTransform: 'capitalize',
                        }}
                      />
                      {url.is_playlist && (
                        <Chip
                          label="Playlist"
                          size="small"
                          variant="outlined"
                          color="secondary"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      )}
                    </Box>
                  </>
                }
                secondaryTypographyProps={{
                  component: 'div'
                }}
              />
            </ListItem>
          </List>
        </Box>

        {/* Existing Item Info */}
        {isUrlDuplicate && duplicateCheck.existingItem && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Existing Queue Item
            </Typography>
            <Box sx={{ 
              border: '1px solid rgba(255, 193, 7, 0.3)', 
              borderRadius: 1, 
              p: 2,
              backgroundColor: 'rgba(255, 193, 7, 0.05)'
            }}>
              <Typography variant="body2">
                Quality: {duplicateCheck.existingItem.quality}
              </Typography>
              <Typography variant="body2">
                Format: {duplicateCheck.existingItem.format}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Status: {duplicateCheck.existingItem.status}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Existing File Info */}
        {isFileDuplicate && duplicateCheck.existingFilePath && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Existing File
            </Typography>
            <Box sx={{ 
              border: '1px solid rgba(76, 175, 80, 0.3)', 
              borderRadius: 1, 
              p: 2,
              backgroundColor: 'rgba(76, 175, 80, 0.05)'
            }}>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {duplicateCheck.existingFilePath}
              </Typography>
            </Box>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Action Selection */}
        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Choose Action
          </Typography>
          <FormControl fullWidth>
            <RadioGroup
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as any)}
            >
              {getActionOptions().map((option) => (
                <FormControlLabel
                  key={option.value}
                  value={option.value}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">
                        {option.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.description}
                      </Typography>
                    </Box>
                  }
                  sx={{ 
                    alignItems: 'flex-start',
                    py: 1,
                    '& .MuiRadio-root': { pt: 0.5 }
                  }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color={selectedAction === 'overwrite' ? 'warning' : 'primary'}
        >
          {selectedAction === 'skip' && 'Skip'}
          {selectedAction === 'allow' && 'Add Anyway'}
          {selectedAction === 'overwrite' && 'Overwrite'}
          {selectedAction === 'rename' && 'Download with New Name'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}