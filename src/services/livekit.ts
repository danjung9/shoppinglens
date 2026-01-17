import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
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
  const host = process.env.LIVEKIT_HOST;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const topic = process.env.LIVEKIT_DATA_TOPIC;

  if (!host || !apiKey || !apiSecret) {
    return undefined;
  }

  return new LiveKitPublisher({ host, apiKey, apiSecret, topic });
};
