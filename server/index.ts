import { Request, Response } from "express";
import { youtube_v3 } from "googleapis";
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const youtubeDl = require("youtube-dl-exec");
const { google } = require("googleapis");
const { createServer } = require("http");
const { Server } = require("socket.io");

const execAsync = promisify(exec);
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});
const port = process.env.BACK_PORT || 3001;

// Sanitize a string to a safe Windows filename while preserving non-ASCII letters (e.g., Korean)
function sanitizeFilename(name: string): string {
  // Remove illegal characters for Windows filenames and control chars
  const removedIllegal = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    // Trim spaces
    .trim()
    // Remove trailing dots and spaces which are not allowed
    .replace(/[\. ]+$/g, "");

  // Fallback if empty after sanitization
  const fallback = removedIllegal || "audio";
  // Limit length to avoid very long filenames
  return fallback.slice(0, 120);
}

// YouTube API 설정
const youtube = google.youtube("v3");
const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  console.error(
    "YouTube API key is not set. Please set YOUTUBE_API_KEY in .env file"
  );
  process.exit(1);
}

// FFmpeg 경로 설정
const ffmpegPath = path.join(
  __dirname,
  "..",
  "ffmpeg",
  "ffmpeg-master-latest-win64-gpl",
  "bin",
  "ffmpeg.exe"
);
const ffprobePath = path.join(
  __dirname,
  "..",
  "ffmpeg",
  "ffmpeg-master-latest-win64-gpl",
  "bin",
  "ffprobe.exe"
);

// youtube-dl 기본 옵션 설정
const defaultOptions = {
  noWarnings: true,
  noCallHome: true,
  noCheckCertificate: true,
  preferFreeFormats: false, // HLS 형식으로 이끌 수 있어서 비활성화
  youtubeSkipDashManifest: false, // DASH manifest 사용 허용
  ffmpegLocation: ffmpegPath,
  // HLS를 명시적으로 제외하고 직접 다운로드 가능한 형식만 선택
  // m3u8와 m3u8_native 모두 제외, 더 많은 fallback 옵션 제공
  format:
    "bestaudio[ext=m4a][protocol!=m3u8][protocol!=m3u8_native]/bestaudio[ext=webm][protocol!=m3u8][protocol!=m3u8_native]/bestaudio[ext=mp4][protocol!=m3u8][protocol!=m3u8_native]/bestaudio[protocol!=m3u8][protocol!=m3u8_native]/best[protocol!=m3u8][protocol!=m3u8_native]/bestaudio/best",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", // User-Agent 설정
};

interface PlaylistVideoCacheItem {
  videoId: string;
  title: string;
  url: string;
  duration: number;
  position: number;
  index: number;
}

interface PlaylistPageCache {
  pageToken: string | null;
  nextPageToken: string | null;
  videos: PlaylistVideoCacheItem[];
}

interface PlaylistCacheEntry {
  playlistId: string;
  fetchedAt: number;
  totalVideos: number;
  pages: PlaylistPageCache[];
}

const PLAYLIST_CACHE_TTL = 1000 * 60 * 15; // 15 minutes
const playlistCache = new Map<string, PlaylistCacheEntry>();
const playlistCachePromises = new Map<string, Promise<PlaylistCacheEntry>>();

function getValidPlaylistCache(
  playlistId: string
): PlaylistCacheEntry | undefined {
  const cached = playlistCache.get(playlistId);
  if (!cached) {
    return undefined;
  }

  const isExpired = Date.now() - cached.fetchedAt > PLAYLIST_CACHE_TTL;
  if (isExpired) {
    playlistCache.delete(playlistId);
    return undefined;
  }

  return cached;
}

async function ensurePlaylistCache(
  playlistId: string,
  forceRefresh = false
): Promise<PlaylistCacheEntry> {
  if (!forceRefresh) {
    const cached = getValidPlaylistCache(playlistId);
    if (cached) {
      return cached;
    }
  }

  if (playlistCachePromises.has(playlistId)) {
    return playlistCachePromises.get(playlistId)!;
  }

  const buildPromise = buildPlaylistCache(playlistId).finally(() => {
    playlistCachePromises.delete(playlistId);
  });

  playlistCachePromises.set(playlistId, buildPromise);
  return buildPromise;
}

