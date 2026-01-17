import { Router, Request, Response } from "express";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { PickupEvent } from "../types.js";

const isPickupEvent = (body: unknown): body is PickupEvent => {
  if (!body || typeof body !== "object") return false;
  const event = body as PickupEvent;
  return (
    event.event_type === "PICKUP_DETECTED" &&
    typeof event.event_id === "string" &&
    typeof event.confidence === "number" &&
    typeof event.frame_ref === "string" &&
    !!event.search_seed
  );
};

export const buildRoutes = (orchestrator: AgentOrchestrator): Router => {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  router.post("/sessions/:sessionId/overshoot", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!isPickupEvent(req.body)) {
      res.status(400).json({ error: "Invalid pickup event" });
      return;
    }

    await orchestrator.handlePickup(sessionId, req.body);
    res.json({ status: "accepted" });
  });

  router.post("/webhooks/overshoot", async (req: Request, res: Response) => {
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

  router.post("/sessions/:sessionId/question", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const question = typeof req.body?.question === "string" ? req.body.question : "";
    if (!question.trim()) {
      res.status(400).json({ error: "Missing question" });
      return;
    }

    await orchestrator.handleQuestion(sessionId, question);
    res.json({ status: "accepted" });
  });

  router.post("/sessions/:sessionId/buy", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const productId = typeof req.body?.product_id === "string" ? req.body.product_id : "";
    if (!productId.trim()) {
      res.status(400).json({ error: "Missing product_id" });
      return;
    }

    await orchestrator.handleBuy(sessionId, productId);
    res.json({ status: "accepted" });
  });

  router.post("/sessions/:sessionId/end", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    await orchestrator.handleEnd(sessionId);
    res.json({ status: "ended" });
  });

  return router;
};
