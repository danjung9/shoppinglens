import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { SearchResult } from "../types.js";

const stripHtml = (html: string): string => {
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
export function createSearchTool(
  searchFunction: (query: string) => Promise<SearchResult[]>,
  options?: {
    fetchPage?: (url: string) => Promise<string>;
    geminiApiKey?: string;
    maxPages?: number;
  }
) {
  return tool(
    async ({ query }: { query: string }) => {
      try {
        const results = await searchFunction(query);
        
        // Format results as a readable string for the agent
        if (results.length === 0) {
          return "No search results found.";
        }

        let synthesizedAnswer: string | null = null;
        if (options?.fetchPage && options?.geminiApiKey) {
          const maxPages = options.maxPages ?? 3;
          const pages = await Promise.all(
            results.slice(0, maxPages).map(async (result) => {
              const html = await options.fetchPage?.(result.url);
              const text = html ? stripHtml(html).slice(0, 4000) : "";
              return {
                title: result.title,
                url: result.url,
                text,
              };
            })
          );

          const sourcesText = pages
            .map(
              (page, index) =>
                `Source ${index + 1}: ${page.title}\nURL: ${page.url}\nContent: ${page.text || "No content fetched"}`
            )
            .join("\n\n");

          const model = new ChatGoogleGenerativeAI({
            model: process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-1.5-flash",
            temperature: 0.2,
            apiKey: options.geminiApiKey,
            maxRetries: 1,
          });

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

        const formattedResults = results
          .map((result, index) => {
            return `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.snippet ? `Snippet: ${result.snippet}` : ""}`;
          })
          .join("\n\n");

        if (synthesizedAnswer) {
          return `Answer:\n${synthesizedAnswer}\n\nSources:\n${formattedResults}`;
        }

        return `Sources for "${query}":\n\n${formattedResults}`;
      } catch (error) {
        return `Error performing search: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: "search",
      description: "Search the web for information, products, or answers to questions. Use this tool when you need to find information online.",
      schema: z.object({
        query: z.string().describe("The search query string"),
      }),
    }
  );
}

/**
 * Create a ReAct agent using LangGraph with Gemini
 * Optionally enables LangSmith tracing for visualization
 */
export function createReActAgent(
  tools: ReturnType<typeof createSearchTool>[],
  geminiApiKey: string,
  options?: {
    langsmithApiKey?: string;
    langsmithProject?: string;
    enableTracing?: boolean;
  }
) {
  const envModel =
    process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-pro";

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
    llm: model as any,
    tools,
  });

  return agent;
}
