import { useEffect, useState, useCallback, useRef } from 'react';
import { Room, RoomEvent, Track, RemoteTrack, RemoteTrackPublication } from 'livekit-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

interface UseLiveKitVoiceReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
}

export function useLiveKitVoice(sessionId: string): UseLiveKitVoiceReturn {
  const roomRef = useRef<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  const connect = useCallback(async () => {
    if (roomRef.current?.state === 'connected') {
      console.log('%c[VOICE] Already connected to LiveKit', 'color: orange');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Get token from backend
      console.log('%c[VOICE] Getting token from backend...', 'color: blue');
      const tokenResponse = await fetch(
        `${BACKEND_URL}/livekit/token?room=${sessionId}&participant=user-${Date.now()}`
      );

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('%c[VOICE] Token request failed:', 'color: red', errorText);
        throw new Error(`Failed to get LiveKit token: ${errorText}`);
      }

      const { token, url, room: roomName } = await tokenResponse.json();
      console.log('%c[VOICE] Got token for room:', 'color: green', roomName);
      console.log('%c[VOICE] LiveKit URL:', 'color: green', url);

      if (!token || !url) {
        throw new Error('Invalid token response - missing token or url');
      }

      // Create and connect room
      const room = new Room();
      roomRef.current = room;

      // Handle remote audio tracks (agent's voice)
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication) => {
        console.log('%c[VOICE] Track subscribed:', 'color: purple', track.kind, publication.trackSid);
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          audioElement.id = `audio-${publication.trackSid}`;
          document.body.appendChild(audioElement);
          console.log('%c[VOICE] Audio element attached', 'color: green');
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        console.log('%c[VOICE] Track unsubscribed', 'color: orange');
        track.detach().forEach((el) => el.remove());
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('%c[VOICE] Participant joined:', 'color: green; font-weight: bold', participant.identity);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        console.log('%c[VOICE] Participant left:', 'color: orange', participant.identity);
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        console.log('%c[VOICE] Disconnected from LiveKit', 'color: red');
      });

      // Connect to room
      console.log('%c[VOICE] Connecting to room...', 'color: blue');
      await room.connect(url, token);
      console.log('%c[VOICE] Connected to LiveKit room:', 'color: green; font-weight: bold', sessionId);
      console.log('%c[VOICE] Participants in room:', 'color: blue', room.remoteParticipants.size);

      // Enable microphone
      console.log('%c[VOICE] Enabling microphone...', 'color: blue');
      await room.localParticipant.setMicrophoneEnabled(true);
      console.log('%c[VOICE] Microphone enabled!', 'color: green; font-weight: bold');
      setIsConnected(true);
    } catch (err) {
      console.error('%c[VOICE] Connection error:', 'color: red; font-weight: bold', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to voice');
    } finally {
      setIsConnecting(false);
    }
  }, [sessionId]);

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (roomRef.current?.localParticipant) {
      const newMuted = !isMuted;
      roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  return {
    isConnected,
    isConnecting,
    isMuted,
    error,
    connect,
    disconnect,
    toggleMute,
  };
}
