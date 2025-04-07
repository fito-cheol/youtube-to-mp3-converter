import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import youtubeDl from 'youtube-dl-exec';

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

app.post('/api/convert', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing URL: ${url}`);

    // Fix URL if it has @ prefix
    const cleanUrl = url.startsWith('@') ? url.substring(1) : url;
    
    if (!isValidYouTubeUrl(cleanUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Extract video ID for naming
    const videoId = extractVideoId(cleanUrl);
    console.log(`Video ID: ${videoId}`);

    if (!videoId) {
      return res.status(400).json({ error: 'Could not extract video ID' });
    }

    try {
      // Get video info
      const info = await youtubeDl(cleanUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
        ffmpegLocation: ffmpegPath
      });

      // Use title from info or fallback to video ID
      const videoInfo = info as any;
      const safeTitle = (videoInfo.title ? videoInfo.title.toString().replace(/[^\w\s]/gi, '') : videoId);
      const outputPath = path.join(uploadsDir, `${safeTitle}.mp3`);
      console.log(`Output path: ${outputPath}`);

      // Download audio
      await youtubeDl(cleanUrl, {
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0, // best
        output: outputPath,
        noWarnings: true,
        ffmpegLocation: ffmpegPath
      });

      console.log('Download completed');
      
      res.json({ 
        filePath: `/api/download/${safeTitle}.mp3`,
        fileName: `${safeTitle}.mp3`
      });
    } catch (error) {
      console.error('Error downloading video:', error);
      res.status(500).json({ 
        error: 'Failed to download video: ' + getErrorMessage(error)
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Server error: ' + getErrorMessage(error)
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 