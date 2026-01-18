import { config } from "dotenv";
import { resolve } from "path";
import { createReActAgent, createSearchTool } from "./reactAgent.js";
import { createStubTools } from "../tools/index.js";
import { HumanMessage } from "@langchain/core/messages";

// Load .env from root directory
config({ path: resolve(process.cwd(), "../.env") });

/**
 * Example usage of the ReAct agent with search tool
 */
async function main() {
  // Get Gemini API key from environment
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  // Get LangSmith credentials (optional)
  const langsmithApiKey = process.env.LANGSMITH_API_KEY;
  const langsmithProject = process.env.LANGSMITH_PROJECT || "shoppinglens-react-agent";

  // Create the search tool using the existing stub tools
  const stubTools = createStubTools();
  const searchTool = createSearchTool(stubTools.searchWeb);

  // Create the ReAct agent with the search tool and LangSmith tracing
  const agent = createReActAgent([searchTool], geminiApiKey, {
    langsmithApiKey,
    langsmithProject,
    enableTracing: !!langsmithApiKey,
  });

  if (langsmithApiKey) {
    console.log(`🔍 LangSmith tracing enabled! View at: https://smith.langchain.com/projects/${langsmithProject}\n`);
  }

  // Example query
  const query = "What are the best wireless headphones under $100?";

  console.log(`\n🤖 Agent Query: ${query}\n`);
  console.log("Processing...\n");

  try {
    // Invoke the agent with proper message format
    const result = await agent.invoke({
      messages: [new HumanMessage(query)],
    });

    console.log("📝 Agent Response:");
    // The result should contain messages array with the final response
    const lastMessage = result.messages[result.messages.length - 1];
    console.log(typeof lastMessage.content === "string" 
      ? lastMessage.content 
      : JSON.stringify(lastMessage.content, null, 2));
    console.log("\n✅ Agent execution completed!");
  } catch (error) {
    console.error("❌ Error running agent:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
