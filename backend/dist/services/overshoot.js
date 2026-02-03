import { randomUUID } from "node:crypto";
const coerceNumber = (value, fallback) => {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};
const unwrapPayload = (payload) => {
    if (!payload || typeof payload !== "object")
        return null;
    const value = payload;
    if ("result" in value) {
        return {
            result: value.result,
            frame_ref: typeof value.frame_ref === "string" ? value.frame_ref : undefined,
        };
    }
    return { result: payload };
};
const parseOutput = (payload) => {
    const unwrapped = unwrapPayload(payload);
    if (!unwrapped)
        return null;
    const raw = unwrapped.result;
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    if (raw && typeof raw === "object") {
        const obj = raw;
        if (typeof obj.result === "string") {
            try {
                return JSON.parse(obj.result);
            }
            catch {
                return null;
            }
        }
        return obj;
    }
    return null;
};
export class OvershootBridge {
    threshold;
    debounceMs;
    lastSeenBySession = new Map();
    constructor(threshold, debounceMs) {
        this.threshold = threshold;
        this.debounceMs = debounceMs;
    }
    handle(sessionId, payload) {
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
        const searchSeed = {
            visible_text: Array.isArray(output.visible_text) ? output.visible_text : [],
            brand_hint: output.brand_hint,
            category_hint: output.category_hint,
            visual_description: output.visual_description,
        };
        const frameRef = typeof payload?.frame_ref === "string"
            ? payload.frame_ref
            : "overshoot://unknown";
        const event = {
            event_id: randomUUID(),
            event_type: "PICKUP_DETECTED",
            confidence,
            frame_ref: frameRef,
            search_seed: searchSeed,
        };
        return { shouldEmit: true, event };
    }
}
export const createOvershootBridgeFromEnv = () => {
    const threshold = Number(process.env.OVERSHOOT_PICKUP_THRESHOLD ?? 0.6);
    const debounceMs = Number(process.env.OVERSHOOT_DEBOUNCE_MS ?? 1500);
    return new OvershootBridge(threshold, debounceMs);
};
