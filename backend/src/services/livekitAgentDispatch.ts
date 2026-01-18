import { AgentDispatchClient } from "livekit-server-sdk";

type LiveKitAgentDispatchConfig = {
  host: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
};

const normalizeHost = (host: string): string => {
  if (host.startsWith("https://") || host.startsWith("http://")) return host;
  if (host.startsWith("wss://")) return host.replace("wss://", "https://");
  if (host.startsWith("ws://")) return host.replace("ws://", "http://");
  return `https://${host}`;
};

export class LiveKitAgentDispatcher {
  private client: AgentDispatchClient;
  private dispatchedRooms = new Set<string>();

  constructor(private config: LiveKitAgentDispatchConfig) {
    this.client = new AgentDispatchClient(config.host, config.apiKey, config.apiSecret);
  }

  async dispatch(roomName: string, metadata?: string): Promise<boolean> {
    if (this.dispatchedRooms.has(roomName)) {
      return false;
    }
    this.dispatchedRooms.add(roomName);
    try {
      await this.client.createDispatch(roomName, this.config.agentName, metadata ? { metadata } : {});
      return true;
    } catch (error) {
      this.dispatchedRooms.delete(roomName);
      throw error;
    }
  }

  clear(roomName: string): void {
    this.dispatchedRooms.delete(roomName);
  }
}

export const createLiveKitAgentDispatcherFromEnv = (): LiveKitAgentDispatcher | undefined => {
  const host = process.env.LIVEKIT_HOST;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const enabled = (process.env.LIVEKIT_AGENT_ENABLED ?? "true").toLowerCase();
  if (!host || !apiKey || !apiSecret || enabled === "false") return undefined;

  return new LiveKitAgentDispatcher({
    host: normalizeHost(host),
    apiKey,
    apiSecret,
    agentName: process.env.LIVEKIT_AGENT_NAME ?? "shoppinglens-voice-agent",
  });
};
