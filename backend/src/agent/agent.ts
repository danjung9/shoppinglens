import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  ServerOptions,
  cli,
  defineAgent,
  inference,
  llm,
  metrics,
  voice,
} from "@livekit/agents";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as silero from "@livekit/agents-plugin-silero";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import { ParticipantKind, RoomEvent } from "@livekit/rtc-node";
import { z } from "zod";
import type { SearchSeed } from "../types.js";
import { searchWeb } from "../tools/webSearch.js";

dotenv.config();

if (!process.env.LIVEKIT_URL && process.env.LIVEKIT_HOST) {
  process.env.LIVEKIT_URL = process.env.LIVEKIT_HOST;
}

const DEFAULT_STT_MODEL = "assemblyai/universal-streaming:en";
const DEFAULT_LLM_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_TTS_MODEL = "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
const DEFAULT_INSTRUCTIONS =
  "You are ShoppingLens, a concise in-room voice assistant for shoppers. " +
  "Ask short clarifying questions when details are missing (brand, size, variant, price range). " +
  "Keep answers direct and helpful. " +
  "Use the search_web tool for up-to-date product details when needed. " +
  "When the user says 'buy now' or asks to purchase, call buy_now and repeat its message exactly.";

const sttModel = process.env.LIVEKIT_AGENT_STT_MODEL ?? DEFAULT_STT_MODEL;
const llmModel = process.env.LIVEKIT_AGENT_LLM_MODEL ?? DEFAULT_LLM_MODEL;
const ttsModel = process.env.LIVEKIT_AGENT_TTS_MODEL ?? DEFAULT_TTS_MODEL;
const instructions = process.env.LIVEKIT_AGENT_INSTRUCTIONS ?? DEFAULT_INSTRUCTIONS;
const greeting = process.env.LIVEKIT_AGENT_GREETING;
const agentName = process.env.LIVEKIT_AGENT_NAME ?? "shoppinglens-voice-agent";
const maxSessions = Number(process.env.LIVEKIT_AGENT_MAX_SESSIONS ?? "1");
const maxSessionsClamped = Number.isFinite(maxSessions) && maxSessions > 0 ? Math.floor(maxSessions) : 1;
const listenerIdentityPrefix = process.env.LIVEKIT_LISTENER_IDENTITY_PREFIX ?? "shoppinglens-backend";

type JobMetadata = {
  search_seed?: SearchSeed;
  confidence?: number;
  frame_ref?: string;
  overshoot_output?: {
    pickup_detected?: boolean;
    confidence?: number;
    visible_text?: string[];
    brand_hint?: string;
    category_hint?: string;
    visual_description?: string;
  };
};

const parseJobMetadata = (value?: string): JobMetadata | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as JobMetadata;
  } catch {
    return undefined;
  }
};

const formatSearchSeed = (seed: SearchSeed): string => {
  const parts: string[] = [];
  if (seed.visible_text.length) {
    parts.push(`visible text: ${seed.visible_text.join(", ")}`);
  }
  if (seed.brand_hint) {
    parts.push(`brand hint: ${seed.brand_hint}`);
  }
  if (seed.category_hint) {
    parts.push(`category hint: ${seed.category_hint}`);
  }
  if (seed.visual_description) {
    parts.push(`visual description: ${seed.visual_description}`);
  }
  return parts.join("; ");
};

const buildSeedPrompt = (summary: string): string => {
  return `Pickup context: ${summary}. Ask 1-2 short clarifying questions to narrow the product.`;
};

const isUserParticipant = (participant: { identity: string; info?: { kind?: ParticipantKind } }): boolean => {
  if (participant.info?.kind === ParticipantKind.AGENT) return false;
  if (listenerIdentityPrefix && participant.identity.startsWith(listenerIdentityPrefix)) return false;
  return true;
};

const hasActiveUser = (room: { remoteParticipants: Map<string, { identity: string; info?: { kind?: ParticipantKind } }> }): boolean => {
  for (const participant of room.remoteParticipants.values()) {
    if (isUserParticipant(participant)) {
      return true;
    }
  }
  return false;
};

const splitModelString = (value: string): { model: string; variant?: string } => {
  const idx = value.lastIndexOf(":");
  if (idx === -1) return { model: value };
  const model = value.slice(0, idx);
  const variant = value.slice(idx + 1) || undefined;
  return { model, variant };
};

