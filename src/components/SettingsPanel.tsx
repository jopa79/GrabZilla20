import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  Slider,
  TextField,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  Chip,
  Button,
  Select,
  MenuItem,
  InputLabel,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Folder as FolderIcon,
  Speed as SpeedIcon,
  Notifications as NotificationsIcon,
  RestartAlt as RestartIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { ConversionSettings } from './ConversionSettings';
import { ConversionFormat } from '../types';

interface SettingsPanelProps {
  maxConcurrentDownloads: number;
  onMaxConcurrentChange: (value: number) => void;
  defaultQuality: string;
  onDefaultQualityChange: (quality: string) => void;
  outputDirectory: string;
  onOutputDirectoryChange: (path: string) => void;
  conversionFormat?: ConversionFormat;
  keepOriginal: boolean;
  onConversionFormatChange: (format?: ConversionFormat) => void;
  onKeepOriginalChange: (keep: boolean) => void;
  notificationsEnabled: boolean;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onUrlDuplicate: 'skip' | 'allow' | 'ask';
  onUrlDuplicateChange: (action: 'skip' | 'allow' | 'ask') => void;
  onFileDuplicate: 'overwrite' | 'skip' | 'rename' | 'ask';
  onFileDuplicateChange: (action: 'overwrite' | 'skip' | 'rename' | 'ask') => void;
  showDuplicateWarnings: boolean;
  onShowDuplicateWarningsChange: (show: boolean) => void;
  autoConvertAfterDownload: boolean;
  onAutoConvertAfterDownloadChange: (enabled: boolean) => void;
  onOpenOutputFolder: () => void;
  onResetSettings: () => void;
}

const qualityOptions = [
  { value: 'best', label: 'Best Available', description: 'Highest quality available' },
  { value: '2160p', label: '4K (2160p)', description: '3840×2160 resolution' },
  { value: '1440p', label: '1440p', description: '2560×1440 resolution' },
  { value: '1080p', label: '1080p', description: '1920×1080 resolution (recommended)' },
  { value: '720p', label: '720p', description: '1280×720 resolution' },
  { value: '480p', label: '480p', description: '854×480 resolution' },
  { value: 'worst', label: 'Worst (Fastest)', description: 'Lowest quality for testing' },
];

