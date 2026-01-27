import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  Card,
  CardMedia,
  CardContent,
  Slider,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Checkbox,
  LinearProgress,
  Grid,
  Tabs,
  Tab,
} from "@mui/material";
import axios from "axios";
import { useWebSocket } from "../hooks/useWebSocket";

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
  position: number;
  positionFromLatest: number;
}

interface PlaylistInfo {
  playlistId: string;
  totalVideos: number;
  pageSize: number;
  pageCount: number;
  pageIndex: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousPageIndex: number | null;
  nextPageIndex: number | null;
  cacheTimestamp?: number;
  videos: PlaylistVideo[];
  order?: "asc" | "desc";
}

interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
  viewCount?: number;
  duration?: number;
  url: string;
}

export const YoutubeInput: React.FC<YoutubeInputProps> = ({
  onFileConverted,
}) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<TimeRange>({ start: 0, end: 0 });
  const [queue, setQueue] = useState<
    Array<{ url: string; timeRange: TimeRange }>
  >([]);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [playlistVideoCache, setPlaylistVideoCache] = useState<
    Map<string, PlaylistVideo>
  >(() => new Map());
  const [activePlaylistUrl, setActivePlaylistUrl] = useState<string | null>(
    null
  );
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(0); // 0: URL 입력, 1: 검색
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket 훅 사용
  const {
    isConnected,
    conversionProgress,
    conversionComplete,
    conversionError,
    getSocketId,
  } = useWebSocket();

  const extractVideoId = (url: string) => {
    // YouTube 도메인이 있는지 먼저 확인
    if (!/youtube\.com|youtu\.be/.test(url)) {
      return null;
    }
    const regExp =
      /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const extractPlaylistId = (url: string) => {
    // YouTube 도메인이 있는지 먼저 확인
    if (!/youtube\.com|youtu\.be/.test(url)) {
      return null;
    }
    const playlistRegex = /[?&]list=([^&]+)/;
    const match = url.match(playlistRegex);
    return match ? match[1] : null;
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const formatViewCount = (count?: number): string => {
    if (!count) return "";
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };


  // 검색 API 호출
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await axios.post("http://localhost:3001/api/search", {
        query: query.trim(),
        maxResults: 12,
      });
      setSearchResults(response.data.results || []);
    } catch (error) {
      console.error("Error searching YouTube:", error);
      setSearchError("검색 중 오류가 발생했습니다.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 검색 결과 선택 핸들러
  const handleSearchResultSelect = (result: SearchResult) => {
    setUrl(result.url);
    setSearchResults([]);
    setSearchError(null);
    setActiveTab(0); // URL 입력 탭으로 전환
  };

  const fetchPlaylistInfo = useCallback(
    async (
      targetUrl: string,
      pageIndex?: number,
      options?: { resetSelection?: boolean; autoSelectNew?: boolean }
    ) => {
      try {
        setLoadingPlaylist(true);
        setError(null);
        const response = await axios.post(
          "http://localhost:3001/api/playlist-info",
          {
            url: targetUrl,
            pageIndex,
          }
        );
        const data: PlaylistInfo = response.data;

        setPlaylistInfo(data);
        setPlaylistVideoCache((prev) => {
          const updated = new Map(prev);
          data.videos.forEach((video) => {
            updated.set(video.videoId, video);
          });
          return updated;
        });

        setSelectedVideos((prev) => {
          if (options?.resetSelection) {
            return new Set(data.videos.map((video) => video.videoId));
          }

          const updated = new Set(prev);

          if (options?.autoSelectNew) {
            data.videos.forEach((video) => {
              if (!updated.has(video.videoId)) {
                updated.add(video.videoId);
              }
            });
          } else if (updated.size === 0) {
            data.videos.forEach((video) => updated.add(video.videoId));
          }

          return updated;
        });
      } catch (error) {
        console.error("Error fetching playlist info:", error);
        setError("Failed to fetch playlist information");
      } finally {
        setLoadingPlaylist(false);
      }
    },
    [
      setPlaylistInfo,
      setPlaylistVideoCache,
      setSelectedVideos,
      setLoadingPlaylist,
      setError,
    ]
  );

  // URL이 실제 YouTube URL인지 확인하는 함수
  const isValidYouTubeUrl = (input: string): boolean => {
    if (!input.trim()) return false;
    // YouTube 도메인 패턴 확인
    const youtubeDomainPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/;
    if (!youtubeDomainPattern.test(input)) {
      return false;
    }
    // 비디오 ID나 플레이리스트 ID가 있는지 확인
    const videoId = extractVideoId(input);
    const playlistId = extractPlaylistId(input);
    return videoId !== null || playlistId !== null;
  };

  // URL 입력 탭에서만 URL 처리
  useEffect(() => {
    // 검색 탭이면 URL 처리하지 않음
    if (activeTab === 1) {
      return;
    }

    // 빈 입력이면 초기화
    if (!url.trim()) {
      setIsPlaylist(false);
      setThumbnail(null);
      setVideoDuration(0);
      setTimeRange({ start: 0, end: 0 });
      setPlaylistInfo(null);
      setSelectedVideos(new Set());
      setPlaylistVideoCache(new Map());
      setActivePlaylistUrl(null);
      return;
    }

    // 유효한 YouTube URL인 경우에만 처리
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
      setPlaylistVideoCache(new Map());
      setActivePlaylistUrl(url);
      fetchPlaylistInfo(url, undefined, {
        resetSelection: true,
        autoSelectNew: true,
      });
      return;
    } else if (videoId) {
      // Handle single video URL
      setIsPlaylist(false);
      setPlaylistInfo(null);
      setSelectedVideos(new Set());
      setActivePlaylistUrl(null);
      setPlaylistVideoCache(new Map());
      setThumbnail(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);

      const fetchVideoDuration = async () => {
        try {
          const response = await axios.post(
            "http://localhost:3001/api/video-info",
            { url }
          );
          setVideoDuration(response.data.duration);
          setTimeRange({ start: 0, end: response.data.duration });
        } catch (error) {
          console.error("Error fetching video duration:", error);
        }
      };
      fetchVideoDuration();
      return;
    } else {
      // 유효한 URL이 아님
      setIsPlaylist(false);
      setThumbnail(null);
      setVideoDuration(0);
      setTimeRange({ start: 0, end: 0 });
      setPlaylistInfo(null);
      setSelectedVideos(new Set());
      setPlaylistVideoCache(new Map());
      setActivePlaylistUrl(null);
    }
  }, [url, activeTab, fetchPlaylistInfo]);

  // 검색어 입력 시 디바운싱 검색
  useEffect(() => {
    // URL 입력 탭이면 검색하지 않음
    if (activeTab === 0) {
      return;
    }

    // 기존 검색 타이머 정리
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    // 500ms 디바운싱
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 500);

    // 클린업 함수
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, activeTab, performSearch]);

  const handleLoadPreviousPage = useCallback(() => {
    if (!playlistInfo || !activePlaylistUrl || loadingPlaylist) {
      return;
    }

    if (
      playlistInfo.previousPageIndex === null ||
      typeof playlistInfo.previousPageIndex !== "number"
    ) {
      return;
    }

    fetchPlaylistInfo(activePlaylistUrl, playlistInfo.previousPageIndex, {
      autoSelectNew: true,
    });
  }, [playlistInfo, activePlaylistUrl, loadingPlaylist, fetchPlaylistInfo]);

  const handleLoadNextPage = useCallback(() => {
    if (!playlistInfo || !activePlaylistUrl || loadingPlaylist) {
      return;
    }

    if (
      playlistInfo.nextPageIndex === null ||
      typeof playlistInfo.nextPageIndex !== "number"
    ) {
      return;
    }

    fetchPlaylistInfo(activePlaylistUrl, playlistInfo.nextPageIndex, {
      autoSelectNew: true,
    });
  }, [playlistInfo, activePlaylistUrl, loadingPlaylist, fetchPlaylistInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 검색 탭이면 제출하지 않음
    if (activeTab === 1) {
      return;
    }

    if (!url) return;

    // URL이 유효한 YouTube URL인지 확인
    if (!isValidYouTubeUrl(url)) {
      return;
    }

    if (isPlaylist) {
      const selectedVideoData = Array.from(selectedVideos)
        .map((videoId) => playlistVideoCache.get(videoId))
        .filter((video): video is PlaylistVideo => Boolean(video));

      if (!selectedVideoData.length) {
        setError("선택된 비디오가 없습니다.");
        return;
      }

      const selectedVideoUrls = selectedVideoData.map((video) => ({
        url: video.url,
        timeRange: { start: 0, end: video.duration },
      }));

      setQueue((prev) => [...prev, ...selectedVideoUrls]);
    } else {
      const item = { url, timeRange: { ...timeRange } };
      setQueue((prev) => [...prev, item]);
    }
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
    if (!playlistInfo) {
      return;
    }

    const pageVideoIds = playlistInfo.videos.map((video) => video.videoId);
    const isPageSelected = pageVideoIds.every((id) => selectedVideos.has(id));
    const updated = new Set(selectedVideos);

    if (isPageSelected) {
      pageVideoIds.forEach((id) => updated.delete(id));
    } else {
      pageVideoIds.forEach((id) => updated.add(id));
    }

    setSelectedVideos(updated);
  };

  const isCurrentPageFullySelected =
    playlistInfo?.videos.every((video) => selectedVideos.has(video.videoId)) ??
    false;

  // WebSocket으로 변환 완료 받기
  useEffect(() => {
    if (conversionComplete) {
      onFileConverted(conversionComplete.filePath);
      setQueue((prev) => prev.slice(1));
      setLoading(false);
    }
  }, [conversionComplete, onFileConverted]);

  // WebSocket으로 변환 에러 받기
  useEffect(() => {
    if (conversionError) {
      setError(conversionError.message);
      setQueue((prev) => prev.slice(1));
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
        await axios.post("http://localhost:3001/api/convert", {
          url: next.url,
          startTime: next.timeRange.start,
          endTime: next.timeRange.end,
          socketId: getSocketId(), // WebSocket ID 전달
        });
        // WebSocket으로 완료를 받으므로 여기서는 처리하지 않음
        // onFileConverted(response.data.filePath);
      } catch (err) {
        console.error("Error converting video:", err);
        setError(
          "Failed to convert a queued video. Continuing with next item."
        );
        setQueue((prev) => prev.slice(1));
        setLoading(false);
      }
    };
    processNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, loading, getSocketId]);

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mb: 4 }}>
      {/* WebSocket 연결 상태 표시 */}
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: isConnected ? "green" : "red",
          }}
        />
        <Typography variant="caption" color={isConnected ? "green" : "red"}>
          {isConnected ? "실시간 연결됨" : "연결 끊김"}
        </Typography>
      </Box>

      {/* 탭 */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="URL 입력" />
          <Tab label="검색" />
        </Tabs>
      </Box>

      {/* URL 입력 탭 */}
      {activeTab === 0 && (
        <>
          <TextField
            fullWidth
            label="YouTube URL (Video or Playlist)"
            variant="outlined"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="https://www.youtube.com/watch?v=... or https://www.youtube.com/playlist?list=..."
          />
        </>
      )}

      {/* 검색 탭 */}
      {activeTab === 1 && (
        <>
          <TextField
            fullWidth
            label="검색어"
            variant="outlined"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="검색어를 입력하세요..."
            helperText={isSearching ? "검색 중..." : "검색어를 입력하면 자동으로 검색됩니다"}
          />

          {/* 검색 결과 표시 */}
          <Box sx={{ mb: 2 }}>
            {isSearching ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  py: 4,
                }}
              >
                <CircularProgress sx={{ mr: 2 }} />
                <Typography>검색 중...</Typography>
              </Box>
            ) : searchError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {searchError}
              </Alert>
            ) : searchResults.length > 0 ? (
              <>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  검색 결과 ({searchResults.length}개)
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                      md: "repeat(3, 1fr)",
                    },
                    gap: 2,
                  }}
                >
                  {searchResults.map((result) => (
                    <Box key={result.videoId}>
                      <Card
                        sx={{
                          cursor: "pointer",
                          transition: "transform 0.2s, box-shadow 0.2s",
                          "&:hover": {
                            transform: "translateY(-4px)",
                            boxShadow: 4,
                          },
                        }}
                        onClick={() => handleSearchResultSelect(result)}
                      >
                        <CardMedia
                          component="img"
                          height="180"
                          image={result.thumbnail}
                          alt={result.title}
                          sx={{ objectFit: "cover" }}
                        />
                        <CardContent>
                          <Typography
                            variant="subtitle1"
                            component="h3"
                            sx={{
                              fontWeight: "bold",
                              mb: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {result.title}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 0.5 }}
                          >
                            {result.channelTitle}
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              mt: 1,
                            }}
                          >
                            {result.viewCount && (
                              <Typography variant="caption" color="text.secondary">
                                조회수 {formatViewCount(result.viewCount)}
                              </Typography>
                            )}
                            {result.duration && (
                              <Typography variant="caption" color="text.secondary">
                                {formatTime(result.duration)}
                              </Typography>
                            )}
                          </Box>
                          {result.publishedAt && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mt: 0.5 }}
                            >
                              {formatDate(result.publishedAt)}
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </Box>
                  ))}
                </Box>
              </>
            ) : searchQuery.trim() ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                검색 결과가 없습니다.
              </Alert>
            ) : null}
          </Box>
        </>
      )}

      {/* URL 입력 탭의 플레이리스트 및 비디오 정보 표시 */}
      {activeTab === 0 && (
        <>
          {isPlaylist && (
        <Card sx={{ mb: 2 }}>
          <Box sx={{ p: 2 }}>
            {loadingPlaylist ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  py: 4,
                }}
              >
                <CircularProgress sx={{ mr: 2 }} />
                <Typography>Loading playlist videos...</Typography>
              </Box>
            ) : playlistInfo ? (
              <>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 2,
                    mb: 2,
                  }}
                >
                  <Box>
                    <Typography variant="h6">
                      Playlist: {playlistInfo.totalVideos} videos
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Page {playlistInfo.pageIndex + 1} /{" "}
                      {playlistInfo.pageCount}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleLoadPreviousPage}
                      disabled={!playlistInfo.hasPrevious || loadingPlaylist}
                    >
                      이전 페이지
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleLoadNextPage}
                      disabled={!playlistInfo.hasNext || loadingPlaylist}
                    >
                      다음 페이지
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleSelectAll}
                    >
                      {isCurrentPageFullySelected
                        ? "Deselect Page"
                        : "Select Page"}
                    </Button>
                  </Box>
                </Box>
                <List sx={{ maxHeight: 300, overflow: "auto" }}>
                  {playlistInfo.videos.map((video) => (
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
                          secondary={`${formatTime(video.duration)} • ${
                            video.positionFromLatest
                          }/${playlistInfo.totalVideos}`}
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
        <Card sx={{ mb: 2, maxWidth: 480, mx: "auto" }}>
          <CardMedia
            component="img"
            image={thumbnail}
            alt="Video thumbnail"
            sx={{ width: "100%", height: "auto" }}
          />
          {videoDuration > 0 && (
            <Box sx={{ px: 2, py: 3 }}>
              <Typography gutterBottom>
                Select video range: {formatTime(timeRange.start)} -{" "}
                {formatTime(timeRange.end)}
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
        </>
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
          대기열: {queue.length}개 {queue.length === 1 ? "항목" : "항목"}{" "}
          {loading ? "(처리 중...)" : ""}
        </Alert>
      )}
      {/* 버튼은 URL 입력 탭에서만 표시 */}
      {activeTab === 0 && (
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={
            !url || (isPlaylist && selectedVideos.size === 0)
          }
          startIcon={
            loading ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          {isPlaylist
            ? `선택된 ${selectedVideos.size}개 비디오를 대기열에 추가`
            : loading
            ? "대기열에 추가"
            : "변환 / 대기열에 추가"}
        </Button>
      )}
    </Box>
  );
};
