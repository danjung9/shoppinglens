import { useCallback, useRef, useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
const FRAME_INTERVAL_MS = 2000; // Send frame every 2 seconds

interface DetectionResult {
  pickup_detected: boolean;
  confidence: number;
  visible_text?: string[];
  brand_hint?: string;
  category_hint?: string;
  visual_description?: string;
}

interface UseProductDetectionReturn {
  isScanning: boolean;
  lastDetection: DetectionResult | null;
  startScanning: (videoElement: HTMLVideoElement) => void;
  stopScanning: () => void;
}

export function useProductDetection(
  sessionId: string,
  onPickupDetected: () => void
): UseProductDetectionReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [lastDetection, setLastDetection] = useState<DetectionResult | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  // Create canvas for frame capture
  useEffect(() => {
    canvasRef.current = document.createElement('canvas');
    return () => {
      canvasRef.current = null;
    };
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || video.videoWidth === 0) {
      return null;
    }

    // Resize to smaller dimensions for faster upload
    const maxSize = 640;
    const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }, []);

  const analyzeFrame = useCallback(async () => {
    if (isProcessingRef.current) return;
    
    const frame = captureFrame();
    if (!frame) return;

    isProcessingRef.current = true;

    try {
      console.log('%c[SCAN] Sending frame for analysis...', 'color: blue');
      
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame }),
      });

      if (!response.ok) {
        console.error('[SCAN] Frame analysis failed:', response.status);
        return;
      }

      const result = await response.json();
      console.log('%c[SCAN] Result:', 'color: purple', result);

      if (result.detection) {
        setLastDetection(result.detection);
      }

      if (result.status === 'pickup_detected') {
        console.log('%c[SCAN] Product detected! Research starting...', 'color: green; font-weight: bold');
        onPickupDetected();
      }
    } catch (error) {
      console.error('[SCAN] Error:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [sessionId, captureFrame, onPickupDetected]);

  const startScanning = useCallback((videoElement: HTMLVideoElement) => {
    if (intervalRef.current) return;
    
    videoRef.current = videoElement;
    setIsScanning(true);
    
    console.log('%c[SCAN] Starting product detection...', 'color: green; font-weight: bold');
    
    // Start periodic frame capture
    intervalRef.current = window.setInterval(analyzeFrame, FRAME_INTERVAL_MS);
    
    // Capture first frame immediately
    setTimeout(analyzeFrame, 500);
  }, [analyzeFrame]);

  const stopScanning = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    videoRef.current = null;
    setIsScanning(false);
    console.log('%c[SCAN] Stopped product detection', 'color: orange');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isScanning,
    lastDetection,
    startScanning,
    stopScanning,
  };
}