async function buildPlaylistCache(
  playlistId: string
): Promise<PlaylistCacheEntry> {
  console.log(`[playlist] Building cache for ${playlistId}`);

  const pages: PlaylistPageCache[] = [];
  let pageToken: string | undefined = undefined;
  let pageIndex = 0;
  const maxPages = 20;

  do {
    pageIndex++;
    console.log(
      `[playlist] Fetching page ${pageIndex}${
        pageToken ? ` (token: ${pageToken})` : ""
      }...`
    );

    const { data }: { data: youtube_v3.Schema$PlaylistItemListResponse } =
      await youtube.playlistItems.list({
        key: API_KEY,
        part: ["snippet"],
        playlistId,
        maxResults: 50,
        pageToken,
      });

    const items = data?.items ?? [];

    if (items.length === 0) {
      console.log(`[playlist] Page ${pageIndex} returned no items.`);
      break;
    }

    const videos = await mapPlaylistItemsToVideos(
      items as youtube_v3.Schema$PlaylistItem[]
    );

    pages.push({
      pageToken: pageToken ?? null,
      nextPageToken: data?.nextPageToken ?? null,
      videos,
    });

    pageToken = data?.nextPageToken ?? undefined;
  } while (pageToken && pageIndex < maxPages);

  let positionCounter = 0;
  pages.forEach((page) => {
    page.videos.forEach((video) => {
      positionCounter += 1;
      video.position = positionCounter;
      video.index = positionCounter - 1;
    });
  });

  const totalVideos = positionCounter;

  console.log(
    `[playlist] Cached ${totalVideos} videos across ${pages.length} pages for ${playlistId}`
  );

  const cacheEntry: PlaylistCacheEntry = {
    playlistId,
    fetchedAt: Date.now(),
    totalVideos,
    pages,
  };

  playlistCache.set(playlistId, cacheEntry);

  return cacheEntry;
}

async function mapPlaylistItemsToVideos(
  items: youtube_v3.Schema$PlaylistItem[]
): Promise<PlaylistVideoCacheItem[]> {
  const validItems = items.filter((item) => item?.snippet?.resourceId?.videoId);
  if (validItems.length === 0) {
    return [];
  }

  const videoIds = validItems
    .map((item) => item.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id));

  const durationMap = new Map<string, number>();
  const { data }: { data: youtube_v3.Schema$VideoListResponse } =
    await youtube.videos.list({
      key: API_KEY,
      part: ["contentDetails"],
      id: videoIds,
    });

  (data?.items ?? []).forEach(
    (item: youtube_v3.Schema$Video | null | undefined) => {
      const videoId = item?.id;
      const durationIso = item?.contentDetails?.duration;
      if (videoId && durationIso) {
        durationMap.set(videoId, convertYouTubeDuration(durationIso));
      }
    }
  );

  return validItems
    .map((item) => {
      const videoId = item.snippet?.resourceId?.videoId;
      if (!videoId) {
        return undefined;
      }

      const title = item.snippet?.title ?? "Untitled";
      const duration = durationMap.get(videoId) ?? 0;

      return {
        videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        duration,
        position: 0,
        index: 0,
      } as PlaylistVideoCacheItem;
    })
    .filter((item): item is PlaylistVideoCacheItem => Boolean(item));
}

app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Serve downloaded files
app.use("/downloads", express.static(uploadsDir));

// Function to check if a URL is a valid YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
  return pattern.test(url);
}

