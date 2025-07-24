import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2196F3', // Material Blue
      light: '#64B5F6',
      dark: '#1976D2',
    },
    secondary: {
      main: '#4CAF50', // Material Green for success states
      light: '#81C784',
      dark: '#388E3C',
    },
    error: {
      main: '#F44336', // Material Red for error states
      light: '#EF5350',
      dark: '#D32F2F',
    },
    background: {
      default: '#1A1A1A',
      paper: '#2D2D2D',
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.87)',
      secondary: 'rgba(255, 255, 255, 0.6)',
      disabled: 'rgba(255, 255, 255, 0.38)',
    },
    action: {
      hover: 'rgba(255, 255, 255, 0.08)',
      selected: 'rgba(255, 255, 255, 0.12)',
      disabled: 'rgba(255, 255, 255, 0.26)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      color: 'rgba(255, 255, 255, 0.87)',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      color: 'rgba(255, 255, 255, 0.87)',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      color: 'rgba(255, 255, 255, 0.87)',
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      color: 'rgba(255, 255, 255, 0.87)',
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      color: 'rgba(255, 255, 255, 0.87)',
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      color: 'rgba(255, 255, 255, 0.87)',
    },
    body1: {
      fontSize: '1rem',
      color: 'rgba(255, 255, 255, 0.87)',
    },
    body2: {
      fontSize: '0.875rem',
      color: 'rgba(255, 255, 255, 0.6)',
    },
    caption: {
      fontSize: '0.75rem',
      color: 'rgba(255, 255, 255, 0.6)',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#6b6b6b #2b2b2b',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: '#2b2b2b',
            width: 8,
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 8,
            backgroundColor: '#6b6b6b',
            minHeight: 24,
            border: '2px solid #2b2b2b',
          },
          '&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus': {
            backgroundColor: '#959595',
          },
          '&::-webkit-scrollbar-thumb:active, & *::-webkit-scrollbar-thumb:active': {
            backgroundColor: '#959595',
          },
          '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#959595',
          },
          '&::-webkit-scrollbar-corner, & *::-webkit-scrollbar-corner': {
            backgroundColor: '#2b2b2b',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.23)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.4)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#2196F3',
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#2D2D2D',
        },
      },
    },
  },
  shape: {
    borderRadius: 8,
  },
});