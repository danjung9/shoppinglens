import { Mic, MicOff, Phone, PhoneOff, Loader2 } from 'lucide-react';

interface VoiceControlsProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMute: () => void;
  error: string | null;
}

export function VoiceControls({
  isConnected,
  isConnecting,
  isMuted,
  onConnect,
  onDisconnect,
  onToggleMute,
  error,
}: VoiceControlsProps) {
  return (
    <div className="absolute left-6 top-6 z-20 flex flex-col gap-3">
      {/* Connection button */}
      {!isConnected ? (
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="flex items-center gap-2 rounded-full bg-green-500/80 px-4 py-2 text-white text-sm font-medium backdrop-blur-lg border border-green-400/30 hover:bg-green-500 transition-colors disabled:opacity-50"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Phone className="h-4 w-4" />
              <span>Start Voice</span>
            </>
          )}
        </button>
      ) : (
        <div className="flex gap-2">
          {/* Mute toggle */}
          <button
            onClick={onToggleMute}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-white text-sm font-medium backdrop-blur-lg border transition-colors ${
              isMuted
                ? 'bg-red-500/80 border-red-400/30 hover:bg-red-500'
                : 'bg-white/10 border-white/20 hover:bg-white/20'
            }`}
          >
            {isMuted ? (
              <>
                <MicOff className="h-4 w-4" />
                <span>Unmute</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                <span>Mute</span>
              </>
            )}
          </button>

          {/* Disconnect button */}
          <button
            onClick={onDisconnect}
            className="flex items-center gap-2 rounded-full bg-red-500/80 px-4 py-2 text-white text-sm font-medium backdrop-blur-lg border border-red-400/30 hover:bg-red-500 transition-colors"
          >
            <PhoneOff className="h-4 w-4" />
            <span>End</span>
          </button>
        </div>
      )}

      {/* Voice status indicator */}
      {isConnected && (
        <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1.5 text-xs text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Voice Active
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-400 max-w-[200px]">
          {error}
        </div>
      )}
    </div>
  );
}
