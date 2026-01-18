import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
export class LiveKitPublisher {
    client;
    topic;
    constructor(config) {
        this.client = new RoomServiceClient(config.host, config.apiKey, config.apiSecret);
        this.topic = config.topic;
    }
    async publish(room, payload) {
        const data = new TextEncoder().encode(JSON.stringify(payload));
        await this.client.sendData(room, data, DataPacket_Kind.RELIABLE, {
            topic: this.topic,
        });
    }
}
export const createLiveKitPublisherFromEnv = () => {
    const host = process.env.LIVEKIT_HOST;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const topic = process.env.LIVEKIT_DATA_TOPIC;
    if (!host || !apiKey || !apiSecret) {
        return undefined;
    }
    return new LiveKitPublisher({ host, apiKey, apiSecret, topic });
};
