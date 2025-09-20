import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface ConversionProgress {
  step: string;
  message: string;
  videoInfo?: {
    title: string;
    duration: number;
  };
}

interface ConversionComplete {
  filePath: string;
  message: string;
}

interface ConversionError {
  error: string;
  message: string;
}

export const useWebSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<ConversionProgress | null>(null);
  const [conversionComplete, setConversionComplete] = useState<ConversionComplete | null>(null);
  const [conversionError, setConversionError] = useState<ConversionError | null>(null);
  const socketIdRef = useRef<string | null>(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    
    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      setIsConnected(true);
      socketIdRef.current = newSocket.id || null;
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      socketIdRef.current = null;
    });

    newSocket.on('conversion-started', (data) => {
      console.log('Conversion started:', data);
      setConversionProgress(null);
      setConversionComplete(null);
      setConversionError(null);
    });

    newSocket.on('conversion-progress', (data: ConversionProgress) => {
      console.log('Conversion progress:', data);
      setConversionProgress(data);
    });

    newSocket.on('conversion-complete', (data: ConversionComplete) => {
      console.log('Conversion complete:', data);
      setConversionComplete(data);
      setConversionProgress(null);
    });

    newSocket.on('conversion-error', (data: ConversionError) => {
      console.log('Conversion error:', data);
      setConversionError(data);
      setConversionProgress(null);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const getSocketId = () => socketIdRef.current;

  return {
    socket,
    isConnected,
    conversionProgress,
    conversionComplete,
    conversionError,
    getSocketId
  };
};
