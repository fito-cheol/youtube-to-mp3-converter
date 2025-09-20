import { Request, Response } from 'express';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const youtubeDl = require('youtube-dl-exec');
const { google } = require('googleapis');
const { createServer } = require('http');
const { Server } = require('socket.io');

const execAsync = promisify(exec);
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const port = process.env.BACK_PORT || 3001;

// Sanitize a string to a safe Windows filename while preserving non-ASCII letters (e.g., Korean)
function sanitizeFilename(name: string): string {
  // Remove illegal characters for Windows filenames and control chars
  const removedIllegal = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    // Trim spaces
    .trim()
    // Remove trailing dots and spaces which are not allowed
    .replace(/[\. ]+$/g, '');

  // Fallback if empty after sanitization
  const fallback = removedIllegal || 'audio';
  // Limit length to avoid very long filenames
  return fallback.slice(0, 120);
}

// YouTube API 설정
const youtube = google.youtube('v3');
const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  console.error('YouTube API key is not set. Please set YOUTUBE_API_KEY in .env file');
  process.exit(1);
}

// FFmpeg 경로 설정
const ffmpegPath = path.join(__dirname, '..', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(__dirname, '..', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffprobe.exe');

// youtube-dl 기본 옵션 설정
const defaultOptions = {
  noWarnings: true,
  noCallHome: true,
  noCheckCertificate: true,
  preferFreeFormats: true,
  youtubeSkipDashManifest: true,
  ffmpegLocation: ffmpegPath
};

app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve downloaded files
app.use('/downloads', express.static(uploadsDir));

// Function to check if a URL is a valid YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return pattern.test(url);
}

// Function to extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Function to extract playlist ID from YouTube URL
function extractPlaylistId(url: string): string | null {
  const playlistRegex = /[?&]list=([^&]+)/;
  const match = url.match(playlistRegex);
  return match ? match[1] : null;
}

// Function to check if URL is a playlist
function isPlaylistUrl(url: string): boolean {
  return extractPlaylistId(url) !== null;
}

// Helper function to get error message from unknown error
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Add a route for file downloads
app.get('/api/download/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Set headers for file download
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  // Stream the file
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// YouTube 비디오 정보 가져오기
app.post('/api/video-info', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    // Check if it's a playlist URL
    if (isPlaylistUrl(url)) {
      return res.status(400).json({ error: 'Please use /api/playlist-info for playlist URLs' });
    }
    
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // YouTube Data API를 사용하여 비디오 정보 가져오기
    const response = await youtube.videos.list({
      key: API_KEY,
      part: ['contentDetails', 'snippet'],
      id: [videoId]
    });

    if (!response.data.items || response.data.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = response.data.items[0];
    const duration = convertYouTubeDuration(video.contentDetails.duration);
    
    res.json({
      duration,
      title: video.snippet.title
    });
  } catch (error) {
    console.error('Error fetching video info:', error);
    res.status(500).json({ error: 'Failed to fetch video information' });
  }
});

// YouTube 재생목록 정보 가져오기
app.post('/api/playlist-info', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    const playlistId = extractPlaylistId(url);
    
    if (!playlistId) {
      return res.status(400).json({ error: 'Invalid playlist URL' });
    }

    console.log(`Fetching playlist: ${playlistId}`);
    
    // 모든 비디오를 가져오기 위해 페이지네이션 사용
    let allVideos: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 20; // 최대 1000개 비디오 (50 * 20)

    do {
      pageCount++;
      console.log(`Fetching page ${pageCount}...`);
      
      const response: any = await youtube.playlistItems.list({
        key: API_KEY,
        part: ['snippet'],
        playlistId: playlistId,
        maxResults: 50,
        pageToken: nextPageToken
      });

      if (!response.data.items || response.data.items.length === 0) {
        break;
      }

      allVideos = allVideos.concat(response.data.items);
      nextPageToken = response.data.nextPageToken;
      
      console.log(`Page ${pageCount}: ${response.data.items.length} videos, total: ${allVideos.length}`);
      
    } while (nextPageToken && pageCount < maxPages);

    if (allVideos.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or empty' });
    }

    console.log(`Total videos found: ${allVideos.length}`);

    const videos = allVideos.map((item: any) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
    }));

    // Get video durations in batches (YouTube API allows max 50 IDs per request)
    const videosWithDuration: any[] = [];
    const batchSize = 50;
    
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);
      const videoIds = batch.map((v: any) => v.videoId);
      
      console.log(`Fetching durations for batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(videos.length/batchSize)}...`);
      
      const videoResponse: any = await youtube.videos.list({
        key: API_KEY,
        part: ['contentDetails'],
        id: videoIds
      });

      const batchWithDuration = batch.map((video: any) => {
        const videoDetail = videoResponse.data.items?.find((item: any) => item.id === video.videoId);
        const duration = videoDetail ? convertYouTubeDuration(videoDetail.contentDetails.duration) : 0;
        return {
          ...video,
          duration
        };
      });
      
      videosWithDuration.push(...batchWithDuration);
    }
    
    console.log(`Successfully processed ${videosWithDuration.length} videos`);
    
    res.json({
      playlistId,
      videos: videosWithDuration,
      totalVideos: videosWithDuration.length
    });
  } catch (error) {
    console.error('Error fetching playlist info:', error);
    res.status(500).json({ error: 'Failed to fetch playlist information' });
  }
});

// YouTube의 duration 형식(PT1H2M10S)을 초 단위로 변환하는 함수
function convertYouTubeDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const [, hours, minutes, seconds] = match;
  return (parseInt(hours || '0') * 3600) +
         (parseInt(minutes || '0') * 60) +
         parseInt(seconds || '0');
}

