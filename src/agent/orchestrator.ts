import {
  AgentPayload,
  AISummaryPayload,
  ExtractedProduct,
  InfoPayload,
  PickupEvent,
  ResearchResultsPayload,
  SearchSeed,
} from "../types.js";
import { SessionStore } from "../state/sessionStore.js";
import { Toolset } from "../tools/index.js";
import { StreamHub } from "../services/stream.js";

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

const makeSummary = (product: ExtractedProduct): Pick<AISummaryPayload, "summary" | "pros" | "cons" | "best_for"> => {
  return {
    summary: `This looks like ${product.title}. Pricing starts around $${product.price.amount.toFixed(2)}.`,
    pros: ["Quick lookup", "Visible source link"],
    cons: ["Mock pricing", "Limited specs"],
    best_for: ["Fast demos", "Prototype UX"],
  };
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
    private streamHub: StreamHub,
    private tools: Toolset,
  ) {}

  async handlePickup(sessionId: string, event: PickupEvent): Promise<void> {
    const query = buildQuery(event.search_seed);
    const thread = this.store.startNewThread(sessionId, query, event.search_seed);
    await this.emit(toInfo(sessionId, "Pickup detected. Starting research.", thread.thread_id));

    const research = await this.runResearch(sessionId, thread.thread_id, query);
    await this.emit(research);

    const summaryData = makeSummary(research.top_match);
    const summary: AISummaryPayload = {
      type: "AISummary",
      session_id: sessionId,
      thread_id: thread.thread_id,
      ...summaryData,
    };
    await this.emit(summary);
  }

  async handleQuestion(sessionId: string, question: string): Promise<void> {
    const thread = this.store.getActiveThread(sessionId);
    if (!thread) {
      await this.emit(toInfo(sessionId, "No active product. Pick up an item first."));
      return;
    }

    const query = `${thread.query} ${question}`.trim();
    const research = await this.runResearch(sessionId, thread.thread_id, query);
    await this.emit(research);

    const summaryData = makeSummary(research.top_match);
    const summary: AISummaryPayload = {
      type: "AISummary",
      session_id: sessionId,
      thread_id: thread.thread_id,
      ...summaryData,
    };
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

  private async runResearch(sessionId: string, threadId: string, query: string): Promise<ResearchResultsPayload> {
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
