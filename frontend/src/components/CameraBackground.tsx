import { useEffect, useRef, useState } from 'react';

interface CameraBackgroundProps {
  onCameraStateChange: (active: boolean) => void;
}

export function CameraBackground({ onCameraStateChange }: CameraBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          onCameraStateChange(true);
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setError('Unable to access camera. Please grant permission.');
        onCameraStateChange(false);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      onCameraStateChange(false);
    };
  }, [onCameraStateChange]);

  return (
    <div className="fixed inset-0 z-0 bg-black">
      {error ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="rounded-2xl bg-black/60 p-8 text-center backdrop-blur-lg">
            <p className="text-lg text-white/80">{error}</p>
            <p className="mt-2 text-sm text-white/50">
              Check your browser settings to enable camera access
            </p>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
