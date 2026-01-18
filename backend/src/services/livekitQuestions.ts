import { TextDecoder } from "node:util";
import { AccessToken } from "livekit-server-sdk";
import { Room, RoomEvent, type RemoteParticipant, dispose } from "@livekit/rtc-node";

type LiveKitQuestionListenerConfig = {
  host: string;
  apiKey: string;
  apiSecret: string;
  topic?: string;
  identityPrefix: string;
  displayName: string;
};

type QuestionHandler = (sessionId: string, question: string, participant?: RemoteParticipant) => Promise<void>;

const normalizeLiveKitUrl = (host: string): string => {
  if (host.startsWith("ws://") || host.startsWith("wss://")) return host;
  if (host.startsWith("http://")) return host.replace("http://", "ws://");
  if (host.startsWith("https://")) return host.replace("https://", "wss://");
  return `wss://${host}`;
};

const parseQuestion = (payload: string): string | null => {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const type = typeof data.type === "string" ? data.type.toLowerCase() : "";
      if (type && type !== "question" && type !== "userquestion") return null;
      if (typeof data.question === "string") return data.question.trim() || null;
      if (typeof data.text === "string") return data.text.trim() || null;
    } catch {
      return null;
    }
  }

  return trimmed;
};

export class LiveKitQuestionListener {
  private rooms = new Map<string, Room>();
  private decoder = new TextDecoder();
  private wsUrl: string;

  constructor(
    private config: LiveKitQuestionListenerConfig,
    private onQuestion: QuestionHandler,
  ) {
    this.wsUrl = normalizeLiveKitUrl(config.host);
  }

  async ensureRoom(sessionId: string): Promise<void> {
    if (this.rooms.has(sessionId)) return;

    const identity = `${this.config.identityPrefix}-${sessionId}`;
    const room = new Room();
    this.rooms.set(sessionId, room);

    room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (!participant) return;
      if (participant.identity === identity) return;
      if (this.config.topic && topic !== this.config.topic) return;

      const text = this.decoder.decode(payload);
      const question = parseQuestion(text);
      if (!question) return;
      void this.onQuestion(sessionId, question, participant);
    });

    room.on(RoomEvent.Disconnected, () => {
      this.rooms.delete(sessionId);
    });

    try {
      const token = await this.createToken(sessionId, identity);
      await room.connect(this.wsUrl, token, { autoSubscribe: false });
    } catch (error) {
      this.rooms.delete(sessionId);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    for (const room of this.rooms.values()) {
      room.disconnect();
    }
    this.rooms.clear();
    await dispose();
  }

  private async createToken(sessionId: string, identity: string): Promise<string> {
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity,
      name: this.config.displayName,
    });
    token.addGrant({
      room: sessionId,
      roomJoin: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return token.toJwt();
  }
}

export const createLiveKitQuestionListenerFromEnv = (
  onQuestion: QuestionHandler,
): LiveKitQuestionListener | undefined => {
  const host = process.env.LIVEKIT_HOST;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const enabled = (process.env.LIVEKIT_LISTENER_ENABLED ?? "true").toLowerCase();
  if (!host || !apiKey || !apiSecret || enabled === "false") return undefined;

  return new LiveKitQuestionListener(
    {
      host,
      apiKey,
      apiSecret,
      topic: process.env.LIVEKIT_INPUT_TOPIC || undefined,
      identityPrefix: process.env.LIVEKIT_LISTENER_IDENTITY_PREFIX ?? "shoppinglens-backend",
      displayName: process.env.LIVEKIT_LISTENER_NAME ?? "ShoppingLens Backend",
    },
    onQuestion,
  );
};
