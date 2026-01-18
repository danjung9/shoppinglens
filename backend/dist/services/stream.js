import WebSocket, { WebSocketServer } from "ws";
export class StreamHub {
    livekit;
    wss;
    sessions = new Map();
    constructor(server, livekit) {
        this.livekit = livekit;
        this.wss = new WebSocketServer({ server, path: "/ws" });
        this.wss.on("connection", (socket, request) => {
            const url = new URL(request.url ?? "", `http://${request.headers.host}`);
            const sessionId = url.searchParams.get("sessionId");
            if (!sessionId) {
                socket.close(1008, "Missing sessionId");
                return;
            }
            const set = this.sessions.get(sessionId) ?? new Set();
            set.add(socket);
            this.sessions.set(sessionId, set);
            socket.on("close", () => {
                const current = this.sessions.get(sessionId);
                if (!current)
                    return;
                current.delete(socket);
                if (current.size === 0)
                    this.sessions.delete(sessionId);
            });
        });
    }
    broadcast(sessionId, payload) {
        const sockets = this.sessions.get(sessionId);
        const message = JSON.stringify(payload);
        if (sockets) {
            for (const socket of sockets) {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(message);
                }
            }
        }
        if (this.livekit) {
            void this.livekit.publish(sessionId, payload).catch((error) => {
                console.warn("LiveKit publish failed:", error);
            });
        }
    }
}
