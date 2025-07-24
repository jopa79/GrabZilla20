import { useState, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Box, Tabs, Tab } from '@mui/material';
import { theme } from './styles/theme';
import { URLInput } from './components/URLInput';
// import { URLExtractionModal } from './components/URLExtractionModal'; // REMOVED: Direct queue workflow
import { DownloadQueue } from './components/DownloadQueue';
import { SettingsPanel } from './components/SettingsPanel';
import { DuplicateConfirmationModal } from './components/DuplicateConfirmationModal';
import { URLExtractionResult } from './types';
import { useDownloads } from './hooks/useDownloads';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
      style={{ minHeight: '400px' }}
    >
      {value === index && children}
    </div>
  );
}

function App() {
  console.log('=== FRONTEND: App component mounting ===');
  
  // const [extractionResult, setExtractionResult] = useState<URLExtractionResult | null>(null); // Unused in direct-to-queue workflow
  // const [modalOpen, setModalOpen] = useState(false); // REMOVED: No longer using modal
  const [currentTab, setCurrentTab] = useState(0);
  
  const {
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
    duplicateConfirmation,
    handleDuplicateConfirmation,
    closeDuplicateConfirmation,
  } = useDownloads();

  // New action handlers for the three button types
  const handleDownloadOnly = useCallback((id: string) => {
    // Start download without conversion
    startDownload(id);
  }, [startDownload]);

  const handleDownloadAndConvert = useCallback((id: string) => {
    // Start download with auto-conversion enabled for this specific item
    startDownloadWithConversion(id);
  }, [startDownloadWithConversion]);

  const handleConvertOnly = useCallback((id: string) => {
    // Convert an already completed download
    convertVideo(id);
  }, [convertVideo]);

  const handleURLsExtracted = useCallback((result: URLExtractionResult) => {
    console.log('=== APP: URLs extracted:', result.valid_urls, 'valid URLs');
    if (result.valid_urls > 0) {
      // Skip modal - add URLs directly to queue
      console.log('=== APP: Adding URLs directly to queue (no popup) ===');
      addDownloads(result.urls.filter(url => url.is_valid));
    }
  }, [addDownloads]);

  // REMOVED: Modal handlers no longer needed since URLs go directly to queue
  // const handleConfirmURLs = useCallback((selectedUrls: ExtractedUrl[]) => {
  //   addDownloads(selectedUrls);
  //   setModalOpen(false);
  // }, [addDownloads]);

  // const handleCloseModal = useCallback(() => {
  //   setModalOpen(false);
  // }, []);

  const handleTabChange = useCallback((_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  }, []);

  const handleOpenOutputFolder = useCallback(() => {
    // TODO: Implement folder browser dialog with Tauri
    console.log('Open folder browser for:', settings.outputDirectory);
  }, [settings.outputDirectory]);

  const handleResetSettings = useCallback(() => {
    updateSettings({
      maxConcurrentDownloads: 5,
      defaultQuality: '1080p',
      outputDirectory: '~/Desktop/GrabZilla',
      conversionFormat: undefined,
      keepOriginal: true,
      notificationsEnabled: true,
      onUrlDuplicate: 'ask',
      onFileDuplicate: 'ask',
      showDuplicateWarnings: true,
      autoConvertAfterDownload: false,
    });
  }, [updateSettings]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 100%)',
          color: 'white',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: 2,
            minHeight: '100vh',
          }}
        >
          {/* Header */}
          <Box sx={{ mb: 1.5 }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
              GrabZilla 2.0
            </h1>
          </Box>

          {/* URL Input Component */}
          <URLInput onURLsExtracted={handleURLsExtracted} />

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'rgba(255, 255, 255, 0.1)', mb: 1.5 }}>
            <Tabs 
              value={currentTab} 
              onChange={handleTabChange}
              sx={{
                '& .MuiTab-root': {
                  color: 'rgba(255, 255, 255, 0.7)',
                  '&.Mui-selected': {
                    color: 'white',
                  },
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: 'primary.main',
                },
              }}
            >
              <Tab label={`Downloads (${downloads.length})`} />
              <Tab label="Settings" />
            </Tabs>
          </Box>

          {/* Tab Panels */}
          <Box>
            <TabPanel value={currentTab} index={0}>
              <DownloadQueue
                items={downloads}
                onStart={startDownload}
                onPause={pauseDownload}
                onStop={stopDownload}
                onRetry={retryDownload}
                onRemove={removeDownload}
                onClearAll={clearAllDownloads}
                onStartAll={startAllDownloads}
                onPauseAll={pauseAllDownloads}
                onOpenFolder={openFolder}
                onConvertAll={convertAllCompleted}
                onDownloadOnly={handleDownloadOnly}
                onDownloadAndConvert={handleDownloadAndConvert}
                onConvertOnly={handleConvertOnly}
              />
            </TabPanel>

            <TabPanel value={currentTab} index={1}>
              <SettingsPanel
                maxConcurrentDownloads={settings.maxConcurrentDownloads}
                onMaxConcurrentChange={(value) => updateSettings({ maxConcurrentDownloads: value })}
                defaultQuality={settings.defaultQuality}
                onDefaultQualityChange={(quality) => updateSettings({ defaultQuality: quality })}
                outputDirectory={settings.outputDirectory}
                onOutputDirectoryChange={(dir) => updateSettings({ outputDirectory: dir })}
                conversionFormat={settings.conversionFormat}
                keepOriginal={settings.keepOriginal}
                onConversionFormatChange={(format) => updateSettings({ conversionFormat: format })}
                onKeepOriginalChange={(keep) => updateSettings({ keepOriginal: keep })}
                notificationsEnabled={settings.notificationsEnabled}
                onNotificationsEnabledChange={(enabled) => updateSettings({ notificationsEnabled: enabled })}
                onUrlDuplicate={settings.onUrlDuplicate}
                onUrlDuplicateChange={(action) => updateSettings({ onUrlDuplicate: action })}
                onFileDuplicate={settings.onFileDuplicate}
                onFileDuplicateChange={(action) => updateSettings({ onFileDuplicate: action })}
                showDuplicateWarnings={settings.showDuplicateWarnings}
                onShowDuplicateWarningsChange={(show) => updateSettings({ showDuplicateWarnings: show })}
                autoConvertAfterDownload={settings.autoConvertAfterDownload}
                onAutoConvertAfterDownloadChange={(enabled) => updateSettings({ autoConvertAfterDownload: enabled })}
                onOpenOutputFolder={handleOpenOutputFolder}
                onResetSettings={handleResetSettings}
              />
            </TabPanel>
          </Box>

          {/* Duplicate Confirmation Modal */}
          <DuplicateConfirmationModal
            open={!!duplicateConfirmation}
            duplicateInfo={duplicateConfirmation ? {
              url: duplicateConfirmation.url,
              duplicateCheck: duplicateConfirmation.duplicateCheck
            } : null}
            onConfirm={handleDuplicateConfirmation}
            onClose={closeDuplicateConfirmation}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;