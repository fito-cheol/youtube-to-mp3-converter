import { Request, Response } from 'express';
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const youtubeDl = require('youtube-dl-exec');

const execAsync = promisify(exec);
const app = express();
const port = process.env.PORT || 3001;

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
    const info = await youtubeDl(url, {
      ...defaultOptions,
      dumpSingleJson: true
    });
    
    res.json({
      duration: info.duration,
      title: info.title
    });
  } catch (error) {
    console.error('Error fetching video info:', error);
    res.status(500).json({ error: 'Failed to fetch video information' });
  }
});

app.post('/api/convert', async (req: Request, res: Response) => {
  try {
    const { url, startTime = 0, endTime } = req.body;
    
    // 비디오 정보 가져오기
    const info = await youtubeDl(url, {
      ...defaultOptions,
      dumpSingleJson: true
    });
    
    const videoTitle = info.title.replace(/[^\w\s]/gi, '');
    const outputPath = path.join(uploadsDir, `${videoTitle}.mp3`);
    
    // youtube-dl로 직접 오디오 추출
    await youtubeDl(url, {
      ...defaultOptions,
      extractAudio: true,
      audioFormat: 'mp3',
      output: outputPath,
      ...(startTime > 0 && { seekTime: startTime }),
      ...(endTime && endTime > startTime && { duration: endTime - startTime })
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