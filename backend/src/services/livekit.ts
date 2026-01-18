import { AccessToken, AgentDispatchClient, DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
import { AgentPayload } from "../types.js";

export type LiveKitConfig = {
  host: string;
  apiKey: string;
  apiSecret: string;
  topic?: string;
};

export class LiveKitPublisher {
  private client: RoomServiceClient;
  private topic?: string;

  constructor(config: LiveKitConfig) {
    this.client = new RoomServiceClient(config.host, config.apiKey, config.apiSecret);
    this.topic = config.topic;
  }

  async publish(room: string, payload: AgentPayload): Promise<void> {
    const data = new TextEncoder().encode(JSON.stringify(payload));
    await this.client.sendData(room, data, DataPacket_Kind.RELIABLE, {
      topic: this.topic,
    });
  }
}

export const createLiveKitPublisherFromEnv = (): LiveKitPublisher | undefined => {
  const host = process.env.LIVEKIT_HOST ?? process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const topic = process.env.LIVEKIT_DATA_TOPIC;

  if (!host || !apiKey || !apiSecret) {
    return undefined;
  }

  const normalizedHost = host.replace(/^wss?:\/\//, "https://");
  return new LiveKitPublisher({ host: normalizedHost, apiKey, apiSecret, topic });
};

/**
 * Generate a LiveKit access token for a participant to join a room.
 * Your frontend calls this endpoint to get a token, then connects to LiveKit.
 */
export const generateLiveKitToken = async (
  roomName: string,
  participantName: string,
  options?: { ttl?: number }
): Promise<string | null> => {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    ttl: options?.ttl ?? 3600, // 1 hour default
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await token.toJwt();
};

export const createLiveKitDispatchClientFromEnv = (): AgentDispatchClient | undefined => {
  const host = process.env.LIVEKIT_HOST ?? process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!host || !apiKey || !apiSecret) {
    return undefined;
  }

  const normalizedHost = host.replace(/^wss?:\/\//, "https://");
  return new AgentDispatchClient(normalizedHost, apiKey, apiSecret);
};
