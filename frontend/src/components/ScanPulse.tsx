interface ScanPulseProps {
  isScanning: boolean;
}

export function ScanPulse({ isScanning }: ScanPulseProps) {
  if (!isScanning) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-5 overflow-hidden">
      {/* Horizontal scan line */}
      <div className="scan-line absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-lg shadow-blue-400/50" />
      
      {/* Corner brackets - Top Left */}
      <div className="absolute left-8 top-8">
        <div className="h-16 w-16 border-l-2 border-t-2 border-blue-400/60 rounded-tl-lg" />
      </div>
      
      {/* Corner brackets - Top Right */}
      <div className="absolute right-8 top-8">
        <div className="h-16 w-16 border-r-2 border-t-2 border-blue-400/60 rounded-tr-lg" />
      </div>
      
      {/* Corner brackets - Bottom Left */}
      <div className="absolute bottom-8 left-8">
        <div className="h-16 w-16 border-b-2 border-l-2 border-blue-400/60 rounded-bl-lg" />
      </div>
      
      {/* Corner brackets - Bottom Right */}
      <div className="absolute bottom-8 right-8">
        <div className="h-16 w-16 border-b-2 border-r-2 border-blue-400/60 rounded-br-lg" />
      </div>

      {/* Center crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-24 w-24">
          {/* Horizontal line */}
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
          {/* Vertical line */}
          <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-blue-400/60 to-transparent" />
          {/* Center dot */}
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400 shadow-lg shadow-blue-400/50" />
        </div>
      </div>
    </div>
  );
}
