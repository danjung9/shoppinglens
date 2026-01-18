import { Router, Request, Response } from "express";
import { AccessToken } from "livekit-server-sdk";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { PickupEvent } from "../types.js";
import { OvershootBridge, OvershootPickupOutput } from "./overshoot.js";
import { LiveKitQuestionListener } from "./livekitQuestions.js";
import { LiveKitAgentDispatcher } from "./livekitAgentDispatch.js";
import { LiveKitSessionManager } from "./livekitSession.js";

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

export const buildRoutes = (
  orchestrator: AgentOrchestrator,
  overshoot: OvershootBridge,
  livekitListener?: LiveKitQuestionListener,
  livekitDispatcher?: LiveKitAgentDispatcher,
  livekitSessions?: LiveKitSessionManager,
): Router => {
  const router = Router();
  const ensureLiveKit = (sessionId: string) => {
    if (!livekitListener) return;
    void livekitListener.ensureRoom(sessionId).catch((error) => {
      console.warn("LiveKit listener failed:", error);
    });
  };
  const ensureAgentDispatch = (
    sessionId: string,
    event?: PickupEvent,
    output?: OvershootPickupOutput,
  ) => {
    if (!livekitDispatcher) return;
    const metadata = event
      ? JSON.stringify({
          search_seed: event.search_seed,
          confidence: event.confidence,
          frame_ref: event.frame_ref,
          overshoot_output: output,
        })
      : undefined;
    void livekitDispatcher
      .dispatch(sessionId, metadata)
      .then((dispatched) => {
        if (!dispatched) {
          console.log(`LiveKit agent already dispatched for room ${sessionId}`);
        }
      })
      .catch((error) => {
        console.warn("LiveKit agent dispatch failed:", error);
      });
  };

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  router.get("/overshoot/config", (_req: Request, res: Response) => {
    res.json({
      api_url: process.env.OVERSHOOT_API_URL ?? "",
      api_key: process.env.OVERSHOOT_API_KEY ?? "",
      model: process.env.OVERSHOOT_MODEL ?? "",
      prompt: process.env.OVERSHOOT_PROMPT ?? "",
    });
  });

  router.get("/livekit/config", (_req: Request, res: Response) => {
    res.json({
      host: process.env.LIVEKIT_HOST ?? "",
      agent_name: process.env.LIVEKIT_AGENT_NAME ?? "shoppinglens-voice-agent",
    });
  });

  router.post("/sessions/:sessionId/overshoot", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!isPickupEvent(req.body)) {
      res.status(400).json({ error: "Invalid pickup event" });
      return;
    }

    ensureLiveKit(sessionId);
    ensureAgentDispatch(sessionId, req.body);
    await orchestrator.handlePickup(sessionId, req.body);
    res.json({ status: "accepted" });
  });

  router.post("/sessions/:sessionId/overshoot/result", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const decision = overshoot.handle(sessionId, req.body);
    if (!decision.shouldEmit) {
      res.json({ status: "ignored", reason: decision.reason });
      return;
    }

    ensureLiveKit(sessionId);
    ensureAgentDispatch(sessionId, decision.event, decision.output);
    await orchestrator.handlePickup(sessionId, decision.event);
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

    ensureLiveKit(sessionId);
    ensureAgentDispatch(sessionId, req.body.event);
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

  router.post("/livekit/token", async (req: Request, res: Response) => {
    const host = process.env.LIVEKIT_HOST;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!host || !apiKey || !apiSecret) {
      res.status(400).json({ error: "LiveKit not configured" });
      return;
    }
    const room = typeof req.body?.room === "string" ? req.body.room.trim() : "";
    const identity = typeof req.body?.identity === "string" ? req.body.identity.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    if (!room || !identity) {
      res.status(400).json({ error: "Missing room or identity" });
      return;
    }

    const token = new AccessToken(apiKey, apiSecret, { identity, name });
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    res.json({ token: await token.toJwt() });
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
    if (livekitSessions) {
      const identity =
        process.env.LIVEKIT_AGENT_IDENTITY ??
        process.env.LIVEKIT_AGENT_NAME ??
        "shoppinglens-voice-agent";
      try {
        await livekitSessions.removeParticipant(sessionId, identity);
      } catch (error) {
        console.warn("LiveKit agent removal failed:", error);
      }
    }
    livekitDispatcher?.clear(sessionId);
    await orchestrator.handleEnd(sessionId);
    res.json({ status: "ended" });
  });

  return router;
};
