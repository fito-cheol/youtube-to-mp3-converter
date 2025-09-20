import React, { useState, useEffect } from 'react';
import { TextField, Button, Box, CircularProgress, Alert, Card, CardMedia, Slider, Typography, List, ListItem, ListItemText, ListItemButton, Checkbox, Divider, LinearProgress } from '@mui/material';
import axios from 'axios';
import { useWebSocket } from '../hooks/useWebSocket';

interface YoutubeInputProps {
  onFileConverted: (filePath: string) => void;
}

interface TimeRange {
  start: number;
  end: number;
}

interface PlaylistVideo {
  videoId: string;
  title: string;
  url: string;
  duration: number;
}

interface PlaylistInfo {
  playlistId: string;
  videos: PlaylistVideo[];
  totalVideos: number;
}

export const YoutubeInput: React.FC<YoutubeInputProps> = ({ onFileConverted }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<TimeRange>({ start: 0, end: 0 });
  const [queue, setQueue] = useState<Array<{ url: string; timeRange: TimeRange }>>([]);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  
  // WebSocket 훅 사용
  const { 
    isConnected, 
    conversionProgress, 
    conversionComplete, 
    conversionError, 
    getSocketId 
  } = useWebSocket();

  const extractVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const extractPlaylistId = (url: string) => {
    const playlistRegex = /[?&]list=([^&]+)/;
    const match = url.match(playlistRegex);
    return match ? match[1] : null;
  };

  const isPlaylistUrl = (url: string) => {
    return extractPlaylistId(url) !== null;
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const playlistId = extractPlaylistId(url);
    const videoId = extractVideoId(url);
    
    if (playlistId) {
      // Handle playlist URL
      setIsPlaylist(true);
      setThumbnail(null);
      setVideoDuration(0);
      setTimeRange({ start: 0, end: 0 });
      setPlaylistInfo(null);
      setSelectedVideos(new Set());
      
      const fetchPlaylistInfo = async () => {
        try {
          setLoadingPlaylist(true);
          setError(null);
          const response = await axios.post('http://localhost:3001/api/playlist-info', { url });
          setPlaylistInfo(response.data);
          // Select all videos by default
          setSelectedVideos(new Set(response.data.videos.map((v: PlaylistVideo) => v.videoId)));
        } catch (error) {
          console.error('Error fetching playlist info:', error);
          setError('Failed to fetch playlist information');
        } finally {
          setLoadingPlaylist(false);
        }
      };
      fetchPlaylistInfo();
    } else if (videoId) {
      // Handle single video URL
      setIsPlaylist(false);
      setPlaylistInfo(null);
      setSelectedVideos(new Set());
      setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
      
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
      setIsPlaylist(false);
      setThumbnail(null);
      setVideoDuration(0);
      setTimeRange({ start: 0, end: 0 });
      setPlaylistInfo(null);
      setSelectedVideos(new Set());
    }
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    if (isPlaylist && playlistInfo) {
      // Add selected videos from playlist to queue
      const selectedVideoUrls = playlistInfo.videos
        .filter(video => selectedVideos.has(video.videoId))
        .map(video => ({ url: video.url, timeRange: { start: 0, end: video.duration } }));
      
      setQueue(prev => [...prev, ...selectedVideoUrls]);
    } else {
      // Enqueue single video
      const item = { url, timeRange: { ...timeRange } };
      setQueue(prev => [...prev, item]);
    }

    // Reset input for next entry
    setUrl('');
    setThumbnail(null);
    setVideoDuration(0);
    setTimeRange({ start: 0, end: 0 });
      setPlaylistInfo(null);
      setSelectedVideos(new Set());
      setIsPlaylist(false);
      setLoadingPlaylist(false);
  };

  const handleTimeRangeChange = (event: Event, newValue: number | number[]) => {
    if (Array.isArray(newValue)) {
      setTimeRange({ start: newValue[0], end: newValue[1] });
    }
  };

  const handleVideoSelection = (videoId: string) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideos(newSelected);
  };

  const handleSelectAll = () => {
    if (playlistInfo) {
      if (selectedVideos.size === playlistInfo.videos.length) {
        setSelectedVideos(new Set());
      } else {
        setSelectedVideos(new Set(playlistInfo.videos.map(v => v.videoId)));
      }
    }
  };

  // WebSocket으로 변환 완료 받기
  useEffect(() => {
    if (conversionComplete) {
      onFileConverted(conversionComplete.filePath);
      setQueue(prev => prev.slice(1));
      setLoading(false);
    }
  }, [conversionComplete, onFileConverted]);

  // WebSocket으로 변환 에러 받기
  useEffect(() => {
    if (conversionError) {
      setError(conversionError.message);
      setQueue(prev => prev.slice(1));
      setLoading(false);
    }
  }, [conversionError]);

  // Process queue sequentially
  useEffect(() => {
    const processNext = async () => {
      if (loading || queue.length === 0) return;
      setError(null);
      setLoading(true);
      const next = queue[0];
      try {
        const response = await axios.post('http://localhost:3001/api/convert', {
          url: next.url,
          startTime: next.timeRange.start,
          endTime: next.timeRange.end,
          socketId: getSocketId() // WebSocket ID 전달
        });
        // WebSocket으로 완료를 받으므로 여기서는 처리하지 않음
        // onFileConverted(response.data.filePath);
      } catch (err) {
        console.error('Error converting video:', err);
        setError('Failed to convert a queued video. Continuing with next item.');
        setQueue(prev => prev.slice(1));
        setLoading(false);
      }
    };
    processNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, loading, getSocketId]);

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 4 }}>
      {/* WebSocket 연결 상태 표시 */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isConnected ? 'green' : 'red'
          }}
        />
        <Typography variant="caption" color={isConnected ? 'green' : 'red'}>
          {isConnected ? '실시간 연결됨' : '연결 끊김'}
        </Typography>
      </Box>

      <TextField
        fullWidth
        label="YouTube URL (Video or Playlist)"
        variant="outlined"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        sx={{ mb: 2 }}
        placeholder="https://www.youtube.com/watch?v=... or https://www.youtube.com/playlist?list=..."
      />
      
      {isPlaylist && (
        <Card sx={{ mb: 2 }}>
          <Box sx={{ p: 2 }}>
            {loadingPlaylist ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                <CircularProgress sx={{ mr: 2 }} />
                <Typography>Loading playlist videos...</Typography>
              </Box>
            ) : playlistInfo ? (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Playlist: {playlistInfo.totalVideos} videos
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleSelectAll}
                  >
                    {selectedVideos.size === playlistInfo.videos.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </Box>
                <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {playlistInfo.videos.map((video, index) => (
                    <ListItem key={video.videoId} disablePadding>
                      <ListItemButton
                        onClick={() => handleVideoSelection(video.videoId)}
                        sx={{ py: 1 }}
                      >
                        <Checkbox
                          checked={selectedVideos.has(video.videoId)}
                          onChange={() => handleVideoSelection(video.videoId)}
                        />
                        <ListItemText
                          primary={video.title}
                          secondary={`${formatTime(video.duration)} • ${index + 1}/${playlistInfo.totalVideos}`}
                          sx={{ ml: 1 }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            ) : null}
          </Box>
        </Card>
      )}

      {!isPlaylist && thumbnail && (
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
      {/* 변환 진행률 표시 */}
      {conversionProgress && (
        <Card sx={{ mb: 2, p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {conversionProgress.message}
          </Typography>
          <LinearProgress />
        </Card>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {!!queue.length && (
        <Alert severity="info" sx={{ mb: 2 }}>
          대기열: {queue.length}개 {queue.length === 1 ? '항목' : '항목'} {loading ? '(처리 중...)' : ''}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={!url || (isPlaylist && selectedVideos.size === 0)}
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
      >
        {isPlaylist 
          ? `선택된 ${selectedVideos.size}개 비디오를 대기열에 추가`
          : loading 
            ? '대기열에 추가' 
            : '변환 / 대기열에 추가'
        }
      </Button>
    </Box>
  );
}; 