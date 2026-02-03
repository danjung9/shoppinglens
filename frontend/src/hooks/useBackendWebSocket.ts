import { useEffect, useRef, useState, useCallback } from 'react';
import type { AgentPayload, ShoppingSummaryPayload, InfoPayload } from '../types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
const WS_URL = BACKEND_URL.replace(/^http/, 'ws');

interface UseBackendWebSocketReturn {
  isConnected: boolean;
  shoppingData: ShoppingSummaryPayload | null;
  lastInfo: InfoPayload | null;
  isLoading: boolean;
  error: string | null;
  triggerPickup: (searchSeed: {
    visible_text: string[];
    brand_hint?: string;
    category_hint?: string;
    visual_description?: string;
  }) => Promise<void>;
  askQuestion: (question: string) => Promise<void>;
}

export function useBackendWebSocket(sessionId: string): UseBackendWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [shoppingData, setShoppingData] = useState<ShoppingSummaryPayload | null>(null);
  const [lastInfo, setLastInfo] = useState<InfoPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    if (!sessionId) return;

    console.log(`%c[WS] Connecting to ${WS_URL}/ws?sessionId=${sessionId}`, 'color: blue; font-weight: bold');
    const ws = new WebSocket(`${WS_URL}/ws?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('%c[WS] Connected!', 'color: green; font-weight: bold');
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const payload: AgentPayload = JSON.parse(event.data);
        console.log(`%c[WS] Received ${payload.type}:`, 'color: purple; font-weight: bold', payload);

        if (payload.type === 'ShoppingSummary') {
          console.log('%c[WS] Setting shopping data!', 'color: green; font-weight: bold');
          setShoppingData(payload);
          setIsLoading(false);
        } else if (payload.type === 'Info') {
          console.log(`%c[WS] Info: ${payload.message}`, 'color: gray');
          setLastInfo(payload);
          if (payload.message.includes('Starting research')) {
            setIsLoading(true);
          }
        } else if (payload.type === 'ResearchResults') {
          console.log('%c[WS] Research results received', 'color: orange; font-weight: bold');
          console.log('  Top match:', payload.top_match?.title);
          console.log('  Alternatives:', payload.alternatives?.length);
        }
      } catch (err) {
        console.error('%c[WS] Parse error:', 'color: red', err);
      }
    };

    ws.onerror = (err) => {
      console.error('%c[WS] Connection error:', 'color: red; font-weight: bold', err);
      setError('WebSocket connection error');
    };

    ws.onclose = (event) => {
      console.log(`%c[WS] Disconnected (code: ${event.code})`, 'color: orange; font-weight: bold');
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

  // Trigger a pickup event (simulate product detection)
  const triggerPickup = useCallback(async (searchSeed: {
    visible_text: string[];
    brand_hint?: string;
    category_hint?: string;
    visual_description?: string;
  }) => {
    console.log('%c[PICKUP] Triggering pickup event...', 'color: blue; font-weight: bold');
    console.log('  Search seed:', searchSeed);
    
    setIsLoading(true);
    setError(null);
    setShoppingData(null);

    const pickupEvent = {
      event_id: crypto.randomUUID(),
      event_type: 'PICKUP_DETECTED',
      confidence: 0.95,
      frame_ref: `frame-${Date.now()}`,
      search_seed: searchSeed,
    };

    console.log('%c[PICKUP] Sending to backend:', 'color: blue', `${BACKEND_URL}/sessions/${sessionId}/overshoot`);
    console.log('  Payload:', pickupEvent);

    try {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/overshoot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pickupEvent),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('%c[PICKUP] Backend error:', 'color: red', response.status, text);
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const result = await response.json();
      console.log('%c[PICKUP] Backend accepted:', 'color: green; font-weight: bold', result);
    } catch (err) {
      console.error('%c[PICKUP] Failed:', 'color: red; font-weight: bold', err);
      setError('Failed to send pickup event');
      setIsLoading(false);
    }
  }, [sessionId]);

  // Ask a follow-up question
  const askQuestion = useCallback(async (question: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log('Question sent:', await response.json());
    } catch (err) {
      console.error('Failed to send question:', err);
      setError('Failed to send question');
      setIsLoading(false);
    }
  }, [sessionId]);

  return {
    isConnected,
    shoppingData,
    lastInfo,
    isLoading,
    error,
    triggerPickup,
    askQuestion,
  };
}
