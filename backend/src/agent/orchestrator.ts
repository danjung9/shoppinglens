import {
  AgentPayload,
  ShoppingSummaryPayload,
  ExtractedProduct,
  InfoPayload,
  PickupEvent,
  ResearchResultsPayload,
  SearchSeed,
} from "../types.js";
import { SessionStore } from "../state/sessionStore.js";
import { Toolset } from "../tools/index.js";
import { StreamPublisher } from "../services/stream.js";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";

const buildQuery = (seed: SearchSeed): string => {
  const parts = [
    ...(seed.visible_text ?? []),
    seed.brand_hint,
    seed.category_hint,
    seed.visual_description,
  ].filter((value): value is string => Boolean(value && value.trim()));
  if (parts.length === 0) return "unknown product";
  return parts.join(" ");
};

const formatPrice = (price: ExtractedProduct["price"]): string => {
  if (!price || Number.isNaN(price.amount)) return "Unknown";
  return `$${price.amount.toFixed(2)}`;
};

const extractBrand = (title: string, seed?: SearchSeed): string => {
  if (seed?.brand_hint) return seed.brand_hint;
  const firstToken = title.split(" ")[0];
  return firstToken || "Unknown";
};

const extractSite = (url?: string, fallback?: string): string => {
  if (!url) return fallback ?? "Unknown";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || fallback || "Unknown";
  } catch {
    return fallback ?? "Unknown";
  }
};

const computeValueScore = (detected: number, competitors: number[]): ShoppingSummaryPayload["valueScore"] => {
  if (!Number.isFinite(detected) || competitors.length === 0) return "hold";
  const avg = competitors.reduce((sum, price) => sum + price, 0) / competitors.length;
  if (detected <= avg * 0.98) return "buy";
  if (detected <= avg * 1.05) return "hold";
  return "avoid";
};

const makeShoppingSummary = (
  sessionId: string,
  threadId: string,
  product: ExtractedProduct,
  alternatives: ResearchResultsPayload["alternatives"],
  seed?: SearchSeed,
): ShoppingSummaryPayload => {
  const detectedPrice = formatPrice(product.price);
  const competitorPrices = alternatives.map((alt) => ({
    site: extractSite(alt.source_url, alt.title),
    price: formatPrice(alt.price),
  }));
  const numericCompetitors = alternatives
    .map((alt) => alt.price.amount)
    .filter((amount) => Number.isFinite(amount));
  const valueScore = computeValueScore(product.price.amount, numericCompetitors);
  const isCompatible = false;
  const compatibilityNote = "Compatibility not assessed with current sources.";

  const insightBase =
    competitorPrices.length > 0
      ? `Compared ${competitorPrices.length} competitor prices; current price is ${detectedPrice}.`
      : "Limited competitor pricing data available.";
  const aiInsight = `${insightBase} Value score: ${valueScore}.`;

  return {
    type: "ShoppingSummary",
    session_id: sessionId,
    thread_id: threadId,
    productName: product.title,
    brand: extractBrand(product.title, seed),
    detectedPrice,
    competitors: competitorPrices,
    isCompatible,
    compatibilityNote,
    valueScore,
    aiInsight,
  };
};

const parseStructuredSummary = (
  raw: string,
  sessionId: string,
  threadId: string,
  fallback: ShoppingSummaryPayload,
): ShoppingSummaryPayload => {
  try {
    const parsed = JSON.parse(raw);
    const normalized: ShoppingSummaryPayload = {
      type: "ShoppingSummary",
      session_id: sessionId,
      thread_id: threadId,
      productName: String(parsed.productName ?? fallback.productName),
      brand: String(parsed.brand ?? fallback.brand),
      detectedPrice: String(parsed.detectedPrice ?? fallback.detectedPrice),
      competitors: Array.isArray(parsed.competitors)
        ? parsed.competitors.map((item: any) => ({
            site: String(item?.site ?? "Unknown"),
            price: String(item?.price ?? "Unknown"),
          }))
        : fallback.competitors,
      isCompatible:
        typeof parsed.isCompatible === "boolean"
          ? parsed.isCompatible
          : fallback.isCompatible,
      compatibilityNote: String(parsed.compatibilityNote ?? fallback.compatibilityNote),
      valueScore:
        parsed.valueScore === "buy" || parsed.valueScore === "hold" || parsed.valueScore === "avoid"
          ? parsed.valueScore
          : fallback.valueScore,
      aiInsight: String(parsed.aiInsight ?? fallback.aiInsight),
    };
    return normalized;
  } catch {
    return fallback;
  }
};

