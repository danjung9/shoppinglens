import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildRoutes } from "./services/routes.js";
import { createStubTools } from "./tools/index.js";
import { SessionStore } from "./state/sessionStore.js";
import { AgentOrchestrator } from "./agent/orchestrator.js";
import { StreamHub } from "./services/stream.js";
import { createLiveKitPublisherFromEnv } from "./services/livekit.js";
import { createOvershootBridgeFromEnv } from "./services/overshoot.js";
import { createLiveKitQuestionListenerFromEnv } from "./services/livekitQuestions.js";
import { createLiveKitAgentDispatcherFromEnv } from "./services/livekitAgentDispatch.js";
import { createLiveKitSessionManagerFromEnv } from "./services/livekitSession.js";

export const createApp = () => {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const httpServer = createServer(app);
  const livekitPublisher = createLiveKitPublisherFromEnv();
  const streamHub = new StreamHub(httpServer, livekitPublisher);
  const overshootBridge = createOvershootBridgeFromEnv();
  const store = new SessionStore();
  const tools = createStubTools();
  const orchestrator = new AgentOrchestrator(store, streamHub, tools);
  const livekitListener = createLiveKitQuestionListenerFromEnv((sessionId, question) =>
    orchestrator.handleQuestion(sessionId, question),
  );
  const livekitDispatcher = createLiveKitAgentDispatcherFromEnv();
  const livekitSessions = createLiveKitSessionManagerFromEnv();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  app.use(express.static(path.join(__dirname, "../public")));
  app.use("/", buildRoutes(orchestrator, overshootBridge, livekitListener, livekitDispatcher, livekitSessions));

  return { app, httpServer };
};