const buildStt = () => {
  const factory = inference.STT as unknown as { fromModelString?: (model: string) => inference.STT };
  if (typeof factory.fromModelString === "function") {
    return factory.fromModelString(sttModel);
  }
  const { model, variant } = splitModelString(sttModel);
  return new inference.STT({ model, language: variant });
};

const buildTts = () => {
  const factory = inference.TTS as unknown as { fromModelString?: (model: string) => inference.TTS };
  if (typeof factory.fromModelString === "function") {
    return factory.fromModelString(ttsModel);
  }
  const { model, variant } = splitModelString(ttsModel);
  return new inference.TTS({ model, voice: variant });
};

class ShoppingLensAgent extends voice.Agent {
  constructor(customInstructions: string) {
    super({
      instructions: customInstructions,
      tools: {
        search_web: llm.tool({
          description:
            "Search the public web for product details, pricing, and availability. Returns top results with titles, URLs, and snippets.",
          parameters: z.object({
            query: z
              .string()
              .min(2)
              .describe("Search query with brand, product name, and key details."),
            limit: z
              .number()
              .int()
              .min(1)
              .max(8)
              .optional()
              .describe("Maximum number of results to return (1-8)."),
          }),
          execute: async ({ query, limit }) => {
            if (!query.trim()) {
              throw new llm.ToolError("search_web requires a non-empty query.");
            }
            try {
              const results = await searchWeb(query, limit ? { limit } : undefined);
              return { query: query.trim(), results };
            } catch (error) {
              const message = error instanceof Error ? error.message : "Search failed.";
              throw new llm.ToolError(message);
            }
          },
        }),
        buy_now: llm.tool({
          description: "Confirm a purchase and provide a demo order number.",
          parameters: z.object({
            productId: z
              .string()
              .optional()
              .describe("Optional product identifier to associate with the purchase."),
          }),
          execute: async () => {
            return "Item bought order number #123456";
          },
        }),
      },
    });
  }
}

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx) => {
    const metadata = parseJobMetadata(ctx.info.acceptArguments?.metadata);
    const seedSummary = metadata?.search_seed ? formatSearchSeed(metadata.search_seed) : undefined;
    const seedPrompt = seedSummary ? buildSeedPrompt(seedSummary) : undefined;
    const overshootJson = metadata?.overshoot_output ? JSON.stringify(metadata.overshoot_output) : undefined;
    const pickupPrompt = [seedPrompt, overshootJson ? `Raw pickup JSON: ${overshootJson}` : undefined]
      .filter(Boolean)
      .join(" ");
    const agentInstructions = seedSummary ? `${instructions} Pickup context: ${seedSummary}.` : instructions;
    let sawUser = false;
    let shuttingDown = false;

    const maybeShutdownIfEmpty = () => {
      if (shuttingDown || !sawUser) return;
      if (!hasActiveUser(ctx.room)) {
        shuttingDown = true;
        ctx.shutdown("room_empty");
      }
    };

    ctx.room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (isUserParticipant(participant)) {
        sawUser = true;
      }
    });

    ctx.room.on(RoomEvent.ParticipantDisconnected, () => {
      maybeShutdownIfEmpty();
    });

    const session = new voice.AgentSession({
      stt: buildStt(),
      llm: new inference.LLM({ model: llmModel }),
      tts: buildTts(),
      turnDetection: new livekit.turnDetector.MultilingualModel(),
      vad: ctx.proc.userData.vad,
      voiceOptions: {
        preemptiveGeneration: true,
      },
    });

    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
      usageCollector.collect(ev.metrics);
    });

    ctx.addShutdownCallback(async () => {
      const summary = usageCollector.getSummary();
      console.log(`Usage: ${JSON.stringify(summary)}`);
    });

    await session.start({
      agent: new ShoppingLensAgent(agentInstructions),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
      outputOptions: {
        transcriptionEnabled: true,
      },
    });

    await ctx.connect();
    sawUser = hasActiveUser(ctx.room) || sawUser;

    if (pickupPrompt) {
      session.generateReply({ userInput: pickupPrompt });
    } else if (greeting) {
      session.say(greeting);
    }
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName,
    requestFunc: async (job) => {
      const identityBase = agentName || `agent-${job.id}`;
      const identity = maxSessionsClamped > 1 ? `${identityBase}-${job.id}` : identityBase;
      await job.accept(agentName, identity, job.job.metadata ?? "");
    },
    loadFunc: async (worker) => {
      return Math.min(1, worker.activeJobs.length / maxSessionsClamped);
    },
    loadThreshold: 1,
  }),
);
