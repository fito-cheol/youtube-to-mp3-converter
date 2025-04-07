import React, { useState } from 'react';
import { TextField, Button, Box, CircularProgress, Alert } from '@mui/material';
import axios from 'axios';

interface YoutubeInputProps {
  onFileConverted: (filePath: string) => void;
}

export const YoutubeInput: React.FC<YoutubeInputProps> = ({ onFileConverted }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('http://localhost:3001/api/convert', { url });
      onFileConverted(response.data.filePath);
      setUrl('');
    } catch (error) {
      console.error('Error converting video:', error);
      setError('Failed to convert video. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 4 }}>
      <TextField
        fullWidth
        label="YouTube URL"
        variant="outlined"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={loading}
        sx={{ mb: 2 }}
        placeholder="https://www.youtube.com/watch?v=..."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={loading || !url}
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
      >
        Convert to MP3
      </Button>
    </Box>
  );
}; 