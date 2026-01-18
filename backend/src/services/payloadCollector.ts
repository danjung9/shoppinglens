import { AgentPayload } from "../types.js";
import { StreamHub, StreamPublisher } from "./stream.js";

/**
 * Collects AgentPayload values during orchestrator execution
 * while still broadcasting to the original StreamHub
 */
export class PayloadCollector implements StreamPublisher {
  private collected: AgentPayload[] = [];

  constructor(private baseHub: StreamHub) {}

  /**
   * Broadcasts the payload and also collects it
   */
  broadcast(sessionId: string, payload: AgentPayload): void {
    this.collected.push(payload);
    this.baseHub.broadcast(sessionId, payload);
  }

  /**
   * Returns all collected payloads and clears the collection
   */
  getPayloads(): AgentPayload[] {
    const result = [...this.collected];
    this.collected = [];
    return result;
  }

  /**
   * Clears collected payloads without returning them
   */
  clear(): void {
    this.collected = [];
  }
}
