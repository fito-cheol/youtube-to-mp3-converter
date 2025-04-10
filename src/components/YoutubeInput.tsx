import React, { useState, useEffect } from 'react';
import { TextField, Button, Box, CircularProgress, Alert, Card, CardMedia, Slider, Typography } from '@mui/material';
import axios from 'axios';

interface YoutubeInputProps {
  onFileConverted: (filePath: string) => void;
}

interface TimeRange {
  start: number;
  end: number;
}

export const YoutubeInput: React.FC<YoutubeInputProps> = ({ onFileConverted }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<TimeRange>({ start: 0, end: 0 });

  const extractVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const videoId = extractVideoId(url);
    if (videoId) {
      setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
      // YouTube API를 통해 영상 길이 가져오기
      const fetchVideoDuration = async () => {
        try {
          const response = await axios.post('http://localhost:3001/api/video-info', { url });
          setVideoDuration(response.data.duration);
          setTimeRange({ start: 0, end: response.data.duration });
        } catch (error) {
          console.error('Error fetching video duration:', error);
        }
      };
      fetchVideoDuration();
    } else {
      setThumbnail(null);
      setVideoDuration(0);
      setTimeRange({ start: 0, end: 0 });
    }
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('http://localhost:3001/api/convert', { 
        url,
        startTime: timeRange.start,
        endTime: timeRange.end
      });
      onFileConverted(response.data.filePath);
      setUrl('');
      setThumbnail(null);
      setVideoDuration(0);
      setTimeRange({ start: 0, end: 0 });
    } catch (error) {
      console.error('Error converting video:', error);
      setError('Failed to convert video. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeRangeChange = (event: Event, newValue: number | number[]) => {
    if (Array.isArray(newValue)) {
      setTimeRange({ start: newValue[0], end: newValue[1] });
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
          {videoDuration > 0 && (
            <Box sx={{ px: 2, py: 3 }}>
              <Typography gutterBottom>
                Select video range: {formatTime(timeRange.start)} - {formatTime(timeRange.end)}
              </Typography>
              <Slider
                value={[timeRange.start, timeRange.end]}
                onChange={handleTimeRangeChange}
                valueLabelDisplay="auto"
                valueLabelFormat={formatTime}
                min={0}
                max={videoDuration}
                sx={{ mt: 2 }}
              />
            </Box>
          )}
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