// Function to extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
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
app.get("/api/download/:filename", (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  // Set headers for file download
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Stream the file
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// YouTube 비디오 정보 가져오기
app.post("/api/video-info", async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    // Check if it's a playlist URL
    if (isPlaylistUrl(url)) {
      return res
        .status(400)
        .json({ error: "Please use /api/playlist-info for playlist URLs" });
    }

    const videoId = extractVideoId(url);

    if (!videoId) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // YouTube Data API를 사용하여 비디오 정보 가져오기
    const response = await youtube.videos.list({
      key: API_KEY,
      part: ["contentDetails", "snippet"],
      id: [videoId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = response.data.items[0];
    const duration = convertYouTubeDuration(video.contentDetails.duration);

    res.json({
      duration,
      title: video.snippet.title,
    });
  } catch (error) {
    console.error("Error fetching video info:", error);
    res.status(500).json({ error: "Failed to fetch video information" });
  }
});

// YouTube 재생목록 정보 가져오기
app.post("/api/playlist-info", async (req: Request, res: Response) => {
  try {
    const { url, pageIndex, forceRefresh } = req.body;
    const playlistId = extractPlaylistId(url);

    if (!playlistId) {
      return res.status(400).json({ error: "Invalid playlist URL" });
    }

    const parsedPageIndex =
      typeof pageIndex === "number"
        ? pageIndex
        : typeof pageIndex === "string"
        ? parseInt(pageIndex, 10)
        : undefined;

    const cacheEntry = await ensurePlaylistCache(
      playlistId,
      Boolean(forceRefresh)
    );

    if (!cacheEntry.pages.length) {
      return res.status(404).json({ error: "Playlist not found or empty" });
    }

    const pageCount = cacheEntry.pages.length;
    const normalizedPageIndex = Number.isInteger(parsedPageIndex)
      ? Math.min(Math.max(parsedPageIndex as number, 0), pageCount - 1)
      : pageCount - 1; // default: last page (most recent videos)

    const page = cacheEntry.pages[normalizedPageIndex];
    const pageVideosDescending = [...page.videos].reverse();
    const videos = pageVideosDescending.map((video) => ({
      videoId: video.videoId,
      title: video.title,
      url: video.url,
      duration: video.duration,
      position: video.position,
      positionFromLatest: cacheEntry.totalVideos - video.index,
    }));

    console.log(
      `[playlist] Responding with page ${
        normalizedPageIndex + 1
      }/${pageCount} for ${playlistId} (videos: ${videos.length})`
    );

    res.json({
      playlistId,
      totalVideos: cacheEntry.totalVideos,
      pageSize: page.videos.length,
      pageCount,
      pageIndex: normalizedPageIndex,
      hasPrevious: normalizedPageIndex > 0,
      hasNext: normalizedPageIndex < pageCount - 1,
      previousPageIndex:
        normalizedPageIndex > 0 ? normalizedPageIndex - 1 : null,
      nextPageIndex:
        normalizedPageIndex < pageCount - 1 ? normalizedPageIndex + 1 : null,
      cacheTimestamp: cacheEntry.fetchedAt,
      videos,
      order: "desc",
    });
  } catch (error) {
    console.error("Error fetching playlist info:", error);
    res.status(500).json({ error: "Failed to fetch playlist information" });
  }
});

// YouTube의 duration 형식(PT1H2M10S)을 초 단위로 변환하는 함수
function convertYouTubeDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const [, hours, minutes, seconds] = match;
  return (
    parseInt(hours || "0") * 3600 +
    parseInt(minutes || "0") * 60 +
    parseInt(seconds || "0")
  );
}

// 초를 HH:MM:SS 형식으로 변환하는 함수
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(remainingSeconds).padStart(2, "0")}`;
}

app.post("/api/convert", async (req: Request, res: Response) => {
  try {
    const { url, startTime = 0, endTime, socketId } = req.body;

    console.log("=== 변환 시작 ===");
    console.log("요청 파라미터:", { url, startTime, endTime, socketId });

    // WebSocket으로 변환 시작 알림
    if (socketId) {
      io.to(socketId).emit("conversion-started", { url, startTime, endTime });
    }

    // 비디오 정보 가져오기
    console.log("1. YouTube 비디오 정보 가져오는 중...");
    if (socketId) {
      io.to(socketId).emit("conversion-progress", {
        step: "video-info",
        message: "비디오 정보를 가져오는 중...",
      });
    }

    const info = await youtubeDl(url, {
      ...defaultOptions,
      dumpSingleJson: true,
    });
    console.log("비디오 정보:", {
      title: info.title,
      duration: info.duration,
      format: info.format,
    });

    if (socketId) {
      io.to(socketId).emit("conversion-progress", {
        step: "video-info-complete",
        message: "비디오 정보 수집 완료",
        videoInfo: { title: info.title, duration: info.duration },
      });
    }

    const videoTitle = sanitizeFilename(info.title);
    const fullOutputPath = path.join(uploadsDir, `${videoTitle}_full.mp3`);
    const finalOutputPath = path.join(uploadsDir, `${videoTitle}.mp3`);
    console.log("생성될 파일 경로:", {
      임시파일: fullOutputPath,
      최종파일: finalOutputPath,
    });

    // 기존 파일이 있는지 확인
    console.log("2. 기존 파일 확인 중...");
    if (socketId) {
      io.to(socketId).emit("conversion-progress", {
        step: "check-existing",
        message: "기존 파일 확인 중...",
      });
    }

    if (fs.existsSync(finalOutputPath)) {
      console.log("기존 파일 발견:", finalOutputPath);
      console.log("=== 기존 파일 사용 ===");
      if (socketId) {
        io.to(socketId).emit("conversion-complete", {
          filePath: "/downloads/" + path.basename(finalOutputPath),
          message: "기존 파일을 사용합니다.",
        });
      }
      return res.json({
        filePath: "/downloads/" + path.basename(finalOutputPath),
      });
    }
    console.log("기존 파일 없음, 새로 변환 진행");

    // 1. 전체 영상을 MP3로 다운로드
    console.log("3. MP3 다운로드 시작...");
    if (socketId) {
      io.to(socketId).emit("conversion-progress", {
        step: "downloading",
        message: "MP3 다운로드 중...",
      });
    }

    await youtubeDl(url, {
      ...defaultOptions,
      extractAudio: true,
      audioFormat: "mp3",
      output: fullOutputPath,
      // HLS 대신 직접 다운로드 가능한 형식 강제 (protocol 필터로 HLS 제외)
      // 더 많은 fallback 옵션 제공
      format:
        "bestaudio[ext=m4a][protocol!=m3u8][protocol!=m3u8_native]/bestaudio[ext=webm][protocol!=m3u8][protocol!=m3u8_native]/bestaudio[ext=mp4][protocol!=m3u8][protocol!=m3u8_native]/bestaudio[protocol!=m3u8][protocol!=m3u8_native]/best[protocol!=m3u8][protocol!=m3u8_native]/bestaudio/best",
    });
    console.log("MP3 다운로드 완료");

    if (socketId) {
      io.to(socketId).emit("conversion-progress", {
        step: "downloading-complete",
        message: "MP3 다운로드 완료",
      });
    }

    // 2. FFmpeg로 구간 자르기
    console.log("4. FFmpeg로 구간 자르기 시작...");
    if (socketId) {
      io.to(socketId).emit("conversion-progress", {
        step: "trimming",
        message: "오디오 구간 자르기 중...",
      });
    }

    const duration =
      endTime && endTime > startTime ? endTime - startTime : undefined;
    const ffmpegArgs = [
      "-i",
      `"${fullOutputPath}"`,
      "-ss",
      formatTime(startTime),
      ...(duration ? ["-t", String(duration)] : []),
      "-acodec",
      "copy",
      `"${finalOutputPath}"`,
    ];

    console.log("FFmpeg 명령어:", `${ffmpegPath} ${ffmpegArgs.join(" ")}`);

    try {
      // Windows에서 경로에 공백이 있을 때 처리
      const command = `"${ffmpegPath}" ${ffmpegArgs.join(" ")}`;
      console.log("실행할 명령어:", command);
      await execAsync(command);
      console.log("구간 자르기 완료");

      // 전체 파일 삭제
      fs.unlinkSync(fullOutputPath);
      console.log("임시 파일 삭제 완료");

      console.log("=== 변환 완료 ===");
      if (socketId) {
        io.to(socketId).emit("conversion-complete", {
          filePath: "/downloads/" + path.basename(finalOutputPath),
          message: "변환이 완료되었습니다!",
        });
      }
      res.json({ filePath: "/downloads/" + path.basename(finalOutputPath) });
    } catch (ffmpegError) {
      console.error("FFmpeg 에러 발생:", ffmpegError);
      if (socketId) {
        io.to(socketId).emit("conversion-error", {
          error: "Failed to trim audio",
          message: "오디오 구간 자르기 중 오류가 발생했습니다.",
        });
      }
      res.status(500).json({ error: "Failed to trim audio" });
      // 에러 발생시 임시 파일들 정리
      if (fs.existsSync(fullOutputPath)) {
        fs.unlinkSync(fullOutputPath);
        console.log("에러 발생: 임시 파일 삭제됨");
      }
      if (fs.existsSync(finalOutputPath)) {
        fs.unlinkSync(finalOutputPath);
        console.log("에러 발생: 최종 파일 삭제됨");
      }
    }
  } catch (error) {
    console.error("=== 변환 실패 ===");
    console.error("에러 상세:", error);
    if (req.body.socketId) {
      io.to(req.body.socketId).emit("conversion-error", {
        error: "Failed to convert video",
        message: "비디오 변환 중 오류가 발생했습니다.",
      });
    }
    res.status(500).json({ error: "Failed to convert video" });
  }
});

// WebSocket 연결 처리
io.on("connection", (socket: any) => {
  console.log("Client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
