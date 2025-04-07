import React from 'react';
import { List, ListItem, ListItemText, ListItemSecondaryAction, IconButton, Paper, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';

interface FileListProps {
  files: string[];
}

export const FileList: React.FC<FileListProps> = ({ files }) => {
  if (files.length === 0) {
    return null;
  }

  const handleDownload = async (filePath: string) => {
    try {
      // 전체 URL 생성
      const fullUrl = `http://localhost:3001${filePath}`;
      
      // 파일 다운로드 요청
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error('Download failed');
      
      // 파일 blob 생성
      const blob = await response.blob();
      
      // 다운로드 링크 생성
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Content-Disposition 헤더에서 파일 이름 추출 시도
      const contentDisposition = response.headers.get('content-disposition');
      const fileNameMatch = contentDisposition && contentDisposition.match(/filename="(.+)"/);
      const fileName = fileNameMatch ? fileNameMatch[1] : filePath.split('/').pop();
      
      link.download = fileName || 'download.mp3';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download the file. Please try again.');
    }
  };

  return (
    <Paper sx={{ mt: 2, mb: 4, p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Converted Files
      </Typography>
      <List>
        {files.map((file, index) => (
          <ListItem key={index}>
            <ListItemText 
              primary={file.split('/').pop()} 
            />
            <ListItemSecondaryAction>
              <IconButton 
                edge="end" 
                aria-label="download"
                onClick={() => handleDownload(file)}
              >
                <DownloadIcon />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}; 