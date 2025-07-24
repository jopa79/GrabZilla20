import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  FormControlLabel,
  RadioGroup,
  Radio,
  Switch,
  Card,
  CardContent,
  Divider,
  Chip,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  VideoLibrary as VideoIcon,
  AudioFile as AudioIcon,
  Settings as SettingsIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { ConversionFormat } from '../types';

interface ConversionSettingsProps {
  conversionFormat?: ConversionFormat;
  keepOriginal: boolean;
  autoConvertAfterDownload: boolean;
  onConversionFormatChange: (format?: ConversionFormat) => void;
  onKeepOriginalChange: (keep: boolean) => void;
  onAutoConvertAfterDownloadChange: (enabled: boolean) => void;
  disabled?: boolean;
}

const formatInfo = {
  [ConversionFormat.H264]: {
    name: 'H.264 High Profile',
    description: 'Standard delivery format - excellent compression with wide compatibility',
    useCase: 'Web delivery, streaming, general playback',
    extension: 'mp4',
    quality: 'High',
    size: 'Small',
    compatibility: 'Universal',
  },
  [ConversionFormat.DNxHR]: {
    name: 'DNxHR SQ',
    description: 'Professional intermediate codec for Avid editing workflows',
    useCase: 'Avid Media Composer, professional editing',
    extension: 'mov',
    quality: 'Broadcast',
    size: 'Large',
    compatibility: 'Professional',
  },
  [ConversionFormat.ProRes]: {
    name: 'ProRes Proxy',
    description: 'Apple professional codec optimized for editing performance',
    useCase: 'Final Cut Pro, Premiere Pro, DaVinci Resolve',
    extension: 'mov',
    quality: 'Professional',
    size: 'Medium',
    compatibility: 'Professional',
  },
  [ConversionFormat.MP3]: {
    name: 'MP3 Audio',
    description: 'Extract high-quality audio only (320kbps)',
    useCase: 'Audio podcasts, music, sound effects',
    extension: 'mp3',
    quality: 'High',
    size: 'Very Small',
    compatibility: 'Universal',
  },
};

export function ConversionSettings({
  conversionFormat,
  keepOriginal,
  autoConvertAfterDownload,
  onConversionFormatChange,
  onKeepOriginalChange,
  onAutoConvertAfterDownloadChange,
  disabled = false,
}: ConversionSettingsProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handleFormatChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === 'none') {
      onConversionFormatChange(undefined);
    } else {
      onConversionFormatChange(value as ConversionFormat);
    }
  }, [onConversionFormatChange]);

  const getFormatIcon = (format: ConversionFormat) => {
    return format === ConversionFormat.MP3 ? <AudioIcon /> : <VideoIcon />;
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'Broadcast': return 'success';
      case 'Professional': return 'primary';
      case 'High': return 'info';
      default: return 'default';
    }
  };

  return (
    <Card
      sx={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <SettingsIcon />
          <Typography variant="h6">
            Conversion Settings
          </Typography>
          <Tooltip title="Show format details">
            <IconButton
              size="small"
              onClick={() => setShowDetails(!showDetails)}
              sx={{ ml: 'auto' }}
            >
              <InfoIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <FormControl component="fieldset" fullWidth disabled={disabled}>
          <FormLabel component="legend" sx={{ mb: 2 }}>
            Output Format
          </FormLabel>
          
          <RadioGroup
            value={conversionFormat || 'none'}
            onChange={handleFormatChange}
          >
            <FormControlLabel
              value="none"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1">
                    Keep Original Format
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    No conversion - fastest processing
                  </Typography>
                </Box>
              }
            />

            <Divider sx={{ my: 1 }} />

            {Object.entries(formatInfo).map(([format, info]) => (
              <FormControlLabel
                key={format}
                value={format}
                control={<Radio />}
                label={
                  <Box display="flex" alignItems="center" gap={1} width="100%">
                    {getFormatIcon(format as ConversionFormat)}
                    <Box flex={1}>
                      <Typography variant="body1">
                        {info.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {info.description}
                      </Typography>
                      {showDetails && (
                        <Box display="flex" gap={0.5} mt={0.5} flexWrap="wrap">
                          <Chip
                            label={`Quality: ${info.quality}`}
                            size="small"
                            color={getQualityColor(info.quality) as any}
                            variant="outlined"
                          />
                          <Chip
                            label={`Size: ${info.size}`}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={info.extension.toUpperCase()}
                            size="small"
                            variant="outlined"
                          />
                        </Box>
                      )}
                    </Box>
                  </Box>
                }
                sx={{ mb: 1, alignItems: 'flex-start' }}
              />
            ))}
          </RadioGroup>

          {conversionFormat && showDetails && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Use Case:</strong> {formatInfo[conversionFormat].useCase}
              </Typography>
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          <FormControlLabel
            control={
              <Switch
                checked={keepOriginal}
                onChange={(e) => onKeepOriginalChange(e.target.checked)}
                disabled={disabled || !conversionFormat}
              />
            }
            label={
              <Box>
                <Typography variant="body1">
                  Keep Original File
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Save both original and converted versions
                </Typography>
              </Box>
            }
          />

          <FormControlLabel
            control={
              <Switch
                checked={autoConvertAfterDownload}
                onChange={(e) => onAutoConvertAfterDownloadChange(e.target.checked)}
                disabled={disabled || !conversionFormat}
              />
            }
            label={
              <Box>
                <Typography variant="body1">
                  Auto-convert After Download
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Automatically convert videos when downloads complete
                </Typography>
              </Box>
            }
          />

          {!conversionFormat && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
              Select a conversion format to enable additional options
            </Typography>
          )}
        </FormControl>
      </CardContent>
    </Card>
  );
}