import { Router } from "express";
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
export const buildRoutes = (orchestrator, overshoot) => {
    const router = Router();
    router.get("/health", (_req, res) => {
        res.json({ status: "ok" });
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
    return router;
};
