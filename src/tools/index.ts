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

export const createStubTools = (): Toolset => {
  return {
    async searchWeb(query: string) {
      return [
        {
          title: `Top result for ${query}`,
          url: `https://example.com/products/${encodeURIComponent(query)}`,
          snippet: "Mock search result for hackathon wiring.",
        },
        {
          title: `Alternative ${query} bundle`,
          url: `https://example.com/alt/${encodeURIComponent(query)}`,
          snippet: "Mock alternative listing.",
        },
        {
          title: `Comparable ${query} choice`,
          url: `https://example.com/compare/${encodeURIComponent(query)}`,
          snippet: "Mock comparison page.",
        },
      ];
    },

    async fetchPage(url: string) {
      return `<!doctype html><html><head><title>${url}</title></head><body>Mock page for ${url}</body></html>`;
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
