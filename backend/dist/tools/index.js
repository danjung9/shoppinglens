import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
const makePrice = (amount) => ({ amount, currency: "USD" });
const makeSpecs = (query) => [
    { key: "Material", value: "Unknown" },
    { key: "Query", value: query },
];
const stripHtml = (html) => {
    return html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};
const runGeminiSearch = async (query) => {
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
        const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const results = chunks
            .map((chunk) => {
            const url = chunk.web?.uri;
            const title = chunk.web?.title ?? url;
            if (!url || !title)
                return null;
            return { title, url };
        })
            .filter((item) => Boolean(item));
        return results;
    }
    catch {
        return [];
    }
    finally {
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
    specs: z.array(z.object({
        key: z.string(),
        value: z.string(),
    })),
});
const buildExtractionModel = (apiKey) => new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-1.5-flash",
    temperature: 0.1,
    apiKey,
    maxRetries: 1,
});
export const createAgentTools = () => {
    return {
        async searchWeb(query) {
            return runGeminiSearch(query);
        },
        async fetchPage(url) {
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
            }
            catch {
                return "";
            }
            finally {
                clearTimeout(timeout);
            }
        },
        async extractProductFields(html, sourceUrl) {
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
            }
            catch {
                return null;
            }
        },
        async compareProducts(productA, productB) {
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
            }
            catch {
                if (productA.price.amount <= productB.price.amount) {
                    return "Lower price with similar baseline specs.";
                }
                return "Higher price but could indicate premium build.";
            }
        },
        async buyItem(productId) {
            return { status: "ok", message: `Purchase flow started for ${productId}` };
        },
    };
};
export const createStubTools = () => {
    return {
        async searchWeb(query) {
            return runGeminiSearch(query);
        },
        async fetchPage(url) {
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
            }
            catch {
                return "";
            }
            finally {
                clearTimeout(timeout);
            }
        },
        async extractProductFields(_html, sourceUrl) {
            const title = `Mock Product from ${sourceUrl}`;
            return {
                title,
                image_url: "https://placehold.co/600x600",
                price: makePrice(19.99),
                specs: makeSpecs(title),
                source_url: sourceUrl,
            };
        },
        async compareProducts(productA, productB) {
            if (productA.price.amount <= productB.price.amount) {
                return "Lower price with similar baseline specs.";
            }
            return "Higher price but could indicate premium build.";
        },
        async buyItem(productId) {
            return { status: "ok", message: `Purchase flow started for ${productId}` };
        },
    };
};
