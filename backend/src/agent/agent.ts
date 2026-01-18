import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  ServerOptions,
  cli,
  defineAgent,
  inference,
  metrics,
  voice,
} from "@livekit/agents";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as silero from "@livekit/agents-plugin-silero";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import { ParticipantKind, RoomEvent } from "@livekit/rtc-node";
import type { SearchSeed } from "../types.js";

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
  "Keep answers direct and helpful.";

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
    super({ instructions: customInstructions });
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

    if (seedPrompt) {
      session.generateReply({ userInput: seedPrompt });
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
