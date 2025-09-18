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

const execAsync = promisify(exec);
const app = express();
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
    const { url, startTime = 0, endTime } = req.body;
    
    console.log('=== 변환 시작 ===');
    console.log('요청 파라미터:', { url, startTime, endTime });
    
    // 비디오 정보 가져오기
    console.log('1. YouTube 비디오 정보 가져오는 중...');
    const info = await youtubeDl(url, {
      ...defaultOptions,
      dumpSingleJson: true
    });
    console.log('비디오 정보:', { 
      title: info.title,
      duration: info.duration,
      format: info.format
    });
    
    const videoTitle = sanitizeFilename(info.title);
    const fullOutputPath = path.join(uploadsDir, `${videoTitle}_full.mp3`);
    const finalOutputPath = path.join(uploadsDir, `${videoTitle}.mp3`);
    console.log('생성될 파일 경로:', {
      임시파일: fullOutputPath,
      최종파일: finalOutputPath
    });

    // 기존 파일이 있는지 확인
    console.log('2. 기존 파일 확인 중...');
    if (fs.existsSync(finalOutputPath)) {
      console.log('기존 파일 발견:', finalOutputPath);
      console.log('=== 기존 파일 사용 ===');
      return res.json({ filePath: '/downloads/' + path.basename(finalOutputPath) });
    }
    console.log('기존 파일 없음, 새로 변환 진행');

    // 1. 전체 영상을 MP3로 다운로드
    console.log('3. MP3 다운로드 시작...');
    await youtubeDl(url, {
      ...defaultOptions,
      extractAudio: true,
      audioFormat: 'mp3',
      output: fullOutputPath
    });
    console.log('MP3 다운로드 완료');

    // 2. FFmpeg로 구간 자르기
    console.log('4. FFmpeg로 구간 자르기 시작...');
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
      res.json({ filePath: '/downloads/' + path.basename(finalOutputPath) });
    } catch (ffmpegError) {
      console.error('FFmpeg 에러 발생:', ffmpegError);
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
    res.status(500).json({ error: 'Failed to convert video' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 