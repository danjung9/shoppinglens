/**
 * Collects AgentPayload values during orchestrator execution
 * while still broadcasting to the original StreamHub
 */
export class PayloadCollector {
    baseHub;
    collected = [];
    constructor(baseHub) {
        this.baseHub = baseHub;
    }
    /**
     * Broadcasts the payload and also collects it
     */
    broadcast(sessionId, payload) {
        this.collected.push(payload);
        this.baseHub.broadcast(sessionId, payload);
    }
    /**
     * Returns all collected payloads and clears the collection
     */
    getPayloads() {
        const result = [...this.collected];
        this.collected = [];
        return result;
    }
    /**
     * Clears collected payloads without returning them
     */
    clear() {
        this.collected = [];
    }
}
