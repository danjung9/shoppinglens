import { Camera, Wifi, Cpu } from 'lucide-react';
import type { StatusState } from '../types';

interface StatusBarProps {
  status: StatusState;
}

export function StatusBar({ status }: StatusBarProps) {
  return (
    <div className="absolute left-6 top-6 z-10 flex flex-col gap-3">
      {/* Camera Status */}
      <div className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 backdrop-blur-lg border border-white/10">
        <div className="relative">
          <Camera className="h-4 w-4 text-white/80" />
          <span
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${
              status.cameraActive ? 'bg-green-400 pulse-dot' : 'bg-red-400'
            }`}
          />
        </div>
        <span className="text-xs font-medium text-white/80">
          {status.cameraActive ? 'Camera Active' : 'Camera Off'}
        </span>
      </div>

      {/* Backend Status */}
      <div className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 backdrop-blur-lg border border-white/10">
        <div className="relative">
          <Wifi className="h-4 w-4 text-white/80" />
          <span
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${
              status.backendConnected ? 'bg-green-400 pulse-dot' : 'bg-red-400'
            }`}
          />
        </div>
        <span className="text-xs font-medium text-white/80">
          {status.backendConnected ? 'Backend Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Processing Status */}
      <div className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 backdrop-blur-lg border border-white/10">
        <div className="relative">
          <Cpu className={`h-4 w-4 text-white/80 ${status.processingFrame ? 'animate-pulse' : ''}`} />
          {status.processingFrame && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-400 pulse-dot" />
          )}
        </div>
        <span className="text-xs font-medium text-white/80">
          {status.processingFrame ? 'Processing Frame...' : 'Idle'}
        </span>
      </div>
    </div>
  );
}
