import React, { useState } from 'react';
import { Container, Box, Typography, ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material';
import { YoutubeInput } from './components/YoutubeInput';
import { FileList } from './components/FileList';
import { ThemeToggle } from './components/ThemeToggle';
import { ThemeProvider } from './context/ThemeContext';
import './styles/theme.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#ff0000',
    },
  },
});

const App: React.FC = () => {
  const [convertedFiles, setConvertedFiles] = useState<string[]>([]);

  const handleFileConverted = (filePath: string) => {
    setConvertedFiles([...convertedFiles, filePath]);
  };

  return (
    <ThemeProvider>
      <MuiThemeProvider theme={theme}>
        <div className="App">
          <ThemeToggle />
          <Container maxWidth="md">
            <Box sx={{ my: 4 }}>
              <Typography variant="h3" component="h1" gutterBottom align="center">
                YouTube to MP3 Converter
              </Typography>
              <YoutubeInput onFileConverted={handleFileConverted} />
              <FileList files={convertedFiles} />
            </Box>
          </Container>
        </div>
      </MuiThemeProvider>
    </ThemeProvider>
  );
};

export default App; 