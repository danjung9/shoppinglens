import { config } from "dotenv";
import { resolve } from "path";
import { createReActAgent, createSearchTool } from "./reactAgent.js";
import { createStubTools } from "../tools/index.js";
import { HumanMessage } from "@langchain/core/messages";
// Load .env from root directory
config({ path: resolve(process.cwd(), "../.env") });
/**
 * Test script to run the ReAct agent and visualize the graph architecture
 */
async function main() {
    console.log("🚀 Starting ReAct Agent Test\n");
    // Get Gemini API key from environment
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required");
    }
    // Get LangSmith credentials (optional but recommended for visualization)
    const langsmithApiKey = process.env.LANGSMITH_API_KEY;
    const langsmithProject = process.env.LANGSMITH_PROJECT || "shoppinglens-react-agent";
    console.log("📦 Setting up agent...");
    const resolvedModel = process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-pro";
    console.log("🔑 GEMINI_MODEL resolved:", resolvedModel);
    if (resolvedModel.startsWith("gemini-2.5")) {
        console.log("⚠️  gemini-2.5 models may not be available in your API tier yet. Try gemini-1.5-flash or gemini-pro if this hangs.");
    }
    // Create the search tools using the existing stub tools
    const stubTools = createStubTools();
    const searchTool = createSearchTool(stubTools.searchWeb, {
        fetchPage: stubTools.fetchPage,
        geminiApiKey,
    });
    const structuredSearchTool = createSearchTool(stubTools.searchWeb, {
        fetchPage: stubTools.fetchPage,
        geminiApiKey,
        structuredOutput: true,
        toolName: "search_structured",
    });
    // Create the ReAct agent with the search tool and LangSmith tracing
    const agent = createReActAgent([searchTool], geminiApiKey, {
        langsmithApiKey,
        langsmithProject,
        enableTracing: !!langsmithApiKey,
    });
    const structuredAgent = createReActAgent([structuredSearchTool], geminiApiKey, {
        langsmithApiKey,
        langsmithProject,
        enableTracing: !!langsmithApiKey,
    });
    if (langsmithApiKey) {
        console.log(`🔍 LangSmith Dashboard: https://smith.langchain.com/projects/${langsmithProject}\n`);
    }
    // Test queries
    const testQueries = [
        "What are the best wireless headphones under $100?",
        "Search for iPhone 15 Pro Max pricing",
    ];
    const structuredQuery = "Find the latest price and competitor prices for Sony WH-1000XM5 and return a structured shopping summary.";
    for (const query of testQueries) {
        console.log("=".repeat(60));
        console.log(`\n🤖 Agent Query: ${query}\n`);
        console.log("Processing...\n");
        try {
            const startTime = Date.now();
            // Invoke the agent with proper message format
            const result = await agent.invoke({
                messages: [new HumanMessage(query)],
            });
            const duration = Date.now() - startTime;
            console.log("📝 Agent Response:");
            // The result should contain messages array with the final response
            const lastMessage = result.messages[result.messages.length - 1];
            const response = typeof lastMessage.content === "string"
                ? lastMessage.content
                : JSON.stringify(lastMessage.content, null, 2);
            console.log(response);
            console.log(`\n⏱️  Execution time: ${duration}ms`);
            console.log(`📊 Total messages in conversation: ${result.messages.length}`);
            // Show tool calls if any
            const toolCalls = result.messages.filter(msg => {
                const hasToolCalls = msg.tool_calls ||
                    msg.additional_kwargs?.tool_calls;
                return hasToolCalls;
            });
            if (toolCalls.length > 0) {
                console.log(`🔧 Tool calls made: ${toolCalls.length}`);
            }
            if (langsmithApiKey) {
                console.log(`\n🔍 View full trace in LangSmith: https://smith.langchain.com/projects/${langsmithProject}`);
            }
            console.log("\n✅ Agent execution completed!\n");
        }
        catch (error) {
            console.error("❌ Error running agent:", error);
            if (error instanceof Error) {
                console.error("Error details:", error.message);
                if (error.stack) {
                    console.error("Stack:", error.stack);
                }
            }
        }
    }
    console.log("=".repeat(60));
    console.log(`\n🤖 Structured Output Query: ${structuredQuery}\n`);
    console.log("Processing structured output...\n");
    try {
        const startTime = Date.now();
        const result = await structuredAgent.invoke({
            messages: [
                new HumanMessage(`Use the search_structured tool. Return only the JSON response from that tool.\n\n${structuredQuery}`),
            ],
        });
        const duration = Date.now() - startTime;
        const lastMessage = result.messages[result.messages.length - 1];
        const response = typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(lastMessage.content, null, 2);
        console.log("🧾 Structured JSON Response (agent):");
        console.log(response);
        console.log(`\n⏱️  Execution time: ${duration}ms`);
        console.log(`📊 Total messages in conversation: ${result.messages.length}`);
    }
    catch (error) {
        console.error("❌ Error running structured agent:", error);
        if (error instanceof Error) {
            console.error("Error details:", error.message);
            if (error.stack) {
                console.error("Stack:", error.stack);
            }
        }
    }
    console.log("\n🔎 Direct structured tool call (bypassing agent):\n");
    try {
        const startTime = Date.now();
        const toolResult = await structuredSearchTool.invoke({ query: structuredQuery });
        const duration = Date.now() - startTime;
        console.log("🧾 Structured JSON Response (tool):");
        console.log(toolResult);
        console.log(`\n⏱️  Execution time: ${duration}ms`);
    }
    catch (error) {
        console.error("❌ Error running structured tool:", error);
        if (error instanceof Error) {
            console.error("Error details:", error.message);
            if (error.stack) {
                console.error("Stack:", error.stack);
            }
        }
    }
    console.log("\n" + "=".repeat(60));
    console.log("\n🎉 Test completed!");
    if (langsmithApiKey) {
        console.log(`\n📊 View all traces: https://smith.langchain.com/projects/${langsmithProject}`);
        console.log("   You can see the full graph architecture, tool calls, and reasoning steps there!");
    }
}
// Run the test
main().catch(console.error);
