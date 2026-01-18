import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory (where GEMINI_API_KEY is)
config({ path: resolve(__dirname, "../.env") });
// Also load local .env for LiveKit credentials
config({ path: resolve(__dirname, ".env") });

import { WorkerOptions, cli, defineAgent, JobContext, JobProcess, llm, voice } from "@livekit/agents";
import { RoomEvent } from "@livekit/rtc-node";
import * as silero from "@livekit/agents-plugin-silero";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as google from "@livekit/agents-plugin-google";
import { z } from "zod";

// Types matching backend
type AgentPayload =
  | {
      type: "ResearchResults";
      session_id: string;
      thread_id: string;
      query: string;
      top_match: {
        title: string;
        image_url: string;
        price: { amount: number; currency: string };
        specs: Array<{ key: string; value: string }>;
        source_url: string;
      };
      alternatives: Array<{
        title: string;
        price: { amount: number; currency: string };
        image_url: string;
        reason: string;
        source_url?: string;
      }>;
    }
  | {
      type: "ShoppingSummary";
      session_id: string;
      thread_id: string;
      productName: string;
      brand: string;
      detectedPrice: string;
      competitors: Array<{ site: string; price: string }>;
      isCompatible: boolean;
      compatibilityNote: string;
      valueScore: "buy" | "hold" | "avoid";
      aiInsight: string;
    }
  | {
      type: "Info";
      session_id: string;
      thread_id?: string;
      message: string;
    }
  | {
      type: "AISummary";
      session_id: string;
      thread_id: string;
      summary: string;
      pros: string[];
      cons: string[];
      best_for: string[];
    };

type BackendResponse = {
  payloads: AgentPayload[];
};

const BACKEND_URL = process.env.BACKEND_AGENT_URL || "http://localhost:8080";

/**
 * Converts AgentPayload to a spoken summary
 */
function payloadToSpeech(payload: AgentPayload): string {
  switch (payload.type) {
    case "ShoppingSummary":
      return `${payload.aiInsight} The product ${payload.productName} by ${payload.brand} is priced at ${payload.detectedPrice}. Value score: ${payload.valueScore}.`;
    case "ResearchResults":
      return `Found ${payload.top_match.title} priced at $${payload.top_match.price.amount} ${payload.top_match.price.currency}. Found ${payload.alternatives.length} alternative options.`;
    case "Info":
      return payload.message;
    case "AISummary":
      return `${payload.summary} Pros: ${payload.pros.join(", ")}. Cons: ${payload.cons.join(", ")}. Best for: ${payload.best_for.join(", ")}.`;
    default:
      return "Received response from shopping agent.";
  }
}

/**
 * Calls the backend agent API and returns the spoken response
 */
