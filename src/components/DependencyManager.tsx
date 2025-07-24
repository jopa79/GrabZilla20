import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Chip,
  Grid,
  Divider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface DependencyInfo {
  name: string;
  version?: string;
  installed: boolean;
  path?: string;
  size?: number;
}

interface DependencyStatus {
  yt_dlp: DependencyInfo;
  ffmpeg: DependencyInfo;
  all_installed: boolean;
}

interface InstallProgress {
  dependency: string;
  stage: string;
  progress: number;
  message: string;
}

const DependencyManager: React.FC = () => {
  const [status, setStatus] = useState<DependencyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<{ [key: string]: boolean }>({});
  const [installProgress, setInstallProgress] = useState<{ [key: string]: InstallProgress }>({});
  const [error, setError] = useState<string | null>(null);
  const [uninstallDialog, setUninstallDialog] = useState<string | null>(null);

  const checkDependencies = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke<DependencyStatus>('check_dependencies');
      setStatus(result);
    } catch (err) {
      setError(`Failed to check dependencies: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const installDependency = async (dependency: 'yt-dlp' | 'ffmpeg') => {
    try {
      setInstalling(prev => ({ ...prev, [dependency]: true }));
      setError(null);
      
      const command = dependency === 'yt-dlp' ? 'install_yt_dlp' : 'install_ffmpeg';
      await invoke(command);
      
      // Refresh status after installation
      await checkDependencies();
    } catch (err) {
      setError(`Failed to install ${dependency}: ${err}`);
    } finally {
      setInstalling(prev => ({ ...prev, [dependency]: false }));
      setInstallProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[dependency];
        return newProgress;
      });
    }
  };

  const uninstallDependency = async (dependency: string) => {
    try {
      setError(null);
      await invoke('uninstall_dependency', { dependency });
      await checkDependencies();
      setUninstallDialog(null);
    } catch (err) {
      setError(`Failed to uninstall ${dependency}: ${err}`);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  useEffect(() => {
    checkDependencies();

    // Listen for install progress events
    const unlisten = listen<InstallProgress>('dependency_install_progress', (event) => {
      const progress = event.payload;
      setInstallProgress(prev => ({
        ...prev,
        [progress.dependency]: progress
      }));
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const renderDependencyCard = (dep: DependencyInfo) => {
    const isInstalling = installing[dep.name];
    const progress = installProgress[dep.name];

    return (
      <Card key={dep.name} variant="outlined" sx={{ height: '100%' }}>
        <CardContent>
          <Box display="flex" alignItems="center" mb={2}>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              {dep.name === 'yt-dlp' ? 'yt-dlp' : 'FFmpeg'}
            </Typography>
            {dep.installed ? (
              <Chip
                icon={<CheckCircleIcon />}
                label="Installed"
                color="success"
                size="small"
              />
            ) : (
              <Chip
                icon={<ErrorIcon />}
                label="Missing"
                color="error"
                size="small"
              />
            )}
          </Box>

          {dep.installed && (
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                Version: {dep.version || 'Unknown'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Size: {formatFileSize(dep.size)}
              </Typography>
              {dep.path && (
                <Typography 
                  variant="body2" 
                  color="text.secondary"
                  sx={{ 
                    wordBreak: 'break-all',
                    fontSize: '0.75rem',
                    mt: 1
                  }}
                >
                  Path: {dep.path}
                </Typography>
              )}
            </Box>
          )}

          {isInstalling && progress && (
            <Box mb={2}>
              <Typography variant="body2" gutterBottom>
                {progress.message}
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={progress.progress} 
                sx={{ mb: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                {progress.stage} - {Math.round(progress.progress)}%
              </Typography>
            </Box>
          )}

          <Box display="flex" gap={1}>
            {!dep.installed ? (
              <Button
                variant="contained"
                startIcon={isInstalling ? <CircularProgress size={16} /> : <DownloadIcon />}
                onClick={() => installDependency(dep.name as 'yt-dlp' | 'ffmpeg')}
                disabled={isInstalling}
                fullWidth
              >
                {isInstalling ? 'Installing...' : 'Install'}
              </Button>
            ) : (
              <Button
                variant="outlined"
                startIcon={<DeleteIcon />}
                onClick={() => setUninstallDialog(dep.name)}
                color="warning"
                fullWidth
              >
                Uninstall
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Checking dependencies...
        </Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" component="h2">
          Dependencies
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={checkDependencies}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {status && (
        <>
          {status.all_installed ? (
            <Alert severity="success" sx={{ mb: 3 }}>
              All dependencies are installed and ready to use!
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Some dependencies are missing. Install them to enable full functionality.
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              {renderDependencyCard(status.yt_dlp)}
            </Grid>
            <Grid item xs={12} md={6}>
              {renderDependencyCard(status.ffmpeg)}
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="body2" color="text.secondary">
            <strong>yt-dlp:</strong> Required for downloading videos from supported platforms.
            <br />
            <strong>FFmpeg:</strong> Required for video conversion and transcoding features.
            <br />
            Dependencies are stored within the application and don't affect your system.
          </Typography>
        </>
      )}

      {/* Uninstall Confirmation Dialog */}
      <Dialog
        open={!!uninstallDialog}
        onClose={() => setUninstallDialog(null)}
      >
        <DialogTitle>Confirm Uninstall</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to uninstall {uninstallDialog}? 
            This will remove the dependency from the application.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUninstallDialog(null)}>
            Cancel
          </Button>
          <Button 
            onClick={() => uninstallDialog && uninstallDependency(uninstallDialog)}
            color="warning"
            variant="contained"
          >
            Uninstall
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DependencyManager;