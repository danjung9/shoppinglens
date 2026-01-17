import { randomUUID } from "node:crypto";
import { PickupEvent, SearchSeed } from "../types.js";

export type OvershootPickupOutput = {
  pickup_detected: boolean;
  confidence: number;
  visible_text?: string[];
  brand_hint?: string;
  category_hint?: string;
  visual_description?: string;
};

type OvershootRequestPayload = {
  result: string | OvershootPickupOutput;
  frame_ref?: string;
};

type EmitDecision =
  | { shouldEmit: true; event: PickupEvent }
  | { shouldEmit: false; reason: string };

const coerceNumber = (value: unknown, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const parseOutput = (payload: OvershootRequestPayload): OvershootPickupOutput | null => {
  const raw = payload.result;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as OvershootPickupOutput;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") {
    return raw as OvershootPickupOutput;
  }
  return null;
};

export class OvershootBridge {
  private lastSeenBySession = new Map<string, number>();

  constructor(
    private threshold: number,
    private debounceMs: number,
  ) {}

  handle(sessionId: string, payload: OvershootRequestPayload): EmitDecision {
    const output = parseOutput(payload);
    if (!output) {
      return { shouldEmit: false, reason: "invalid_result" };
    }

    if (!output.pickup_detected) {
      return { shouldEmit: false, reason: "pickup_not_detected" };
    }

    const confidence = coerceNumber(output.confidence, 0);
    if (confidence < this.threshold) {
      return { shouldEmit: false, reason: "low_confidence" };
    }

    const now = Date.now();
    const lastSeen = this.lastSeenBySession.get(sessionId) ?? 0;
    if (now - lastSeen < this.debounceMs) {
      return { shouldEmit: false, reason: "debounced" };
    }
    this.lastSeenBySession.set(sessionId, now);

    const searchSeed: SearchSeed = {
      visible_text: Array.isArray(output.visible_text) ? output.visible_text : [],
      brand_hint: output.brand_hint,
      category_hint: output.category_hint,
      visual_description: output.visual_description,
    };

    const event: PickupEvent = {
      event_id: randomUUID(),
      event_type: "PICKUP_DETECTED",
      confidence,
      frame_ref: payload.frame_ref ?? "overshoot://unknown",
      search_seed: searchSeed,
    };

    return { shouldEmit: true, event };
  }
}

export const createOvershootBridgeFromEnv = (): OvershootBridge => {
  const threshold = Number(process.env.OVERSHOOT_PICKUP_THRESHOLD ?? 0.6);
  const debounceMs = Number(process.env.OVERSHOOT_DEBOUNCE_MS ?? 1500);
  return new OvershootBridge(threshold, debounceMs);
};
