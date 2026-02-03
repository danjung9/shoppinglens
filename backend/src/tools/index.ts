import { ExtractedProduct, Price, ProductSpec, SearchResult } from "../types.js";
import { searchWeb as searchWebFree } from "./webSearch.js";

export type Toolset = {
  searchWeb: (query: string) => Promise<SearchResult[]>;
  fetchPage: (url: string) => Promise<string>;
  extractProductFields: (html: string, sourceUrl: string) => Promise<ExtractedProduct | null>;
  compareProducts: (productA: ExtractedProduct, productB: ExtractedProduct) => Promise<string>;
  buyItem?: (productId: string) => Promise<{ status: "ok" | "failed"; message: string }>;
};

const makePrice = (amount: number): Price => ({ amount, currency: "USD" });

const DEFAULT_PAGE_TIMEOUT_MS = 8000;
const pageTimeoutMs = Number.parseInt(process.env.PAGE_FETCH_TIMEOUT_MS ?? "", 10);
const pageFetchTimeoutMs =
  Number.isFinite(pageTimeoutMs) && pageTimeoutMs > 0 ? pageTimeoutMs : DEFAULT_PAGE_TIMEOUT_MS;
const userAgent = process.env.SEARCH_USER_AGENT ?? "ShoppingLensBot/0.1 (+https://shoppinglens.local)";

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pageFetchTimeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const makeSpecs = (query: string): ProductSpec[] => [
  { key: "Material", value: "Unknown" },
  { key: "Query", value: query },
];

export const createTools = (): Toolset => {
  return {
    async searchWeb(query: string) {
      return searchWebFree(query);
    },

    async fetchPage(url: string) {
      const response = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
      }
      return response.text();
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

export const createStubTools = createTools;
