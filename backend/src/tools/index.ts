import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { ExtractedProduct, Price, ProductSpec, SearchResult } from "../types.js";

export type Toolset = {
  searchWeb: (query: string) => Promise<SearchResult[]>;
  fetchPage: (url: string) => Promise<string>;
  extractProductFields: (html: string, sourceUrl: string) => Promise<ExtractedProduct | null>;
  compareProducts: (productA: ExtractedProduct, productB: ExtractedProduct) => Promise<string>;
  buyItem?: (productId: string) => Promise<{ status: "ok" | "failed"; message: string }>;
};

const makePrice = (amount: number): Price => ({ amount, currency: "USD" });

const makeSpecs = (query: string): ProductSpec[] => [
  { key: "Material", value: "Unknown" },
  { key: "Query", value: query },
];

const stripHtml = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

type GeminiSearchChunk = {
  web?: {
    uri?: string;
    title?: string;
  };
};

const runGeminiSearch = async (query: string): Promise<SearchResult[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[SEARCH] ERROR: GEMINI_API_KEY not set in environment!");
    return [];
  }

  const model = process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  console.log(`[SEARCH] Using model: ${model}`);
  console.log(`[SEARCH] Query: "${query.slice(0, 100)}..."`);
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Search for "${query}" prices on shopping sites like Amazon, Best Buy, Walmart, Target, B&H Photo, Newegg. Find product listings with prices.`,
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[SEARCH] API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    console.log(`[SEARCH] API response received`);
    
    // Log the grounding metadata structure to understand the response
    const groundingMetadata = data?.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata) {
      console.log(`[SEARCH] Grounding metadata keys:`, Object.keys(groundingMetadata));
      // Check for search entry point which has real URLs
      if (groundingMetadata.searchEntryPoint?.renderedContent) {
        console.log(`[SEARCH] Has searchEntryPoint with rendered content`);
      }
    }
    
    const chunks: GeminiSearchChunk[] = groundingMetadata?.groundingChunks ?? [];
    console.log(`[SEARCH] Grounding chunks found: ${chunks.length}`);
    
    // Log first chunk to see URL structure
    if (chunks.length > 0) {
      console.log(`[SEARCH] First chunk URL: ${chunks[0]?.web?.uri}`);
    }

    const results = chunks
      .map((chunk: GeminiSearchChunk) => {
        const url = chunk.web?.uri;
        const title = chunk.web?.title ?? url;
        if (!url || !title) return null;
        return { title, url } satisfies SearchResult;
      })
      .filter((item: SearchResult | null): item is SearchResult => Boolean(item));

    console.log(`[SEARCH] Final results: ${results.length}`);
    return results;
  } catch (error) {
    console.log(`[SEARCH] Exception:`, error);
    return [];
  } finally {
    clearTimeout(timeout);
  }
};

const ExtractedProductSchema = z.object({
  title: z.string(),
  image_url: z.string().optional().default(""),
  price: z.object({
    amount: z.number(),
    currency: z.string().default("USD"),
  }),
  specs: z.array(
    z.object({
      key: z.string(),
      value: z.string(),
    })
  ),
});

const buildExtractionModel = (apiKey: string) =>
  new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-1.5-flash",
    temperature: 0.1,
    apiKey,
    maxRetries: 1,
  });

export const createAgentTools = (): Toolset => {
  return {
    async searchWeb(query: string) {
      return runGeminiSearch(query);
    },

    async fetchPage(url: string) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "shoppinglens-bot/1.0",
          },
        });
        if (!response.ok) {
          return "";
        }
        return await response.text();
      } catch {
        return "";
      } finally {
        clearTimeout(timeout);
      }
    },

    async extractProductFields(html: string, sourceUrl: string) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return null;
      }

      const text = stripHtml(html).slice(0, 4000);
      if (!text) {
        return null;
      }

      try {
        const model = buildExtractionModel(apiKey).withStructuredOutput(ExtractedProductSchema, {
          name: "extracted_product",
        });
        const prompt = `Extract the primary product details from the content below.
Return title, image_url if present, price (numeric amount + currency), and key specs.
If price is missing, set amount to 0 and currency to USD.

URL: ${sourceUrl}

Content:
${text}`;

        const extracted = await model.invoke([new HumanMessage(prompt)]);
        return {
          ...extracted,
          image_url: extracted.image_url || "https://placehold.co/600x600",
          source_url: sourceUrl,
        };
      } catch {
        return null;
      }
    },

    async compareProducts(productA: ExtractedProduct, productB: ExtractedProduct) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        if (productA.price.amount <= productB.price.amount) {
          return "Lower price with similar baseline specs.";
        }
        return "Higher price but could indicate premium build.";
      }

      try {
        const model = buildExtractionModel(apiKey);
        const prompt = `Compare these two products and explain in 1-2 sentences why the alternative might be better or worse.

Product A: ${productA.title} ($${productA.price.amount} ${productA.price.currency})
Product B: ${productB.title} ($${productB.price.amount} ${productB.price.currency})

Focus on price and any obvious differences in title.`;
        const response = await model.invoke([new HumanMessage(prompt)]);
        return typeof response.content === "string"
          ? response.content.trim()
          : JSON.stringify(response.content);
      } catch {
        if (productA.price.amount <= productB.price.amount) {
          return "Lower price with similar baseline specs.";
        }
        return "Higher price but could indicate premium build.";
      }
    },

    async buyItem(productId: string) {
      return { status: "ok", message: `Purchase flow started for ${productId}` };
    },
  };
};

export const createStubTools = (): Toolset => {
  return {
    async searchWeb(query: string) {
      return runGeminiSearch(query);
    },

    async fetchPage(url: string) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "shoppinglens-bot/1.0",
          },
        });
        if (!response.ok) {
          return "";
        }
        return await response.text();
      } catch {
        return "";
      } finally {
        clearTimeout(timeout);
      }
    },

    async extractProductFields(_html: string, sourceUrl: string) {
      const title = `Mock Product from ${sourceUrl}`;
      return {
        title,
        image_url: "https://placehold.co/600x600",
        price: makePrice(19.99),
        specs: makeSpecs(title),
        source_url: sourceUrl,
      };
    },

    async compareProducts(productA: ExtractedProduct, productB: ExtractedProduct) {
      if (productA.price.amount <= productB.price.amount) {
        return "Lower price with similar baseline specs.";
      }
      return "Higher price but could indicate premium build.";
    },

    async buyItem(productId: string) {
      return { status: "ok", message: `Purchase flow started for ${productId}` };
    },
  };
};
