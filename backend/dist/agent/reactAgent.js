import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
/**
 * Create a search tool for the ReAct agent
 * This is the first tool we're implementing
 */
export function createSearchTool(searchFunction) {
    return tool(async ({ query }) => {
        try {
            const results = await searchFunction(query);
            // Format results as a readable string for the agent
            if (results.length === 0) {
                return "No search results found.";
            }
            const formattedResults = results
                .map((result, index) => {
                return `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet ? `Snippet: ${result.snippet}` : ""}`;
            })
                .join("\n\n");
            return `Search results for "${query}":\n\n${formattedResults}`;
        }
        catch (error) {
            return `Error performing search: ${error instanceof Error ? error.message : String(error)}`;
        }
    }, {
        name: "search",
        description: "Search the web for information, products, or answers to questions. Use this tool when you need to find information online.",
        schema: z.object({
            query: z.string().describe("The search query string"),
        }),
    });
}
/**
 * Create a ReAct agent using LangGraph with Gemini
 * Optionally enables LangSmith tracing for visualization
 */
export function createReActAgent(tools, geminiApiKey, options) {
    // Initialize Gemini model
    const model = new ChatGoogleGenerativeAI({
        model: process.env.gemini_model,
        temperature: 0,
        apiKey: geminiApiKey,
    });
    // Set up LangSmith tracing if enabled
    if (options?.enableTracing && options?.langsmithApiKey) {
        // Set environment variables for LangSmith
        process.env.LANGCHAIN_TRACING_V2 = "true";
        process.env.LANGCHAIN_API_KEY = options.langsmithApiKey;
        if (options.langsmithProject) {
            process.env.LANGCHAIN_PROJECT = options.langsmithProject;
        }
        console.log(`🔍 LangSmith tracing enabled for project: ${options.langsmithProject}`);
    }
    // Create the ReAct agent
    // Note: Type assertion needed due to version compatibility between packages
    const agent = createReactAgent({
        llm: model,
        tools,
    });
    return agent;
}
