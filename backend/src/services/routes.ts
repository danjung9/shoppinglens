import { Router, Request, Response } from "express";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { PickupEvent } from "../types.js";
import { OvershootBridge, OvershootPickupOutput } from "./overshoot.js";
import { PayloadCollector } from "./payloadCollector.js";
import { StreamHub } from "./stream.js";
import { SessionStore } from "../state/sessionStore.js";
import { Toolset } from "../tools/index.js";
import { createLiveKitDispatchClientFromEnv, generateLiveKitToken } from "./livekit.js";

// Gemini Vision-based product detection
async function detectProductWithGemini(base64Frame: string): Promise<OvershootPickupOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[DETECT] No GEMINI_API_KEY, returning no detection");
    return { pickup_detected: false, confidence: 0 };
  }

  const model = "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Remove data URL prefix if present
  const imageData = base64Frame.replace(/^data:image\/[a-z]+;base64,/, "");

  const prompt = `You are a product identification assistant. Analyze this image to identify any product being held or shown.

FOCUS ON:
1. Read ANY text visible on the product: brand name, model number, product name, specs
2. Identify the brand (Apple, Samsung, Sony, Nike, etc.)
3. Identify the product category (smartphone, headphones, laptop, shoes, etc.)

If a product is clearly visible:
- pickup_detected: true
- confidence: how clear/certain (0.0-1.0)
- visible_text: ALL readable text from the product ["Samsung", "Galaxy S24", "256GB", etc.]
- brand_hint: the brand name
- category_hint: product type (be specific: "wireless headphones" not just "electronics")
- visual_description: SHORT product name like "Samsung Galaxy S24 smartphone" (NOT "a person holding...")

If no product visible (just person, background, unclear):
- pickup_detected: false
- confidence: 0

Return ONLY JSON:
{"pickup_detected": boolean, "confidence": number, "visible_text": string[], "brand_hint": string, "category_hint": string, "visual_description": string}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: imageData } }
          ]
        }],
        generationConfig: { temperature: 0.1 }
      }),
    });

    if (!response.ok) {
      console.log(`[DETECT] API error: ${response.status}`);
      return { pickup_detected: false, confidence: 0 };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        pickup_detected: Boolean(parsed.pickup_detected),
        confidence: Number(parsed.confidence) || 0,
        visible_text: Array.isArray(parsed.visible_text) ? parsed.visible_text : [],
        brand_hint: parsed.brand_hint || undefined,
        category_hint: parsed.category_hint || undefined,
        visual_description: parsed.visual_description || undefined,
      };
    }
    
    return { pickup_detected: false, confidence: 0 };
  } catch (error) {
    console.error("[DETECT] Error:", error);
    return { pickup_detected: false, confidence: 0 };
  }
}

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
  streamHub: StreamHub,
  store: SessionStore,
  tools: Toolset,
): Router => {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  /**
   * GET /livekit/token?room=SESSION_ID&participant=USER_NAME
   * 
   * Your frontend calls this to get a token, then connects to LiveKit.
   * Returns: { token: "...", url: "wss://..." }
   */
  router.get("/livekit/token", async (req: Request, res: Response) => {
    const room = typeof req.query.room === "string" ? req.query.room : "";
    const participant = typeof req.query.participant === "string" ? req.query.participant : `user-${Date.now()}`;

    console.log(`[LIVEKIT] Token request for room: ${room}, participant: ${participant}`);

    if (!room) {
      res.status(400).json({ error: "Missing room parameter" });
      return;
    }

    const token = await generateLiveKitToken(room, participant);
    if (!token) {
      console.log(`[LIVEKIT] Token generation failed - LiveKit not configured`);
      res.status(500).json({ error: "LiveKit not configured" });
      return;
    }

    const url = process.env.LIVEKIT_URL || process.env.LIVEKIT_HOST || "";
    console.log(`[LIVEKIT] Token generated. URL: ${url}`);
    streamHub.markRoomActive(room);

    // Auto-dispatch the agent to this room
    const dispatchClient = createLiveKitDispatchClientFromEnv();
    if (dispatchClient) {
      try {
        console.log(`[LIVEKIT] Dispatching agent to room: ${room}`);
        await dispatchClient.createDispatch(room, "shoppinglens", {});
        console.log(`[LIVEKIT] Agent dispatched successfully`);
      } catch (err: any) {
        // It's OK if dispatch fails (agent might already be in room or not running)
        console.log(`[LIVEKIT] Agent dispatch info: ${err.message || err}`);
      }
    }

    res.json({
      token,
      url,
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
  router.post("/livekit/dispatch", async (req: Request, res: Response) => {
    const room = typeof req.body?.room === "string" ? req.body.room : "";
    const agentName =
      typeof req.body?.agentName === "string" && req.body.agentName.trim()
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
    } catch (error) {
      res.status(500).json({ error: "Failed to dispatch agent" });
    }
  });

  router.get("/overshoot/config", (_req: Request, res: Response) => {
    res.json({
      api_url: process.env.OVERSHOOT_API_URL ?? "",
      api_key: process.env.OVERSHOOT_API_KEY ?? "",
      model: process.env.OVERSHOOT_MODEL ?? "",
      prompt: process.env.OVERSHOOT_PROMPT ?? "",
    });
  });

  // Endpoint for frontend to send video frames for product detection
  router.post("/sessions/:sessionId/frame", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { frame } = req.body; // base64 encoded image
    
    if (!frame || typeof frame !== "string") {
      res.status(400).json({ error: "Missing frame data" });
      return;
    }

    console.log(`[ROUTE] POST /sessions/${sessionId}/frame - analyzing...`);
    
    try {
      // Use Gemini Vision to detect product
      const detection = await detectProductWithGemini(frame);
      console.log(`[ROUTE] Detection result:`, detection);
      
      if (detection.pickup_detected && detection.confidence >= 0.7) {
        // Process through overshoot bridge for debouncing
        const decision = overshoot.handle(sessionId, {
          result: JSON.stringify(detection),
          frame_ref: `frame-${Date.now()}`,
        });
        
        if (decision.shouldEmit) {
          console.log(`[ROUTE] Product detected! Triggering research...`);
          await orchestrator.handlePickup(sessionId, decision.event);
          res.json({ status: "pickup_detected", detection });
          return;
        } else {
          res.json({ status: "debounced", reason: decision.reason });
          return;
        }
      }
      
      res.json({ status: "no_product", detection });
    } catch (error) {
      console.error(`[ROUTE] Frame analysis error:`, error);
      res.status(500).json({ error: "Failed to analyze frame" });
    }
  });

  router.post("/sessions/:sessionId/overshoot", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    console.log(`\n[ROUTE] POST /sessions/${sessionId}/overshoot`);
    console.log(`[ROUTE] Body:`, JSON.stringify(req.body, null, 2));
    
    if (!isPickupEvent(req.body)) {
      console.log(`[ROUTE] Invalid pickup event - validation failed`);
      res.status(400).json({ error: "Invalid pickup event" });
      return;
    }

    console.log(`[ROUTE] Valid pickup event, calling orchestrator...`);
    try {
      await orchestrator.handlePickup(sessionId, req.body);
      console.log(`[ROUTE] Orchestrator completed successfully`);
      res.json({ status: "accepted" });
    } catch (error) {
      console.error(`[ROUTE] Orchestrator error:`, error);
      res.status(500).json({ error: "Failed to process pickup event" });
    }
  });

  router.post("/sessions/:sessionId/overshoot/result", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const decision = overshoot.handle(sessionId, req.body);
    if (!decision.shouldEmit) {
      res.json({ status: "ignored", reason: decision.reason });
      return;
    }

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

  // LiveKit agent endpoints - return AgentPayload arrays
  router.post("/agent/:sessionId/pickup", async (req: Request, res: Response) => {
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

  router.post("/agent/:sessionId/question", async (req: Request, res: Response) => {
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

  router.post("/agent/:sessionId/buy", async (req: Request, res: Response) => {
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

  router.post("/agent/:sessionId/end", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const collector = new PayloadCollector(streamHub);
    const tempOrchestrator = new AgentOrchestrator(store, collector, tools);
    await tempOrchestrator.handleEnd(sessionId);
    const payloads = collector.getPayloads();
    res.json({ payloads });
  });

  return router;
};
