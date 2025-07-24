import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  Chip,
  Avatar,
  Checkbox,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Delete as DeleteIcon,
  Refresh as RetryIcon,
  Folder as FolderIcon,
  MoreVert as MoreIcon,
  YouTube as YouTubeIcon,
  VideoLibrary as VimeoIcon,
  SportsEsports as TwitchIcon,
  MusicVideo as TikTokIcon,
  Link as GenericIcon,
  GetApp as DownloadingIcon,
  Transform as ConvertingIcon,
  CheckCircle as CompletedIcon,
  Error as ErrorIcon,
  Schedule as QueuedIcon,
  HourglassEmpty as LoadingIcon,
  CloudDownload as DownloadOnlyIcon,
  DoubleArrow as DownloadConvertIcon,
} from '@mui/icons-material';
import { DownloadItem, DownloadStatus, Platform } from '../types';

// Utility function to format bytes in human readable format
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

interface QueueItemProps {
  item: DownloadItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onStop: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onDownloadOnly: (id: string) => void;
  onDownloadAndConvert: (id: string) => void;
  onConvertOnly: (id: string) => void;
}

const platformIcons = {
  [Platform.YouTube]: YouTubeIcon,
  [Platform.Vimeo]: VimeoIcon,
  [Platform.Twitch]: TwitchIcon,
  [Platform.TikTok]: TikTokIcon,
  [Platform.Instagram]: GenericIcon,
  [Platform.Twitter]: GenericIcon,
  [Platform.Facebook]: GenericIcon,
  [Platform.Generic]: GenericIcon,
};

const statusIcons = {
  [DownloadStatus.Queued]: QueuedIcon,
  [DownloadStatus.Downloading]: DownloadingIcon,
  [DownloadStatus.Converting]: ConvertingIcon,
  [DownloadStatus.Completed]: CompletedIcon,
  [DownloadStatus.Failed]: ErrorIcon,
  [DownloadStatus.Paused]: PauseIcon,
  [DownloadStatus.Cancelled]: ErrorIcon,
  [DownloadStatus.Duplicate]: ErrorIcon,
  [DownloadStatus.Skipped]: PauseIcon,
};

