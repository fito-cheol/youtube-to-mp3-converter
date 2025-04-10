import React, { useState, useEffect } from 'react';
import { TextField, Button, Box, CircularProgress, Alert, Card, CardMedia } from '@mui/material';
import axios from 'axios';

interface YoutubeInputProps {
  onFileConverted: (filePath: string) => void;
}

export const YoutubeInput: React.FC<YoutubeInputProps> = ({ onFileConverted }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const extractVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  useEffect(() => {
    const videoId = extractVideoId(url);
    if (videoId) {
      // YouTube 썸네일 URL 설정 (고품질 버전 사용)
      setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
    } else {
      setThumbnail(null);
    }
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('http://localhost:3001/api/convert', { url });
      onFileConverted(response.data.filePath);
      setUrl('');
      setThumbnail(null);
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
      {thumbnail && (
        <Card sx={{ mb: 2, maxWidth: 480, mx: 'auto' }}>
          <CardMedia
            component="img"
            image={thumbnail}
            alt="Video thumbnail"
            sx={{ width: '100%', height: 'auto' }}
          />
        </Card>
      )}
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