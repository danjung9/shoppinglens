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
    console.log(`[STREAM] WebSocket server initialized at /ws`);
    
    this.wss.on("connection", (socket, request) => {
      const url = new URL(request.url ?? "", `http://${request.headers.host}`);
      const sessionId = url.searchParams.get("sessionId");
      console.log(`[STREAM] New WebSocket connection - sessionId: ${sessionId}`);
      
      if (!sessionId) {
        console.log(`[STREAM] Closing connection - missing sessionId`);
        socket.close(1008, "Missing sessionId");
        return;
      }

      const set = this.sessions.get(sessionId) ?? new Set<WebSocket>();
      set.add(socket);
      this.sessions.set(sessionId, set);
      console.log(`[STREAM] Session ${sessionId} now has ${set.size} connection(s)`);

      socket.on("close", () => {
        const current = this.sessions.get(sessionId);
        if (!current) return;
        current.delete(socket);
        if (current.size === 0) this.sessions.delete(sessionId);
        console.log(`[STREAM] WebSocket closed for session ${sessionId}`);
      });
    });
  }

  markRoomActive(sessionId: string): void {
    this.livekit?.markRoomActive(sessionId);
  }

  markRoomInactive(sessionId: string): void {
    this.livekit?.markRoomInactive(sessionId);
  }

  broadcast(sessionId: string, payload: AgentPayload): void {
    const sockets = this.sessions.get(sessionId);
    const message = JSON.stringify(payload);
    console.log(`[STREAM] Broadcasting to session ${sessionId}:`);
    console.log(`  Type: ${payload.type}`);
    console.log(`  Sockets: ${sockets?.size ?? 0}`);
    
    if (sockets) {
      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
          console.log(`  -> Sent to socket`);
        } else {
          console.log(`  -> Socket not open (state: ${socket.readyState})`);
        }
      }
    } else {
      console.log(`  -> No sockets connected for this session!`);
    }
    
    if (this.livekit) {
      void this.livekit.publish(sessionId, payload);
    }
  }
}