export function QueueItem({
  item,
  isSelected,
  onToggleSelect,
  onStart,
  onPause,
  onStop,
  onRetry,
  onRemove,
  onOpenFolder,
  onDownloadOnly,
  onDownloadAndConvert,
  onConvertOnly,
}: QueueItemProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const getStatusColor = (status: DownloadStatus) => {
    switch (status) {
      case DownloadStatus.Completed:
        return 'success';
      case DownloadStatus.Failed:
      case DownloadStatus.Cancelled:
      case DownloadStatus.Duplicate:
        return 'error';
      case DownloadStatus.Downloading:
      case DownloadStatus.Converting:
        return 'primary';
      case DownloadStatus.Paused:
      case DownloadStatus.Skipped:
        return 'warning';
      default:
        return 'default';
    }
  };

  const getProgressColor = (status: DownloadStatus) => {
    switch (status) {
      case DownloadStatus.Downloading:
        return 'primary';
      case DownloadStatus.Converting:
        return 'secondary';
      case DownloadStatus.Completed:
        return 'success';
      case DownloadStatus.Failed:
        return 'error';
      default:
        return 'primary';
    }
  };

  const PlatformIcon = platformIcons[item.platform];
  const StatusIcon = statusIcons[item.status];

  const canStart = item.status === DownloadStatus.Queued || item.status === DownloadStatus.Paused;
  const canPause = item.status === DownloadStatus.Downloading || item.status === DownloadStatus.Converting;
  const canRetry = item.status === DownloadStatus.Failed;
  const canOpenFolder = item.status === DownloadStatus.Completed;
  const canDownloadOnly = item.status === DownloadStatus.Queued || item.status === DownloadStatus.Paused;
  const canDownloadAndConvert = item.status === DownloadStatus.Queued || item.status === DownloadStatus.Paused;
  const canConvertOnly = item.status === DownloadStatus.Completed;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: 0.75,
        mx: 1,
        mb: 0.75,
        borderRadius: 1,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backgroundColor: isSelected 
          ? 'rgba(33, 150, 243, 0.1)' 
          : 'rgba(255, 255, 255, 0.02)',
        '&:hover': {
          backgroundColor: isSelected 
            ? 'rgba(33, 150, 243, 0.15)' 
            : 'rgba(255, 255, 255, 0.05)',
        },
        cursor: 'pointer',
      }}
      onClick={() => onToggleSelect(item.id)}
    >
      {/* Selection Checkbox */}
      <Checkbox
        checked={isSelected}
        onChange={() => onToggleSelect(item.id)}
        onClick={(e) => e.stopPropagation()}
        size="small"
        sx={{ mr: 1 }}
      />

      {/* Thumbnail */}
      <Box sx={{ position: 'relative', mr: 1.5 }}>
        <Avatar
          src={item.metadataLoading ? undefined : item.thumbnail}
          sx={{
            width: 60,
            height: 42,
            borderRadius: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          {item.metadataLoading ? <LoadingIcon /> : <PlatformIcon />}
        </Avatar>
        {item.metadataLoading && (
          <CircularProgress
            size={16}
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'primary.main',
            }}
          />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Title and Platform */}
        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              opacity: item.metadataLoading ? 0.7 : 1,
              fontStyle: item.metadataLoading ? 'italic' : 'normal',
            }}
          >
            {item.metadataLoading ? 'Loading video information...' : item.title}
          </Typography>
          {item.metadataLoading && (
            <CircularProgress size={12} sx={{ color: 'text.secondary' }} />
          )}
          {item.isDuplicate && (
            <Chip
              label={item.duplicateType === 'url' ? 'Duplicate URL' : 'File Exists'}
              size="small"
              color="warning"
              sx={{ fontSize: '0.6rem', height: 18 }}
            />
          )}
          <Chip
            label={item.platform}
            size="small"
            variant="outlined"
            sx={{ textTransform: 'capitalize', fontSize: '0.7rem', height: 20 }}
          />
          <Chip
            label={item.quality}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ 
              fontSize: '0.7rem', 
              height: 20,
              fontWeight: 600,
              backgroundColor: 'rgba(33, 150, 243, 0.1)'
            }}
          />
          {item.shouldAutoConvert && (
            <Chip
              label="Auto-Convert"
              size="small"
              color="secondary"
              variant="outlined"
              sx={{ 
                fontSize: '0.6rem', 
                height: 18,
                backgroundColor: 'rgba(156, 39, 176, 0.1)'
              }}
            />
          )}
        </Box>

        {/* Progress and Status */}
        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
          <StatusIcon sx={{ fontSize: 16, color: `${getStatusColor(item.status)}.main` }} />
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60 }}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Typography>
          
          {(item.status === DownloadStatus.Downloading || item.status === DownloadStatus.Converting) && (
            <>
              {item.speed && (
                <Typography variant="caption" color="primary.main" sx={{ fontWeight: 500 }}>
                  {item.speed}
                </Typography>
              )}
              {item.eta && item.eta !== '00:00' && (
                <Typography variant="caption" color="text.secondary">
                  ETA: {item.eta}
                </Typography>
              )}
            </>
          )}
          
          {item.status === DownloadStatus.Completed && (
            <Typography variant="caption" color="success.main">
              {item.size}
            </Typography>
          )}
        </Box>

        {/* File Size Information */}
        {(item.status === DownloadStatus.Downloading || item.status === DownloadStatus.Converting) && 
         item.downloadedBytes && item.totalBytes && (
          <Box mb={0.5}>
            <Typography variant="caption" color="text.secondary">
              {formatBytes(item.downloadedBytes)} of {formatBytes(item.totalBytes)}
              {item.speed && ` • ${item.speed}`}
              {item.eta && item.eta !== '00:00' && ` • ${item.eta} remaining`}
            </Typography>
          </Box>
        )}

        {/* Progress Bar */}
        <LinearProgress
          variant="determinate"
          value={item.progress}
          color={getProgressColor(item.status)}
          sx={{
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            '& .MuiLinearProgress-bar': {
              borderRadius: 2,
            },
          }}
        />
      </Box>

      {/* Metadata */}
      <Box sx={{ textAlign: 'right', minWidth: 120, mr: 1 }}>
        <Typography variant="caption" display="block" sx={{ fontWeight: 600, color: 'primary.main' }}>
          {item.quality}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {item.format} • {item.duration}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {Math.round(item.progress)}%
          {item.totalBytes && (
            <span style={{ display: 'block', fontSize: '0.65rem', marginTop: 1 }}>
              {formatBytes(item.totalBytes)}
            </span>
          )}
        </Typography>
      </Box>

      {/* Action Buttons */}
      <Box display="flex" alignItems="center" gap={0.5}>
        {/* Download Action Buttons for Queued/Paused Items */}
        {canDownloadOnly && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadOnlyIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onDownloadOnly(item.id);
            }}
            sx={{ 
              color: 'success.main',
              borderColor: 'success.main',
              '&:hover': {
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                borderColor: 'success.main',
              },
              minWidth: 'auto',
              px: 1,
            }}
          >
            Download Only
          </Button>
        )}

        {canDownloadAndConvert && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadConvertIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onDownloadAndConvert(item.id);
            }}
            sx={{ 
              color: 'primary.main',
              borderColor: 'primary.main',
              '&:hover': {
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                borderColor: 'primary.main',
              },
              minWidth: 'auto',
              px: 1,
            }}
          >
            Download & Convert
          </Button>
        )}

        {/* Convert Only Button for Completed Items */}
        {canConvertOnly && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<ConvertingIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onConvertOnly(item.id);
            }}
            sx={{ 
              color: 'secondary.main',
              borderColor: 'secondary.main',
              '&:hover': {
                backgroundColor: 'rgba(156, 39, 176, 0.1)',
                borderColor: 'secondary.main',
              },
              minWidth: 'auto',
              px: 1,
            }}
          >
            Convert Only
          </Button>
        )}

        {/* Pause Button for Active Downloads */}
        {canPause && (
          <Tooltip title="Pause download">
            <span>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onPause(item.id);
                }}
                sx={{ color: 'warning.main' }}
              >
                <PauseIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Retry Button for Failed Downloads */}
        {canRetry && (
          <Tooltip title="Retry download">
            <span>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(item.id);
                }}
                sx={{ color: 'primary.main' }}
              >
                <RetryIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Open Folder Button for Completed Downloads */}
        {canOpenFolder && (
          <Tooltip title="Open folder">
            <span>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFolder(item.id);
                }}
                sx={{ color: 'info.main' }}
              >
                <FolderIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Tooltip title="More actions">
          <span>
            <IconButton
              size="small"
              onClick={handleMenuOpen}
            >
              <MoreIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            backgroundColor: '#2D2D2D',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        }}
      >
        {canStart && (
          <MenuItem
            onClick={() => {
              onStart(item.id);
              handleMenuClose();
            }}
          >
            <PlayIcon sx={{ mr: 1, fontSize: 20 }} />
            Start Download
          </MenuItem>
        )}

        {canPause && (
          <MenuItem
            onClick={() => {
              onPause(item.id);
              handleMenuClose();
            }}
          >
            <PauseIcon sx={{ mr: 1, fontSize: 20 }} />
            Pause Download
          </MenuItem>
        )}

        {(canPause || item.status === DownloadStatus.Queued) && (
          <MenuItem
            onClick={() => {
              onStop(item.id);
              handleMenuClose();
            }}
          >
            <StopIcon sx={{ mr: 1, fontSize: 20 }} />
            Stop Download
          </MenuItem>
        )}

        {canRetry && (
          <MenuItem
            onClick={() => {
              onRetry(item.id);
              handleMenuClose();
            }}
          >
            <RetryIcon sx={{ mr: 1, fontSize: 20 }} />
            Retry Download
          </MenuItem>
        )}

        {/* Open Folder removed from menu since it's now a dedicated button */}

        <Divider />

        <MenuItem
          onClick={() => {
            onRemove(item.id);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1, fontSize: 20 }} />
          Remove from Queue
        </MenuItem>
      </Menu>
    </Box>
  );
}