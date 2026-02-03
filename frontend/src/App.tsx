<<<<<<< HEAD
import { useState, useCallback, useEffect } from 'react';
import { CameraBackground, ShoppingHUD, ScanPulse } from './components';
import type { ShoppingData, StatusState } from './types';

// Mock data for demonstration
const mockShoppingData: ShoppingData = {
  productName: 'Sony WH-1000XM5',
  brand: 'Sony Electronics',
  detectedPrice: '$349.99',
  competitors: [
    { site: 'Amazon', price: '$328.00' },
    { site: 'Best Buy', price: '$349.99' },
    { site: 'Walmart', price: '$339.00' },
  ],
  isCompatible: true,
  compatibilityNote: 'Works with your iPhone 15 Pro and MacBook Pro via Bluetooth 5.3',
  valueScore: 'buy',
  aiInsight:
    'Price dropped 15% from last month. Customer reviews highlight excellent noise cancellation. This is near the historical low price.',
};

export default function App() {
  const [status, setStatus] = useState<StatusState>({
    cameraActive: false,
    backendConnected: true, // Simulated
    processingFrame: false,
  });

  const [shoppingData, setShoppingData] = useState<ShoppingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCameraStateChange = useCallback((active: boolean) => {
    setStatus((prev) => ({ ...prev, cameraActive: active }));
  }, []);

  // Simulate product detection after camera starts
  useEffect(() => {
    if (status.cameraActive) {
      // Simulate processing delay
      const processingTimer = setTimeout(() => {
        setStatus((prev) => ({ ...prev, processingFrame: true }));
        setIsLoading(true);
      }, 1500);

      // Simulate data loading
      const dataTimer = setTimeout(() => {
        setShoppingData(mockShoppingData);
        setIsLoading(false);
        setStatus((prev) => ({ ...prev, processingFrame: false }));
      }, 4000);

      return () => {
        clearTimeout(processingTimer);
        clearTimeout(dataTimer);
      };
    }
  }, [status.cameraActive]);
=======
import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { CameraBackground, CameraBackgroundHandle } from './components/CameraBackground';
import { ShoppingHUD } from './components/ShoppingHUD';
import { VoiceControls } from './components/VoiceControls';
import { useBackendWebSocket } from './hooks/useBackendWebSocket';
import { useLiveKitVoice } from './hooks/useLiveKitVoice';
import { useProductDetection } from './hooks/useProductDetection';
import type { ShoppingData } from './types';
import { Camera, CameraOff, Scan } from 'lucide-react';

// Generate a session ID for this browser session
const SESSION_ID = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function App() {
  const cameraRef = useRef<CameraBackgroundHandle>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const autoConnectAttempted = useRef(false);

  // Backend WebSocket connection
  const {
    isConnected: wsConnected,
    shoppingData: backendData,
    isLoading,
    error: wsError,
  } = useBackendWebSocket(SESSION_ID);

  // LiveKit voice connection
  const {
    isConnected: voiceConnected,
    isConnecting: voiceConnecting,
    isMuted,
    error: voiceError,
    connect: connectVoice,
    disconnect: disconnectVoice,
    toggleMute,
  } = useLiveKitVoice(SESSION_ID);

  useEffect(() => {
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    void connectVoice();
  }, [connectVoice]);

  // Product detection callback
  const onPickupDetected = useCallback(() => {
    console.log('%c[APP] Product pickup detected!', 'color: green; font-weight: bold; font-size: 16px');
  }, []);

  // Product detection from camera frames
  const {
    isScanning,
    lastDetection,
    startScanning,
    stopScanning,
  } = useProductDetection(SESSION_ID, onPickupDetected);

  // Start scanning when camera becomes active
  useEffect(() => {
    if (cameraActive && cameraRef.current) {
      const video = cameraRef.current.getVideoElement();
      if (video) {
        // Wait a bit for video to be ready
        const timer = setTimeout(() => {
          startScanning(video);
        }, 1000);
        return () => clearTimeout(timer);
      }
    } else {
      stopScanning();
    }
  }, [cameraActive, startScanning, stopScanning]);

  const handleCameraStateChange = useCallback((active: boolean) => {
    setCameraActive(active);
  }, []);

  // Convert backend data to ShoppingData format for HUD
  const shoppingData: ShoppingData | null = useMemo(() => {
    if (!backendData) return null;
    
    // Map backend valueScore to frontend format
    const valueScore: 'buy' | 'wait' = 
      backendData.valueScore === 'buy' ? 'buy' : 'wait';
    
    return {
      productName: backendData.productName,
      brand: backendData.brand,
      detectedPrice: backendData.detectedPrice,
      competitors: backendData.competitors,
      isCompatible: backendData.isCompatible,
      compatibilityNote: backendData.compatibilityNote,
      valueScore,
      aiInsight: backendData.aiInsight,
    };
  }, [backendData]);
>>>>>>> origin/srinivas/final

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Base Layer: Camera Feed */}
<<<<<<< HEAD
      <CameraBackground onCameraStateChange={handleCameraStateChange} />

      {/* Scan Animation Layer */}
      <ScanPulse isScanning={status.processingFrame} />
=======
      <CameraBackground ref={cameraRef} onCameraStateChange={handleCameraStateChange} />
>>>>>>> origin/srinivas/final

      {/* Shopping HUD - Top Right */}
      <ShoppingHUD data={shoppingData} isLoading={isLoading} />

<<<<<<< HEAD
      {/* Bottom Info Bar */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
        <p className="text-sm font-medium text-white/80">ShoppingLens</p>
=======
      {/* Voice Controls - Top Left */}
      <VoiceControls
        isConnected={voiceConnected}
        isConnecting={voiceConnecting}
        isMuted={isMuted}
        onConnect={connectVoice}
        onDisconnect={disconnectVoice}
        onToggleMute={toggleMute}
        error={voiceError}
      />

      {/* Scanning Status - Bottom Right */}
      <div className="absolute bottom-6 right-6 z-20">
        <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-lg border ${
          isScanning 
            ? 'bg-blue-500/20 border-blue-400/30 text-blue-400' 
            : 'bg-white/10 border-white/20 text-white/60'
        }`}>
          {isScanning ? (
            <>
              <Scan className="h-4 w-4 animate-pulse" />
              <span>Scanning for products...</span>
            </>
          ) : cameraActive ? (
            <>
              <Camera className="h-4 w-4" />
              <span>Camera ready</span>
            </>
          ) : (
            <>
              <CameraOff className="h-4 w-4" />
              <span>Camera off</span>
            </>
          )}
        </div>
        
        {/* Show last detection info */}
        {lastDetection && lastDetection.pickup_detected && (
          <div className="mt-2 rounded-lg bg-green-500/20 border border-green-400/30 px-3 py-2 text-xs text-green-400">
            Detected: {lastDetection.visual_description || lastDetection.brand_hint || 'Product'}
            <br />
            Confidence: {(lastDetection.confidence * 100).toFixed(0)}%
          </div>
        )}
      </div>

      {/* Status indicators - Bottom Left */}
      <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-2">
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${wsConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          {wsConnected ? 'Backend Connected' : 'Backend Disconnected'}
        </div>
        {wsError && (
          <div className="rounded-full bg-red-500/20 px-3 py-1.5 text-xs text-red-400">
            {wsError}
          </div>
        )}
      </div>

      {/* Bottom Center - Brand */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center">
        <p className="text-sm font-medium text-white/80">ShoppingLens</p>
        <p className="text-xs text-white/40 font-mono">{SESSION_ID}</p>
>>>>>>> origin/srinivas/final
      </div>
    </div>
  );
}
