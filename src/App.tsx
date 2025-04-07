import React, { useState } from 'react';
import { Container, Box, Typography, ThemeProvider, createTheme } from '@mui/material';
import { YoutubeInput } from './components/YoutubeInput.tsx';
import { FileList } from './components/FileList.tsx';

const theme = createTheme({
  palette: {
    primary: {
      main: '#ff0000',
    },
  },
});

function App() {
  const [convertedFiles, setConvertedFiles] = useState<string[]>([]);

  const handleFileConverted = (filePath: string) => {
    setConvertedFiles([...convertedFiles, filePath]);
  };

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="md">
        <Box sx={{ my: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom align="center">
            YouTube to MP3 Converter
          </Typography>
          <YoutubeInput onFileConverted={handleFileConverted} />
          <FileList files={convertedFiles} />
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App; 