// 초를 HH:MM:SS 형식으로 변환하는 함수
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

app.post('/api/convert', async (req: Request, res: Response) => {
  try {
    const { url, startTime = 0, endTime, socketId } = req.body;
    
    console.log('=== 변환 시작 ===');
    console.log('요청 파라미터:', { url, startTime, endTime, socketId });
    
    // WebSocket으로 변환 시작 알림
    if (socketId) {
      io.to(socketId).emit('conversion-started', { url, startTime, endTime });
    }
    
    // 비디오 정보 가져오기
    console.log('1. YouTube 비디오 정보 가져오는 중...');
    if (socketId) {
      io.to(socketId).emit('conversion-progress', { step: 'video-info', message: '비디오 정보를 가져오는 중...' });
    }
    
    const info = await youtubeDl(url, {
      ...defaultOptions,
      dumpSingleJson: true
    });
    console.log('비디오 정보:', { 
      title: info.title,
      duration: info.duration,
      format: info.format
    });
    
    if (socketId) {
      io.to(socketId).emit('conversion-progress', { 
        step: 'video-info-complete', 
        message: '비디오 정보 수집 완료',
        videoInfo: { title: info.title, duration: info.duration }
      });
    }
    
    const videoTitle = sanitizeFilename(info.title);
    const fullOutputPath = path.join(uploadsDir, `${videoTitle}_full.mp3`);
    const finalOutputPath = path.join(uploadsDir, `${videoTitle}.mp3`);
    console.log('생성될 파일 경로:', {
      임시파일: fullOutputPath,
      최종파일: finalOutputPath
    });

    // 기존 파일이 있는지 확인
    console.log('2. 기존 파일 확인 중...');
    if (socketId) {
      io.to(socketId).emit('conversion-progress', { step: 'check-existing', message: '기존 파일 확인 중...' });
    }
    
    if (fs.existsSync(finalOutputPath)) {
      console.log('기존 파일 발견:', finalOutputPath);
      console.log('=== 기존 파일 사용 ===');
      if (socketId) {
        io.to(socketId).emit('conversion-complete', { 
          filePath: '/downloads/' + path.basename(finalOutputPath),
          message: '기존 파일을 사용합니다.'
        });
      }
      return res.json({ filePath: '/downloads/' + path.basename(finalOutputPath) });
    }
    console.log('기존 파일 없음, 새로 변환 진행');

    // 1. 전체 영상을 MP3로 다운로드
    console.log('3. MP3 다운로드 시작...');
    if (socketId) {
      io.to(socketId).emit('conversion-progress', { step: 'downloading', message: 'MP3 다운로드 중...' });
    }
    
    await youtubeDl(url, {
      ...defaultOptions,
      extractAudio: true,
      audioFormat: 'mp3',
      output: fullOutputPath
    });
    console.log('MP3 다운로드 완료');
    
    if (socketId) {
      io.to(socketId).emit('conversion-progress', { step: 'downloading-complete', message: 'MP3 다운로드 완료' });
    }

    // 2. FFmpeg로 구간 자르기
    console.log('4. FFmpeg로 구간 자르기 시작...');
    if (socketId) {
      io.to(socketId).emit('conversion-progress', { step: 'trimming', message: '오디오 구간 자르기 중...' });
    }
    
    const duration = endTime && endTime > startTime ? endTime - startTime : undefined;
    const ffmpegArgs = [
      '-i', `"${fullOutputPath}"`,
      '-ss', formatTime(startTime),
      ...(duration ? ['-t', String(duration)] : []),
      '-acodec', 'copy',
      `"${finalOutputPath}"`
    ];
    
    console.log('FFmpeg 명령어:', `${ffmpegPath} ${ffmpegArgs.join(' ')}`);

    try {
      // Windows에서 경로에 공백이 있을 때 처리
      const command = `"${ffmpegPath}" ${ffmpegArgs.join(' ')}`;
      console.log('실행할 명령어:', command);
      await execAsync(command);
      console.log('구간 자르기 완료');
      
      // 전체 파일 삭제
      fs.unlinkSync(fullOutputPath);
      console.log('임시 파일 삭제 완료');
      
      console.log('=== 변환 완료 ===');
      if (socketId) {
        io.to(socketId).emit('conversion-complete', { 
          filePath: '/downloads/' + path.basename(finalOutputPath),
          message: '변환이 완료되었습니다!'
        });
      }
      res.json({ filePath: '/downloads/' + path.basename(finalOutputPath) });
    } catch (ffmpegError) {
      console.error('FFmpeg 에러 발생:', ffmpegError);
      if (socketId) {
        io.to(socketId).emit('conversion-error', { 
          error: 'Failed to trim audio',
          message: '오디오 구간 자르기 중 오류가 발생했습니다.'
        });
      }
      res.status(500).json({ error: 'Failed to trim audio' });
      // 에러 발생시 임시 파일들 정리
      if (fs.existsSync(fullOutputPath)) {
        fs.unlinkSync(fullOutputPath);
        console.log('에러 발생: 임시 파일 삭제됨');
      }
      if (fs.existsSync(finalOutputPath)) {
        fs.unlinkSync(finalOutputPath);
        console.log('에러 발생: 최종 파일 삭제됨');
      }
    }
  } catch (error) {
    console.error('=== 변환 실패 ===');
    console.error('에러 상세:', error);
    if (req.body.socketId) {
      io.to(req.body.socketId).emit('conversion-error', { 
        error: 'Failed to convert video',
        message: '비디오 변환 중 오류가 발생했습니다.'
      });
    }
    res.status(500).json({ error: 'Failed to convert video' });
  }
});

// WebSocket 연결 처리
io.on('connection', (socket: any) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 