async function callBackendAgent(
  sessionId: string,
  type: "pickup" | "question" | "buy" | "end",
  body: Record<string, unknown>,
): Promise<string> {
  try {
    const url = `${BACKEND_URL}/agent/${sessionId}/${type}`;
    console.log(`[Tool] Calling backend: ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Tool] Backend error: ${error}`);
      return `Error calling shopping agent: ${error}`;
    }

    const data = (await response.json()) as BackendResponse;
    if (!data.payloads || data.payloads.length === 0) {
      return "No response from shopping agent.";
    }

    console.log(`[Tool] Got ${data.payloads.length} payloads from backend`);
    // Combine all payloads into a single spoken response
    return data.payloads.map(payloadToSpeech).join(" ");
  } catch (error) {
    console.error(`[Tool] Failed to call backend:`, error);
    return `Failed to call shopping agent: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Load VAD model once per worker
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    try {
      // Connect to the room first
      await ctx.connect();

      const sessionId = ctx.room.name || "default-session"; // Use room name as session ID
      const geminiKey = process.env.GEMINI_API_KEY;

      console.log(`[Agent] Joined room: ${sessionId}`);
      console.log(`[Agent] GEMINI_API_KEY present: ${!!geminiKey}`);

      if (!geminiKey) {
        console.error("[Agent] GEMINI_API_KEY is missing!");
        throw new Error("GEMINI_API_KEY is required to run the LiveKit agent.");
      }

      console.log("[Agent] Creating shopping agent tool...");

      // Create the shopping agent tool using llm.tool from @livekit/agents
      const shoppingAgentTool = llm.tool({
        description:
          "Call the ShoppingLens backend agent to research products, answer questions, or handle purchases. Use this when the user asks about products, prices, or wants to buy something.",
        parameters: z.object({
          action: z
            .enum(["pickup", "question", "buy", "end"])
            .describe(
              "The action to perform: pickup (user picked up an item), question (user asked a question), buy (user wants to purchase), end (end session)"
            ),
          question: z.string().optional().describe("The user's question (for question action)"),
          productId: z.string().optional().describe("Product ID to buy (for buy action)"),
          visibleText: z
            .array(z.string())
            .optional()
            .describe("Text visible on the product (for pickup action)"),
          brandHint: z.string().optional().describe("Brand name if known (for pickup action)"),
          categoryHint: z.string().optional().describe("Product category (for pickup action)"),
          visualDescription: z
            .string()
            .optional()
            .describe("Visual description of the product (for pickup action)"),
        }),
        execute: async (params) => {
          const { action, question, productId, visibleText, brandHint, categoryHint, visualDescription } = params;
          console.log(`[Tool] Executing action: ${action}`);
          
          if (!action) {
            return "Error: action is required";
          }
          
          let body: Record<string, unknown> = {};

          if (action === "question" && question) {
            body = { question };
          } else if (action === "buy" && productId) {
            body = { product_id: productId };
          } else if (action === "pickup") {
            body = {
              event_id: `pickup-${Date.now()}`,
              event_type: "PICKUP_DETECTED",
              confidence: 0.8,
              frame_ref: "voice",
              search_seed: {
                visible_text: visibleText || [],
                brand_hint: brandHint,
                category_hint: categoryHint,
                visual_description: visualDescription,
              },
            };
          }

          const validAction = action as "pickup" | "question" | "buy" | "end";
          return await callBackendAgent(sessionId, validAction, body);
        },
      });

      // Create the voice agent with tools
      console.log("[Agent] Creating voice agent...");
      const agent = new voice.Agent({
        instructions: `You are a helpful shopping assistant for ShoppingLens. 
You help users research products, compare prices, and make purchase decisions.

When users:
- Ask for prices, comparisons, or recommendations → use shoppingAgent tool with action "question" even if there was no pickup
- Mention picking up or looking at a specific item or provide visible text → use shoppingAgent tool with action "pickup" and extract product details
- Want to buy something → use shoppingAgent tool with action "buy"
- Want to end the session → use shoppingAgent tool with action "end"

Be conversational and friendly. After calling the shopping agent tool, summarize the response naturally for the user.`,
        tools: { shoppingAgent: shoppingAgentTool },
      });

      // Create the voice session with Gemini realtime model (audio in/out)
      const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
      const geminiVoice = process.env.GEMINI_VOICE || "Puck";
      const ttsModel = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

      console.log(`[Agent] Using Gemini model: ${geminiModel}, voice: ${geminiVoice}`);
      console.log(`[Agent] Using Gemini TTS model: ${ttsModel}`);

      const session = new voice.AgentSession({
        llm: new google.beta.realtime.RealtimeModel({
          model: geminiModel,
          apiKey: geminiKey,
          voice: geminiVoice,
          instructions:
            "You are a helpful shopping assistant for ShoppingLens. Speak naturally and concisely.",
        }),
        tts: new google.beta.TTS({
          model: ttsModel,
          voiceName: geminiVoice,
          apiKey: geminiKey,
        }),
        vad: ctx.proc.userData.vad as silero.VAD,
        turnDetection: new livekit.turnDetector.MultilingualModel(),
      });

      // Start the voice session
      console.log("[Agent] Starting voice session...");
      try {
        await session.start({
          agent,
          room: ctx.room,
        });
        console.log("[Agent] Voice session started successfully");
      } catch (err) {
        console.error("[Agent] Failed to start voice session:", err);
        throw err;
      }

      const dataTopic = process.env.LIVEKIT_DATA_TOPIC || "shoppinglens";
      ctx.room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic && topic !== dataTopic) return;
        try {
          const text = new TextDecoder().decode(payload);
          const parsed = JSON.parse(text) as AgentPayload;
          const speech = payloadToSpeech(parsed);
          console.log(
            `[Agent] Received LiveKit data${participant ? ` from ${participant.identity}` : ""}: ${parsed.type}`
          );
          session.say(speech, { addToChatCtx: false });
        } catch (err) {
          console.warn("[Agent] Failed to parse LiveKit data payload", err);
        }
      });
      console.log(`[Agent] Listening for LiveKit data on topic: ${dataTopic}`);

      // Initial greeting
      console.log("[Agent] Generating greeting...");
      try {
        await session.generateReply({
          instructions:
            "Greet the user warmly. Say: Hello! I'm your ShoppingLens assistant. I can help you research products, compare prices, and make purchase decisions. What would you like to know?",
        });
        console.log("[Agent] Greeting sent");
      } catch (err) {
        console.error("[Agent] Failed to generate greeting:", err);
      }
    } catch (err) {
      console.error("[Agent] FATAL ERROR in entry:", err);
      throw err;
    }
  },
});

// Run the agent
cli.runApp(
  new WorkerOptions({
    agent: __filename,
    agentName: "shoppinglens",
  })
);
