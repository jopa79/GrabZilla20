import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Collapse,
} from '@mui/material';
import {
  Security as SecurityIcon,
  VerifiedUser as VerifiedIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
  ExpandMore as ExpandIcon,
  AdminPanelSettings as AdminIcon,
  NetworkCheck as NetworkIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import { TauriAPI, isTauriEnvironment } from '../services/tauri-api';

interface SecurityCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  recommendation?: string;
}

export function SecurityStatus() {
  const [isElevated, setIsElevated] = useState<boolean>(false);
  const [securityChecks, setSecurityChecks] = useState<SecurityCheck[]>([]);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isTauriEnvironment()) {
      performSecurityChecks();
    } else {
      // Mock data for development
      setSecurityChecks([
        {
          name: 'Privilege Level',
          status: 'pass',
          description: 'Running with standard user privileges',
        },
        {
          name: 'Network Access',
          status: 'pass',
          description: 'Network access restricted to whitelisted domains',
        },
        {
          name: 'File System',
          status: 'pass',
          description: 'File access restricted to safe directories',
        },
      ]);
      setLoading(false);
    }
  }, []);

  const performSecurityChecks = async () => {
    try {
      const checks: SecurityCheck[] = [];

      // Check privilege elevation
      const elevated = await TauriAPI.checkPrivilegeElevation();
      setIsElevated(elevated);
      
      checks.push({
        name: 'Privilege Level',
        status: elevated ? 'warning' : 'pass',
        description: elevated 
          ? 'Running with elevated privileges (Administrator/Root)'
          : 'Running with standard user privileges',
        recommendation: elevated 
          ? 'Consider running without administrator privileges for better security'
          : undefined,
      });

      // Test network access validation
      const testUrls = [
        'https://youtube.com/test',
        'https://malicious-site.com/test',
        'http://localhost:8080/test',
      ];
      
      let allowedCount = 0;
      let blockedCount = 0;
      
      for (const url of testUrls) {
        const isAllowed = await TauriAPI.validateNetworkUrl(url);
        if (isAllowed) allowedCount++;
        else blockedCount++;
      }

      checks.push({
        name: 'Network Access Control',
        status: blockedCount > 0 ? 'pass' : 'warning',
        description: `${allowedCount} allowed, ${blockedCount} blocked out of ${testUrls.length} test URLs`,
        recommendation: blockedCount === 0 
          ? 'Network filtering may not be working correctly'
          : undefined,
      });

      // Test file path validation
      try {
        await TauriAPI.validateFilePath('../../../etc/passwd');
        checks.push({
          name: 'File System Protection',
          status: 'fail',
          description: 'Directory traversal attack possible',
          recommendation: 'File path validation is not working properly',
        });
      } catch {
        checks.push({
          name: 'File System Protection',
          status: 'pass',
          description: 'Directory traversal attacks blocked',
        });
      }

      setSecurityChecks(checks);
    } catch (error) {
      console.error('Security check failed:', error);
      setSecurityChecks([{
        name: 'Security Check',
        status: 'fail',
        description: 'Failed to perform security validation',
        recommendation: 'Security system may not be functioning correctly',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const getOverallStatus = () => {
    if (securityChecks.some(check => check.status === 'fail')) return 'fail';
    if (securityChecks.some(check => check.status === 'warning')) return 'warning';
    return 'pass';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckIcon color="success" />;
      case 'warning': return <WarningIcon color="warning" />;
      case 'fail': return <ErrorIcon color="error" />;
      default: return <SecurityIcon />;
    }
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' => {
    switch (status) {
      case 'pass': return 'success';
      case 'warning': return 'warning';
      case 'fail': return 'error';
      default: return 'success';
    }
  };

  const overallStatus = getOverallStatus();

  if (loading) {
    return (
      <Card sx={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1}>
            <SecurityIcon />
            <Typography variant="h6">Security Status</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Performing security checks...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <SecurityIcon />
            <Typography variant="h6">Security Status</Typography>
            <Chip
              label={overallStatus.toUpperCase()}
              color={getStatusColor(overallStatus)}
              size="small"
              variant="outlined"
            />
          </Box>
          <Tooltip title={expanded ? 'Hide details' : 'Show details'}>
            <IconButton
              onClick={() => setExpanded(!expanded)}
              sx={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <ExpandIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* High-level security alert */}
        {isElevated && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Box display="flex" alignItems="center" gap={1}>
              <AdminIcon />
              <Typography variant="body2">
                <strong>Running with elevated privileges.</strong> Consider restarting without administrator rights for improved security.
              </Typography>
            </Box>
          </Alert>
        )}

        {/* Security status summary */}
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          {getStatusIcon(overallStatus)}
          <Typography variant="body1">
            {overallStatus === 'pass' && 'All security checks passed'}
            {overallStatus === 'warning' && 'Some security warnings detected'}
            {overallStatus === 'fail' && 'Security vulnerabilities detected'}
          </Typography>
        </Box>

        <Collapse in={expanded}>
          <List dense>
            {securityChecks.map((check, index) => (
              <ListItem key={index} sx={{ px: 0 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {check.name.includes('Privilege') && <AdminIcon />}
                  {check.name.includes('Network') && <NetworkIcon />}
                  {check.name.includes('File') && <FolderIcon />}
                  {!check.name.includes('Privilege') && !check.name.includes('Network') && !check.name.includes('File') && <VerifiedIcon />}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2">{check.name}</Typography>
                      <Chip
                        label={check.status}
                        color={getStatusColor(check.status)}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        {check.description}
                      </Typography>
                      {check.recommendation && (
                        <Typography variant="caption" color="warning.main" display="block">
                          ⚠️ {check.recommendation}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Collapse>

        {!expanded && securityChecks.some(check => check.recommendation) && (
          <Typography variant="caption" color="text.secondary">
            Click to view security recommendations
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}