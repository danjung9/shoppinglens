import { Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { AgentPayload } from "../types.js";
import { LiveKitPublisher } from "./livekit.js";

export type StreamPublisher = {
  broadcast(sessionId: string, payload: AgentPayload): void;
};

export class StreamHub implements StreamPublisher {
  private wss: WebSocketServer;
  private sessions = new Map<string, Set<WebSocket>>();

  constructor(server: Server, private livekit?: LiveKitPublisher) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (socket, request) => {
      const url = new URL(request.url ?? "", `http://${request.headers.host}`);
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        socket.close(1008, "Missing sessionId");
        return;
      }

      const set = this.sessions.get(sessionId) ?? new Set<WebSocket>();
      set.add(socket);
      this.sessions.set(sessionId, set);

      socket.on("close", () => {
        const current = this.sessions.get(sessionId);
        if (!current) return;
        current.delete(socket);
        if (current.size === 0) this.sessions.delete(sessionId);
      });
    });
  }

  broadcast(sessionId: string, payload: AgentPayload): void {
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
