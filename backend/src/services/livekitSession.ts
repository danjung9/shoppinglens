import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

export type LiveKitSessionConfig = {
  host: string;
  apiKey: string;
  apiSecret: string;
};

const normalizeHost = (host: string): string => {
  if (host.startsWith("https://") || host.startsWith("http://")) return host;
  if (host.startsWith("wss://")) return host.replace("wss://", "https://");
  if (host.startsWith("ws://")) return host.replace("ws://", "http://");
  return `https://${host}`;
};

export class LiveKitSessionManager {
  private client: RoomServiceClient;

  constructor(private config: LiveKitSessionConfig) {
    this.client = new RoomServiceClient(config.host, config.apiKey, config.apiSecret);
  }

  async ensureRoom(roomName: string): Promise<void> {
    const rooms = await this.client.listRooms([roomName]);
    if (rooms.length > 0) return;
    await this.client.createRoom({ name: roomName });
  }

  async createToken(room: string, identity: string, name?: string): Promise<string> {
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity,
      name,
    });
    token.addGrant({
      room,
      roomJoin: true,
      canPublishData: true,
      canSubscribe: true,
    });
    return token.toJwt();
  }

  async removeParticipant(room: string, identity: string): Promise<void> {
    await this.client.removeParticipant(room, identity);
  }
}

export const createLiveKitSessionManagerFromEnv = (): LiveKitSessionManager | undefined => {
  const host = process.env.LIVEKIT_HOST;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!host || !apiKey || !apiSecret) return undefined;
  return new LiveKitSessionManager({ host: normalizeHost(host), apiKey, apiSecret });
};
