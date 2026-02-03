import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
export const ShoppingDataSchema = z.object({
    productName: z.string(),
    brand: z.string(),
    detectedPrice: z.string(),
    competitors: z.array(z.object({
        site: z.string(),
        price: z.string(),
    })),
    isCompatible: z.boolean(),
    compatibilityNote: z.string(),
    valueScore: z.enum(["buy", "hold", "avoid"]),
    aiInsight: z.string(),
});
const stripHtml = (html) => {
    return html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};
/**
 * Create a search tool for the ReAct agent
 * This is the first tool we're implementing
 */
export function createSearchTool(searchFunction, options) {
    const wantsStructured = options?.structuredOutput ?? true;
    return tool(async ({ query }) => {
        try {
            const results = await searchFunction(query);
            // Format results as a readable string for the agent
            if (results.length === 0) {
                return "No search results found.";
            }
            let synthesizedAnswer = null;
            if (options?.fetchPage && options?.geminiApiKey) {
                const maxPages = options.maxPages ?? 3;
                const pages = await Promise.all(results.slice(0, maxPages).map(async (result) => {
                    const html = await options.fetchPage?.(result.url);
                    const text = html ? stripHtml(html).slice(0, 4000) : "";
                    return {
                        title: result.title,
                        url: result.url,
                        text,
                    };
                }));
                const sourcesText = pages
                    .map((page, index) => `Source ${index + 1}: ${page.title}\nURL: ${page.url}\nContent: ${page.text || "No content fetched"}`)
                    .join("\n\n");
                const model = new ChatGoogleGenerativeAI({
                    model: process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-1.5-flash",
                    temperature: 0.2,
                    apiKey: options.geminiApiKey,
                    maxRetries: 1,
                });
                if (wantsStructured) {
                    const structuredModel = model.withStructuredOutput(ShoppingDataSchema, {
                        name: "shopping_data",
                    });
                    const structuredPrompt = `You are generating a structured shopping summary.
Use ONLY the sources below. If data is missing, make conservative assumptions and mention uncertainty in aiInsight.

Return fields:
- productName
- brand
- detectedPrice (string like "$123.45")
- competitors (array of { site, price })
- isCompatible (boolean)
- compatibilityNote
- valueScore ("buy" | "hold" | "avoid")
- aiInsight

Question: ${query}

${sourcesText}`;
                    const structured = await structuredModel.invoke([new HumanMessage(structuredPrompt)]);
                    synthesizedAnswer = JSON.stringify(structured, null, 2);
                }
                else {
                    const prompt = `Answer the question using ONLY the sources below. If the sources don't contain the answer, say so.

Question: ${query}

${sourcesText}

Respond in 2-4 sentences. Include citations as [1], [2], etc.`;
                    const response = await model.invoke([new HumanMessage(prompt)]);
                    synthesizedAnswer =
                        typeof response.content === "string"
                            ? response.content
                            : JSON.stringify(response.content);
                }
            }
            else if (wantsStructured) {
                const fallback = {
                    productName: query,
                    brand: "Unknown",
                    detectedPrice: "Unknown",
                    competitors: results.slice(0, 5).map((result) => ({
                        site: result.title,
                        price: "Unknown",
                    })),
                    isCompatible: false,
                    compatibilityNote: "Compatibility not assessed.",
                    valueScore: "hold",
                    aiInsight: "Structured output generated without page fetch or LLM.",
                };
                synthesizedAnswer = JSON.stringify(fallback, null, 2);
            }
            const formattedResults = results
                .map((result, index) => {
                return `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet ? `Snippet: ${result.snippet}` : ""}`;
            })
                .join("\n\n");
            if (synthesizedAnswer) {
                if (wantsStructured) {
                    return synthesizedAnswer;
                }
                return `Answer:\n${synthesizedAnswer}\n\nSources:\n${formattedResults}`;
            }
            return `Sources for "${query}":\n\n${formattedResults}`;
        }
        catch (error) {
            return `Error performing search: ${error instanceof Error ? error.message : String(error)}`;
        }
    }, {
        name: options?.toolName ?? "search",
        description: "Search the web for information, products, or answers to questions. Use this tool when you need to find information online.",
        schema: z.object({
            query: z.string().describe("The search query string"),
        }),
        returnDirect: wantsStructured,
    });
}
/**
 * Create a ReAct agent using LangGraph with Gemini
 * Optionally enables LangSmith tracing for visualization
 */
export function createReActAgent(tools, geminiApiKey, options) {
    const envModel = process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-pro";
    // Initialize Gemini model
    // Use gemini-pro as default (or gemini-1.5-flash for faster responses)
    const model = new ChatGoogleGenerativeAI({
        model: envModel,
        temperature: 0,
        apiKey: geminiApiKey,
        maxRetries: 2,
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
