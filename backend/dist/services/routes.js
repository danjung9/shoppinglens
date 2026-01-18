import { Router } from "express";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { PayloadCollector } from "./payloadCollector.js";
import { createLiveKitDispatchClientFromEnv, generateLiveKitToken } from "./livekit.js";
const isPickupEvent = (body) => {
    if (!body || typeof body !== "object")
        return false;
    const event = body;
    return (event.event_type === "PICKUP_DETECTED" &&
        typeof event.event_id === "string" &&
        typeof event.confidence === "number" &&
        typeof event.frame_ref === "string" &&
        !!event.search_seed);
};
export const buildRoutes = (orchestrator, overshoot, streamHub, store, tools) => {
    const router = Router();
    router.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    /**
     * GET /livekit/token?room=SESSION_ID&participant=USER_NAME
     *
     * Your frontend calls this to get a token, then connects to LiveKit.
     * Returns: { token: "...", url: "wss://..." }
     */
    router.get("/livekit/token", async (req, res) => {
        const room = typeof req.query.room === "string" ? req.query.room : "";
        const participant = typeof req.query.participant === "string" ? req.query.participant : `user-${Date.now()}`;
        if (!room) {
            res.status(400).json({ error: "Missing room parameter" });
            return;
        }
        const token = await generateLiveKitToken(room, participant);
        if (!token) {
            res.status(500).json({ error: "LiveKit not configured" });
            return;
        }
        res.json({
            token,
            url: process.env.LIVEKIT_URL || process.env.LIVEKIT_HOST || "",
            room,
            participant,
        });
    });
    /**
     * POST /livekit/dispatch
     * Body: { room: "test-room-5", agentName?: "shoppinglens", metadata?: "..." }
     *
     * Explicitly dispatches an agent worker to a room.
     */
    router.post("/livekit/dispatch", async (req, res) => {
        const room = typeof req.body?.room === "string" ? req.body.room : "";
        const agentName = typeof req.body?.agentName === "string" && req.body.agentName.trim()
            ? req.body.agentName.trim()
            : "shoppinglens";
        const metadata = typeof req.body?.metadata === "string" ? req.body.metadata : undefined;
        if (!room) {
            res.status(400).json({ error: "Missing room in body" });
            return;
        }
        const client = createLiveKitDispatchClientFromEnv();
        if (!client) {
            res.status(500).json({ error: "LiveKit not configured" });
            return;
        }
        try {
            const dispatch = await client.createDispatch(room, agentName, { metadata });
            res.json({ dispatch });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to dispatch agent" });
        }
    });
    router.get("/overshoot/config", (_req, res) => {
        res.json({
            api_url: process.env.OVERSHOOT_API_URL ?? "",
            api_key: process.env.OVERSHOOT_API_KEY ?? "",
            model: process.env.OVERSHOOT_MODEL ?? "",
            prompt: process.env.OVERSHOOT_PROMPT ?? "",
        });
    });
    router.post("/sessions/:sessionId/overshoot", async (req, res) => {
        const { sessionId } = req.params;
        if (!isPickupEvent(req.body)) {
            res.status(400).json({ error: "Invalid pickup event" });
            return;
        }
        await orchestrator.handlePickup(sessionId, req.body);
        res.json({ status: "accepted" });
    });
    router.post("/sessions/:sessionId/overshoot/result", async (req, res) => {
        const { sessionId } = req.params;
        const decision = overshoot.handle(sessionId, req.body);
        if (!decision.shouldEmit) {
            res.json({ status: "ignored", reason: decision.reason });
            return;
        }
        await orchestrator.handlePickup(sessionId, decision.event);
        res.json({ status: "accepted" });
    });
    router.post("/webhooks/overshoot", async (req, res) => {
        const sessionId = typeof req.body?.session_id === "string" ? req.body.session_id : "";
        if (!sessionId) {
            res.status(400).json({ error: "Missing session_id" });
            return;
        }
        if (!isPickupEvent(req.body?.event)) {
            res.status(400).json({ error: "Invalid pickup event" });
            return;
        }
        await orchestrator.handlePickup(sessionId, req.body.event);
        res.json({ status: "accepted" });
    });
    router.post("/sessions/:sessionId/question", async (req, res) => {
        const { sessionId } = req.params;
        const question = typeof req.body?.question === "string" ? req.body.question : "";
        if (!question.trim()) {
            res.status(400).json({ error: "Missing question" });
            return;
        }
        await orchestrator.handleQuestion(sessionId, question);
        res.json({ status: "accepted" });
    });
    router.post("/sessions/:sessionId/buy", async (req, res) => {
        const { sessionId } = req.params;
        const productId = typeof req.body?.product_id === "string" ? req.body.product_id : "";
        if (!productId.trim()) {
            res.status(400).json({ error: "Missing product_id" });
            return;
        }
        await orchestrator.handleBuy(sessionId, productId);
        res.json({ status: "accepted" });
    });
    router.post("/sessions/:sessionId/end", async (req, res) => {
        const { sessionId } = req.params;
        await orchestrator.handleEnd(sessionId);
        res.json({ status: "ended" });
    });
    // LiveKit agent endpoints - return AgentPayload arrays
    router.post("/agent/:sessionId/pickup", async (req, res) => {
        const { sessionId } = req.params;
        if (!isPickupEvent(req.body)) {
            res.status(400).json({ error: "Invalid pickup event" });
            return;
        }
        const collector = new PayloadCollector(streamHub);
        const tempOrchestrator = new AgentOrchestrator(store, collector, tools);
        await tempOrchestrator.handlePickup(sessionId, req.body);
        const payloads = collector.getPayloads();
        res.json({ payloads });
    });
    router.post("/agent/:sessionId/question", async (req, res) => {
        const { sessionId } = req.params;
        const question = typeof req.body?.question === "string" ? req.body.question : "";
        if (!question.trim()) {
            res.status(400).json({ error: "Missing question" });
            return;
        }
        const collector = new PayloadCollector(streamHub);
        const tempOrchestrator = new AgentOrchestrator(store, collector, tools);
        await tempOrchestrator.handleQuestion(sessionId, question);
        const payloads = collector.getPayloads();
        res.json({ payloads });
    });
    router.post("/agent/:sessionId/buy", async (req, res) => {
        const { sessionId } = req.params;
        const productId = typeof req.body?.product_id === "string" ? req.body.product_id : "";
        if (!productId.trim()) {
            res.status(400).json({ error: "Missing product_id" });
            return;
        }
        const collector = new PayloadCollector(streamHub);
        const tempOrchestrator = new AgentOrchestrator(store, collector, tools);
        await tempOrchestrator.handleBuy(sessionId, productId);
        const payloads = collector.getPayloads();
        res.json({ payloads });
    });
    router.post("/agent/:sessionId/end", async (req, res) => {
        const { sessionId } = req.params;
        const collector = new PayloadCollector(streamHub);
        const tempOrchestrator = new AgentOrchestrator(store, collector, tools);
        await tempOrchestrator.handleEnd(sessionId);
        const payloads = collector.getPayloads();
        res.json({ payloads });
    });
    return router;
};
