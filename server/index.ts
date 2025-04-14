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

app.post('/api/convert', async (req: Request, res: Response) => {
  try {
    const { url, startTime = 0, endTime } = req.body;
    
    console.log('Converting with parameters:', { startTime, endTime });
    
    // 비디오 정보 가져오기
    const info = await youtubeDl(url, {
      ...defaultOptions,
      dumpSingleJson: true
    });
    
    const videoTitle = info.title.replace(/[^\w\s]/gi, '');
    const outputPath = path.join(uploadsDir, `${videoTitle}.mp3`);
    // youtube-dl로 직접 오디오 추출
    // youtube-dl 옵션 설명:
    // extractAudio: true - 비디오에서 오디오만 추출
    // audioFormat: 'mp3' - 추출할 오디오 포맷 지정
    // output: 저장할 파일 경로와 이름
    // postprocessorArgs: ffmpeg에 전달할 인자들
    //   -ss: 시작 시간 (초 단위)
    //   -t: 추출할 구간 길이 (초 단위)
    // await youtubeDl(url, {
    //   extractAudio: true,
    //   audioFormat: 'mp3',
    //   postprocessorArgs: [
    //     '-ss', '30',  // 시작 시간
    //     '-t', '60'    // 길이
    //   ]
    // })
    await youtubeDl(url, {
      ...defaultOptions,
      extractAudio: true,
      audioFormat: 'mp3',
      output: outputPath,
      postprocessorArgs: [
        '-ss', String(startTime),
        ...(endTime && endTime > startTime ? ['-t', String(endTime - startTime)] : [])
      ]
    });
    
    res.json({ filePath: '/downloads/' + path.basename(outputPath) });
    
  } catch (error) {
    console.error('Error converting video:', error);
    res.status(500).json({ error: 'Failed to convert video' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 