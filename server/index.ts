import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import ytdl from 'ytdl-core';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// FFmpeg 경로 설정
const ffmpegPath = path.join(__dirname, '..', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(__dirname, '..', 'ffmpeg', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffprobe.exe');

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
app.get('/api/download/:filename', (req, res) => {
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
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;
    const info = await ytdl.getInfo(url);
    const duration = parseInt(info.videoDetails.lengthSeconds);
    
    res.json({
      duration,
      title: info.videoDetails.title
    });
  } catch (error) {
    console.error('Error fetching video info:', error);
    res.status(500).json({ error: 'Failed to fetch video information' });
  }
});

app.post('/api/convert', async (req, res) => {
  try {
    const { url, startTime = 0, endTime } = req.body;
    
    // 비디오 정보 가져오기
    const info = await ytdl.getInfo(url);
    const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '');
    const outputPath = path.join(uploadsDir, `${videoTitle}.mp3`);
    
    // FFmpeg 명령어 구성
    let ffmpegCommand = `ffmpeg -i pipe:0 -vn -acodec libmp3lame`;
    
    // 시작 시간과 종료 시간이 지정된 경우 추가
    if (startTime > 0) {
      ffmpegCommand += ` -ss ${startTime}`;
    }
    if (endTime && endTime > startTime) {
      ffmpegCommand += ` -t ${endTime - startTime}`;
    }
    
    ffmpegCommand += ` "${outputPath}"`;
    
    // YouTube 스트림 생성 및 FFmpeg로 변환
    const stream = ytdl(url, {
      quality: 'highestaudio',
      filter: 'audioonly',
    });
    
    const ffmpeg = exec(ffmpegCommand);
    
    stream.pipe(ffmpeg.stdin);
    
    await new Promise((resolve, reject) => {
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
    
    const relativePath = path.relative(__dirname, outputPath).replace(/\\/g, '/');
    res.json({ filePath: '/downloads/' + path.basename(outputPath) });
    
  } catch (error) {
    console.error('Error converting video:', error);
    res.status(500).json({ error: 'Failed to convert video' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 