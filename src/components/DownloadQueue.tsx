import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import { FixedSizeList as List } from 'react-window';
import { DownloadItem, DownloadStatus } from '../types';
import { QueueItem } from './QueueItem';

interface DownloadQueueProps {
  items: DownloadItem[];
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onStop: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onStartAll: () => void;
  onPauseAll: () => void;
  onOpenFolder: (id: string) => void;
  onConvertAll: () => void;
  onDownloadOnly: (id: string) => void;
  onDownloadAndConvert: (id: string) => void;
  onConvertOnly: (id: string) => void;
}

export function DownloadQueue({
  items,
  onStart,
  onPause,
  onStop,
  onRetry,
  onRemove,
  onClearAll,
  onStartAll,
  onPauseAll,
  onOpenFolder,
  onConvertAll,
  onDownloadOnly,
  onDownloadAndConvert,
  onConvertOnly,
}: DownloadQueueProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Calculate queue statistics
  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter(item => item.status === DownloadStatus.Completed).length;
    const failed = items.filter(item => item.status === DownloadStatus.Failed).length;
    const downloading = items.filter(item => item.status === DownloadStatus.Downloading).length;
    const converting = items.filter(item => item.status === DownloadStatus.Converting).length;
    const queued = items.filter(item => item.status === DownloadStatus.Queued).length;
    const paused = items.filter(item => item.status === DownloadStatus.Paused).length;
    const metadataLoading = items.filter(item => item.metadataLoading === true).length;
    const canConvert = items.filter(item => item.status === DownloadStatus.Completed).length;

    const totalProgress = items.reduce((sum, item) => sum + item.progress, 0);
    const averageProgress = total > 0 ? totalProgress / total : 0;

    // Calculate total file sizes
    const totalBytes = items.reduce((sum, item) => sum + (item.totalBytes || 0), 0);
    const downloadedBytes = items.reduce((sum, item) => sum + (item.downloadedBytes || 0), 0);
    
    // Get active download speeds
    const activeDownloads = items.filter(item => 
      item.status === DownloadStatus.Downloading && item.speed
    );
    const downloadSpeeds = activeDownloads
      .map(item => item.speed)
      .filter(speed => speed && speed !== '');

    return {
      total,
      completed,
      failed,
      downloading,
      converting,
      queued,
      paused,
      metadataLoading,
      canConvert,
      averageProgress,
      totalBytes,
      downloadedBytes,
      downloadSpeeds,
    };
  }, [items]);

  // Utility function to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(items.map(item => item.id));
    setSelectedItems(allIds);
    handleMenuClose();
  }, [items]);

  const handleSelectNone = useCallback(() => {
    setSelectedItems(new Set());
    handleMenuClose();
  }, []);

  const handleRemoveSelected = useCallback(() => {
    selectedItems.forEach(id => onRemove(id));
    setSelectedItems(new Set());
    handleMenuClose();
  }, [selectedItems, onRemove]);

  const handleRetryFailed = useCallback(() => {
    items
      .filter(item => item.status === DownloadStatus.Failed)
      .forEach(item => onRetry(item.id));
    handleMenuClose();
  }, [items, onRetry]);

  const handleConvertAll = useCallback(() => {
    onConvertAll();
    handleMenuClose();
  }, [onConvertAll]);


  // Virtual list item renderer
  const renderQueueItem = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index];
    const isSelected = selectedItems.has(item.id);

    return (
      <div style={style}>
        <QueueItem
          item={item}
          isSelected={isSelected}
          onToggleSelect={(id) => {
            setSelectedItems(prev => {
              const newSet = new Set(prev);
              if (newSet.has(id)) {
                newSet.delete(id);
              } else {
                newSet.add(id);
              }
              return newSet;
            });
          }}
          onStart={onStart}
          onPause={onPause}
          onStop={onStop}
          onRetry={onRetry}
          onRemove={onRemove}
          onOpenFolder={onOpenFolder}
          onDownloadOnly={onDownloadOnly}
          onDownloadAndConvert={onDownloadAndConvert}
          onConvertOnly={onConvertOnly}
        />
      </div>
    );
  }, [items, selectedItems, onStart, onPause, onStop, onRetry, onRemove, onOpenFolder, onDownloadOnly, onDownloadAndConvert, onConvertOnly]);

  return (
    <Box
      sx={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 2,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        mb: 2,
      }}
    >
      {/* Header */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DownloadIcon />
            Download Queue ({stats.total})
          </Typography>

          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<PlayIcon />}
              onClick={onStartAll}
              disabled={stats.queued === 0 && stats.paused === 0}
              size="small"
              sx={{ 
                color: 'success.main',
                borderColor: 'success.main',
                '&:hover': {
                  backgroundColor: 'rgba(76, 175, 80, 0.1)',
                  borderColor: 'success.main',
                },
                '&:disabled': {
                  color: 'rgba(76, 175, 80, 0.3)',
                  borderColor: 'rgba(76, 175, 80, 0.3)',
                }
              }}
            >
              Start All
            </Button>

            <Button
              variant="outlined"
              startIcon={<PauseIcon />}
              onClick={onPauseAll}
              disabled={stats.downloading === 0 && stats.converting === 0}
              size="small"
              sx={{ 
                color: 'warning.main',
                borderColor: 'warning.main',
                '&:hover': {
                  backgroundColor: 'rgba(255, 152, 0, 0.1)',
                  borderColor: 'warning.main',
                },
                '&:disabled': {
                  color: 'rgba(255, 152, 0, 0.3)',
                  borderColor: 'rgba(255, 152, 0, 0.3)',
                }
              }}
            >
              Pause All
            </Button>

            <Button
              variant="outlined"
              startIcon={<MoreIcon />}
              onClick={handleMenuOpen}
              size="small"
              sx={{ 
                color: 'text.primary',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                }
              }}
            >
              More Actions
            </Button>
          </Box>
        </Box>

        {/* Queue Statistics */}
        <Stack direction="row" spacing={1} flexWrap="wrap" mb={1.5}>
          {stats.metadataLoading > 0 && (
            <Chip
              label={`${stats.metadataLoading} Loading Info`}
              size="small"
              color="info"
              variant="outlined"
              sx={{ 
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 1 },
                  '50%': { opacity: 0.7 },
                  '100%': { opacity: 1 },
                }
              }}
            />
          )}
          {stats.queued > 0 && (
            <Chip label={`${stats.queued} Queued`} size="small" variant="outlined" />
          )}
          {stats.downloading > 0 && (
            <Chip
              label={`${stats.downloading} Downloading`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          {stats.converting > 0 && (
            <Chip
              label={`${stats.converting} Converting`}
              size="small"
              color="secondary"
              variant="outlined"
            />
          )}
          {stats.completed > 0 && (
            <Chip
              label={`${stats.completed} Completed`}
              size="small"
              color="success"
              variant="outlined"
            />
          )}
          {stats.failed > 0 && (
            <Chip
              label={`${stats.failed} Failed`}
              size="small"
              color="error"
              variant="outlined"
            />
          )}
          {stats.paused > 0 && (
            <Chip
              label={`${stats.paused} Paused`}
              size="small"
              color="warning"
              variant="outlined"
            />
          )}
        </Stack>

        {/* Overall Progress */}
        {stats.total > 0 && (
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="body2" color="text.secondary">
                Overall Progress
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {Math.round(stats.averageProgress)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={stats.averageProgress}
              sx={{
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 2,
                },
              }}
            />
            
            {/* Enhanced Statistics */}
            <Box mt={1}>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {/* Total Size Information */}
                {stats.totalBytes > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {stats.downloadedBytes > 0 ? (
                      <>
                        {formatBytes(stats.downloadedBytes)} of {formatBytes(stats.totalBytes)}
                      </>
                    ) : (
                      <>
                        Total: {formatBytes(stats.totalBytes)}
                      </>
                    )}
                  </Typography>
                )}
                
                {/* Active Download Speeds */}
                {stats.downloadSpeeds.length > 0 && (
                  <Typography variant="caption" color="primary.main">
                    {stats.downloadSpeeds.length === 1 ? (
                      `Speed: ${stats.downloadSpeeds[0]}`
                    ) : (
                      `${stats.downloadSpeeds.length} active downloads`
                    )}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Box>
        )}
      </Box>

      {/* Queue Items */}
      {items.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            color: 'text.secondary',
            gap: 2,
            p: 4,
          }}
        >
          <DownloadIcon sx={{ fontSize: 64, opacity: 0.3 }} />
          <Typography variant="h6">No downloads in queue</Typography>
          <Typography variant="body2">
            Add video URLs using the input above to start downloading
          </Typography>
        </Box>
      ) : (
        <Box sx={{ minHeight: `${items.length * 95}px` }}>
          <List
            height={Math.min(700, Math.max(190, items.length * 95))}
            itemCount={items.length}
            itemSize={95}
            width="100%"
          >
            {renderQueueItem}
          </List>
        </Box>
      )}

      {/* Footer Actions */}
      {selectedItems.size > 0 && (
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
            </Typography>
            <Button
              size="small"
              startIcon={<DeleteIcon />}
              onClick={handleRemoveSelected}
              color="error"
            >
              Remove Selected
            </Button>
          </Stack>
        </Box>
      )}

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
        <MenuItem onClick={handleSelectAll}>
          Select All
        </MenuItem>
        <MenuItem onClick={handleSelectNone}>
          Select None
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleRetryFailed} disabled={stats.failed === 0}>
          Retry Failed Downloads
        </MenuItem>
        <MenuItem onClick={handleConvertAll} disabled={stats.canConvert === 0}>
          Convert All Completed
        </MenuItem>
        <Divider />
        <MenuItem onClick={onClearAll} disabled={items.length === 0}>
          <DeleteIcon sx={{ mr: 1, fontSize: 20 }} />
          Clear All
        </MenuItem>
      </Menu>
    </Box>
  );
}