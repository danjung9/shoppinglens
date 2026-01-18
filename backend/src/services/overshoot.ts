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

type OvershootSdkResult = {
  result: string;
  inference_latency_ms?: number;
  total_latency_ms?: number;
};

type OvershootRequestPayload = {
  result: string | OvershootPickupOutput | OvershootSdkResult;
  frame_ref?: string;
};

type EmitDecision =
  | { shouldEmit: true; event: PickupEvent; output: OvershootPickupOutput }
  | { shouldEmit: false; reason: string };

const coerceNumber = (value: unknown, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const unwrapPayload = (payload: unknown): { result: unknown; frame_ref?: string } | null => {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  if ("result" in value) {
    return {
      result: value.result,
      frame_ref: typeof value.frame_ref === "string" ? value.frame_ref : undefined,
    };
  }
  return { result: payload };
};

const parseOutput = (payload: unknown): OvershootPickupOutput | null => {
  const unwrapped = unwrapPayload(payload);
  if (!unwrapped) return null;
  const raw = unwrapped.result;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as OvershootPickupOutput;
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.result === "string") {
      try {
        return JSON.parse(obj.result) as OvershootPickupOutput;
      } catch {
        return null;
      }
    }
    return obj as OvershootPickupOutput;
  }
  return null;
};

export class OvershootBridge {
  private lastSeenBySession = new Map<string, number>();

  constructor(
    private threshold: number,
    private debounceMs: number,
  ) {}

  handle(sessionId: string, payload: unknown): EmitDecision {
    const output = parseOutput(payload);
    if (!output) {
      return { shouldEmit: false, reason: "invalid_result" };
    }

    if (!output.pickup_detected) {
      return { shouldEmit: false, reason: "pickup_not_detected" };
    }

    const confidenceValue =
      typeof output.confidence === "number" && Number.isFinite(output.confidence)
        ? output.confidence
        : undefined;
    const confidence = confidenceValue ?? 1;
    if (confidenceValue !== undefined && confidence < this.threshold) {
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

    const frameRef = typeof (payload as OvershootRequestPayload)?.frame_ref === "string"
      ? (payload as OvershootRequestPayload).frame_ref
      : "overshoot://unknown";

    const event: PickupEvent = {
      event_id: randomUUID(),
      event_type: "PICKUP_DETECTED",
      confidence,
      frame_ref: frameRef,
      search_seed: searchSeed,
    };

    return { shouldEmit: true, event, output };
  }
}

export const createOvershootBridgeFromEnv = (): OvershootBridge => {
  const threshold = Number(process.env.OVERSHOOT_PICKUP_THRESHOLD ?? 0.6);
  const debounceMs = Number(process.env.OVERSHOOT_DEBOUNCE_MS ?? 1500);
  return new OvershootBridge(threshold, debounceMs);
};