const generateShoppingSummaryWithLLM = async (
  sessionId: string,
  threadId: string,
  product: ExtractedProduct,
  alternatives: ResearchResultsPayload["alternatives"],
  seed?: SearchSeed,
): Promise<ShoppingSummaryPayload> => {
  const fallback = makeShoppingSummary(sessionId, threadId, product, alternatives, seed);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL || process.env.gemini_model || "gemini-1.5-flash",
    temperature: 0.2,
    apiKey,
    maxRetries: 1,
  });

  const altLines = alternatives
    .map((alt, index) => {
      return `${index + 1}. ${alt.title} | ${alt.price.amount} ${alt.price.currency} | ${alt.source_url ?? "unknown"}`;
    })
    .join("\n");

  const prompt = `You are preparing a structured shopping summary. Output ONLY valid JSON with these keys:
productName, brand, detectedPrice, competitors, isCompatible, compatibilityNote, valueScore, aiInsight.

Rules:
- competitors is an array of objects: { "site": string, "price": string }
- valueScore must be one of: "buy", "hold", "avoid"
- detectedPrice must be a string like "$123.45"
- If you are uncertain, keep fields conservative and say so in aiInsight.

Product:
Title: ${product.title}
Price: ${product.price.amount} ${product.price.currency}
Source: ${product.source_url}
Brand hint: ${seed?.brand_hint ?? "none"}
Category hint: ${seed?.category_hint ?? "none"}

Alternatives:
${altLines || "none"}

Return ONLY JSON.`;

  const response = await model.invoke([new HumanMessage(prompt)]);
  const content =
    typeof response.content === "string"
      ? response.content.trim()
      : JSON.stringify(response.content);

  return parseStructuredSummary(content, sessionId, threadId, fallback);
};

const toInfo = (sessionId: string, message: string, threadId?: string): InfoPayload => ({
  type: "Info",
  session_id: sessionId,
  thread_id: threadId,
  message,
});

export class AgentOrchestrator {
  constructor(
    private store: SessionStore,
    private streamHub: StreamPublisher,
    private tools: Toolset,
  ) {}

  async handlePickup(sessionId: string, event: PickupEvent): Promise<void> {
    const query = buildQuery(event.search_seed);
    const thread = this.store.startNewThread(sessionId, query, event.search_seed);
    await this.emit(toInfo(sessionId, "Pickup detected. Starting research.", thread.thread_id));

    const research = await this.runResearch(sessionId, thread.thread_id, query, event.search_seed);
    await this.emit(research);

    const summary = await generateShoppingSummaryWithLLM(
      sessionId,
      thread.thread_id,
      research.top_match,
      research.alternatives,
      event.search_seed,
    );
    await this.emit(summary);
  }

  async handleQuestion(sessionId: string, question: string): Promise<void> {
    const thread = this.store.getActiveThread(sessionId);
    if (!thread) {
      const query = question.trim();
      const newThread = this.store.startNewThread(sessionId, query, undefined);
      await this.emit(toInfo(sessionId, "Starting research from your question.", newThread.thread_id));

      const research = await this.runResearch(sessionId, newThread.thread_id, query, undefined);
      await this.emit(research);

      const summary = await generateShoppingSummaryWithLLM(
        sessionId,
        newThread.thread_id,
        research.top_match,
        research.alternatives,
        undefined,
      );
      await this.emit(summary);
      return;
    }

    const query = `${thread.query} ${question}`.trim();
    const research = await this.runResearch(sessionId, thread.thread_id, query, thread.search_seed);
    await this.emit(research);

    const summary = await generateShoppingSummaryWithLLM(
      sessionId,
      thread.thread_id,
      research.top_match,
      research.alternatives,
      thread.search_seed,
    );
    await this.emit(summary);
  }

  async handleEnd(sessionId: string): Promise<void> {
    await this.emit(toInfo(sessionId, "Session ended."));
    this.store.endSession(sessionId);
  }

  async handleBuy(sessionId: string, productId: string): Promise<void> {
    const thread = this.store.getActiveThread(sessionId);
    if (!thread) {
      await this.emit(toInfo(sessionId, "No active product to purchase."));
      return;
    }

    if (!this.tools.buyItem) {
      await this.emit(toInfo(sessionId, "buy_item tool not configured.", thread.thread_id));
      return;
    }

    const result = await this.tools.buyItem(productId);
    await this.emit(toInfo(sessionId, result.message, thread.thread_id));
  }

  private async runResearch(
    sessionId: string,
    threadId: string,
    query: string,
    searchSeed?: SearchSeed,
  ): Promise<ResearchResultsPayload> {
    const searchResults = await this.tools.searchWeb(query);
    const top = searchResults[0];
    let product: ExtractedProduct | null = null;

    if (top) {
      const html = await this.tools.fetchPage(top.url);
      product = await this.tools.extractProductFields(html, top.url);
    }

    const fallbackProduct: ExtractedProduct = {
      title: top?.title ?? `Result for ${query}`,
      image_url: "https://placehold.co/600x600",
      price: { amount: 0, currency: "USD" },
      specs: [],
      source_url: top?.url ?? "https://example.com/unknown",
    };

    const topMatch = product ?? fallbackProduct;

    const alternatives = await Promise.all(
      searchResults.slice(1, 4).map(async (result) => {
        const reason = topMatch ? await this.tools.compareProducts(topMatch, {
          title: result.title,
          image_url: "https://placehold.co/300x300",
          price: { amount: 29.99, currency: "USD" },
          specs: [],
          source_url: result.url,
        }) : "Alternative match";
        return {
          title: result.title,
          price: { amount: 29.99, currency: "USD" },
          image_url: "https://placehold.co/300x300",
          reason,
          source_url: result.url,
        };
      }),
    );

    const payload: ResearchResultsPayload = {
      type: "ResearchResults",
      session_id: sessionId,
      thread_id: threadId,
      query,
      top_match: topMatch,
      alternatives,
    };

    return payload;
  }

  private async emit(payload: AgentPayload): Promise<void> {
    this.streamHub.broadcast(payload.session_id, payload);
    if (payload.thread_id) {
      this.store.appendMessage(payload.session_id, payload.thread_id, payload);
    }
  }
}