export function SettingsPanel({
  maxConcurrentDownloads,
  onMaxConcurrentChange,
  defaultQuality,
  onDefaultQualityChange,
  outputDirectory,
  onOutputDirectoryChange,
  conversionFormat,
  keepOriginal,
  onConversionFormatChange,
  onKeepOriginalChange,
  notificationsEnabled,
  onNotificationsEnabledChange,
  onUrlDuplicate,
  onUrlDuplicateChange,
  onFileDuplicate,
  onFileDuplicateChange,
  showDuplicateWarnings,
  onShowDuplicateWarningsChange,
  autoConvertAfterDownload,
  onAutoConvertAfterDownloadChange,
  onOpenOutputFolder,
  onResetSettings,
}: SettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleConcurrentChange = useCallback((_event: Event, value: number | number[]) => {
    onMaxConcurrentChange(Array.isArray(value) ? value[0] : value);
  }, [onMaxConcurrentChange]);

  const getPerformanceColor = (value: number) => {
    if (value <= 2) return 'success';
    if (value <= 5) return 'warning';
    return 'error';
  };

  const getPerformanceText = (value: number) => {
    if (value === 1) return 'Conservative (recommended for slow connections)';
    if (value <= 3) return 'Balanced (recommended for most users)';
    if (value <= 5) return 'Aggressive (requires good bandwidth)';
    return 'Maximum (may overwhelm servers)';
  };

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      {/* Download Settings */}
      <Card
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={3}>
            <SpeedIcon />
            <Typography variant="h6">
              Download Settings
            </Typography>
          </Box>

          {/* Quality Selection */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Default Quality</InputLabel>
            <Select
              value={defaultQuality}
              onChange={(e) => onDefaultQualityChange(e.target.value)}
              label="Default Quality"
            >
              {qualityOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Box>
                    <Typography variant="body1">{option.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Concurrent Downloads */}
          <Box sx={{ mb: 3 }}>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <Typography variant="body1">
                Concurrent Downloads: {maxConcurrentDownloads}
              </Typography>
              <Tooltip title="Number of videos downloaded simultaneously">
                <IconButton size="small">
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            
            <Slider
              value={maxConcurrentDownloads}
              onChange={handleConcurrentChange}
              min={1}
              max={10}
              step={1}
              marks={[
                { value: 1, label: '1' },
                { value: 3, label: '3' },
                { value: 5, label: '5' },
                { value: 10, label: '10' },
              ]}
              sx={{ mb: 1 }}
            />
            
            <Chip
              label={getPerformanceText(maxConcurrentDownloads)}
              size="small"
              color={getPerformanceColor(maxConcurrentDownloads) as any}
              variant="outlined"
            />
          </Box>

          {/* Output Directory */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ mb: 1 }}>
              Output Directory
            </Typography>
            <Box display="flex" gap={1} alignItems="center">
              <TextField
                fullWidth
                value={outputDirectory}
                onChange={(e) => onOutputDirectoryChange(e.target.value)}
                placeholder="Download destination folder"
                size="small"
              />
              <Button
                variant="outlined"
                startIcon={<FolderIcon />}
                onClick={onOpenOutputFolder}
                size="small"
              >
                Browse
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Conversion Settings */}
      <ConversionSettings
        conversionFormat={conversionFormat}
        keepOriginal={keepOriginal}
        autoConvertAfterDownload={autoConvertAfterDownload}
        onConversionFormatChange={onConversionFormatChange}
        onKeepOriginalChange={onKeepOriginalChange}
        onAutoConvertAfterDownloadChange={onAutoConvertAfterDownloadChange}
      />

      {/* Duplicate Handling Settings */}
      <Card
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={3}>
            <InfoIcon />
            <Typography variant="h6">
              Duplicate Handling
            </Typography>
          </Box>

          {/* URL Duplicate Handling */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>When URL Already in Queue</InputLabel>
            <Select
              value={onUrlDuplicate}
              onChange={(e) => onUrlDuplicateChange(e.target.value as 'skip' | 'allow' | 'ask')}
              label="When URL Already in Queue"
            >
              <MenuItem value="skip">
                <Box>
                  <Typography variant="body1">Skip</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Automatically skip duplicate URLs
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="allow">
                <Box>
                  <Typography variant="body1">Allow</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Add duplicate URLs anyway
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="ask">
                <Box>
                  <Typography variant="body1">Ask Me</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Show confirmation dialog
                  </Typography>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* File Duplicate Handling */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>When File Already Exists</InputLabel>
            <Select
              value={onFileDuplicate}
              onChange={(e) => onFileDuplicateChange(e.target.value as 'overwrite' | 'skip' | 'rename' | 'ask')}
              label="When File Already Exists"
            >
              <MenuItem value="overwrite">
                <Box>
                  <Typography variant="body1">Overwrite</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Replace existing files
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="skip">
                <Box>
                  <Typography variant="body1">Skip</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Skip if file already exists
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="rename">
                <Box>
                  <Typography variant="body1">Rename</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Add number suffix (e.g., video_1.mp4)
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem value="ask">
                <Box>
                  <Typography variant="body1">Ask Me</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Show confirmation dialog
                  </Typography>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Show Duplicate Warnings */}
          <FormControlLabel
            control={
              <Switch
                checked={showDuplicateWarnings}
                onChange={(e) => onShowDuplicateWarningsChange(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body1">
                  Show Duplicate Warnings
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Display visual indicators for duplicate items in queue
                </Typography>
              </Box>
            }
          />
        </CardContent>
      </Card>

      {/* Notifications & Advanced Settings */}
      <Card
        sx={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={3}>
            <NotificationsIcon />
            <Typography variant="h6">
              Notifications & Advanced
            </Typography>
          </Box>

          {/* Notifications */}
          <FormControlLabel
            control={
              <Switch
                checked={notificationsEnabled}
                onChange={(e) => onNotificationsEnabledChange(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body1">
                  Desktop Notifications
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Show system notifications for completed downloads
                </Typography>
              </Box>
            }
            sx={{ mb: 2 }}
          />

          <Divider sx={{ my: 2 }} />

          {/* Advanced Settings Toggle */}
          <Button
            variant="text"
            onClick={() => setShowAdvanced(!showAdvanced)}
            sx={{ mb: 2 }}
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </Button>

          {showAdvanced && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  Advanced settings for power users. Changes may affect performance and stability.
                </Typography>
              </Alert>

              {/* Reset Settings */}
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="body1">
                    Reset All Settings
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Restore default configuration
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<RestartIcon />}
                  onClick={onResetSettings}
                  size="small"
                >
                  Reset
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Status Info */}
      <Alert severity="info">
        <Typography variant="body2">
          <strong>Performance Tip:</strong> For best results, keep concurrent downloads at 3 or below 
          unless you have excellent bandwidth. Higher values may cause rate limiting or server blocks.
        </Typography>
      </Alert>
    </Box>
  );
}