import { config } from "dotenv";
import { resolve } from "path";

// Load .env from root directory
config({ path: resolve(process.cwd(), "../.env") });

import { createApp } from "./app.js";

const langsmithApiKey = process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY;
const langsmithProject = process.env.LANGSMITH_PROJECT ?? process.env.LANGCHAIN_PROJECT;
if (langsmithApiKey) {
  if (!process.env.LANGCHAIN_TRACING_V2) {
    process.env.LANGCHAIN_TRACING_V2 = "true";
  }
  process.env.LANGCHAIN_API_KEY = langsmithApiKey;
  if (langsmithProject) {
    process.env.LANGCHAIN_PROJECT = langsmithProject;
  }
  console.log("LangSmith tracing enabled.");
}

const port = Number(process.env.PORT ?? 8080);
const { httpServer } = createApp();

httpServer.listen(port, () => {
  console.log(`ShoppingLens backend listening on :${port}`);
});
