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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Base Layer: Camera Feed */}
      <CameraBackground onCameraStateChange={handleCameraStateChange} />

      {/* Scan Animation Layer */}
      <ScanPulse isScanning={status.processingFrame} />

      {/* Shopping HUD - Top Right */}
      <ShoppingHUD data={shoppingData} isLoading={isLoading} />

      {/* Bottom Info Bar */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
        <p className="text-sm font-medium text-white/80">ShoppingLens</p>
      </div>
    </div>
  );
}
