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

type GeminiSearchChunk = {
  web?: {
    uri?: string;
    title?: string;
  };
};

const runGeminiSearch = async (query: string): Promise<SearchResult[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return [];
  }

  const model = process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-1.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
                text: `Search the web for: ${query}. Return sources with titles and URLs.`,
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
      return [];
    }

    const data = await response.json();
    const chunks: GeminiSearchChunk[] =
      data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    const results = chunks
      .map((chunk: GeminiSearchChunk) => {
        const url = chunk.web?.uri;
        const title = chunk.web?.title ?? url;
        if (!url || !title) return null;
        return { title, url } satisfies SearchResult;
      })
      .filter((item: SearchResult | null): item is SearchResult => Boolean(item));

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
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
