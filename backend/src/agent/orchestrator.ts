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
  // Prioritize: visible_text (actual product text) > brand + category > visual description
  const productTerms: string[] = [];
  
  // Add visible text (most important - actual text on the product)
  if (seed.visible_text && seed.visible_text.length > 0) {
    productTerms.push(...seed.visible_text);
  }
  
  // Add brand if not already in visible text
  if (seed.brand_hint && !productTerms.some(t => t.toLowerCase().includes(seed.brand_hint!.toLowerCase()))) {
    productTerms.push(seed.brand_hint);
  }
  
  // Add category for context
  if (seed.category_hint) {
    productTerms.push(seed.category_hint);
  }
  
  // Only use visual description if we have nothing else
  if (productTerms.length === 0 && seed.visual_description) {
    // Extract key product terms from description, skip generic words
    const desc = seed.visual_description.toLowerCase();
    const skipWords = ['person', 'holding', 'hand', 'someone', 'background', 'table', 'a', 'the', 'is', 'with', 'on', 'in'];
    const words = seed.visual_description.split(/\s+/).filter(w => !skipWords.includes(w.toLowerCase()) && w.length > 2);
    productTerms.push(...words.slice(0, 5));
  }
  
  if (productTerms.length === 0) return "product";
  
  // Build a clean product search query
  const query = productTerms.slice(0, 6).join(" ");
  return `${query} price`;
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
    // Filter out Google's internal URLs
    if (host.includes('google.com') || host.includes('vertexaisearch')) {
      return fallback ?? "Online Retailer";
    }
    // Extract friendly name from common retailers
    if (host.includes('amazon')) return "Amazon";
    if (host.includes('bestbuy')) return "Best Buy";
    if (host.includes('walmart')) return "Walmart";
    if (host.includes('target')) return "Target";
    if (host.includes('ebay')) return "eBay";
    if (host.includes('newegg')) return "Newegg";
    if (host.includes('bhphoto') || host.includes('b&h')) return "B&H Photo";
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
  
  // Filter out alternatives with $0 or invalid prices
  const validAlternatives = alternatives.filter(
    (alt) => alt.price.amount > 0 && Number.isFinite(alt.price.amount)
  );
  
  const competitorPrices = validAlternatives.map((alt) => ({
    site: extractSite(alt.source_url, alt.title),
    price: formatPrice(alt.price),
  }));
  const numericCompetitors = validAlternatives
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
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[ORCHESTRATOR] handlePickup started`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Event ID: ${event.event_id}`);
    console.log(`  Confidence: ${event.confidence}`);
    console.log(`  Search seed:`, JSON.stringify(event.search_seed, null, 2));
    
    const query = buildQuery(event.search_seed);
    console.log(`[ORCHESTRATOR] Built query: "${query}"`);
    
    const thread = this.store.startNewThread(sessionId, query, event.search_seed);
    console.log(`[ORCHESTRATOR] Created thread: ${thread.thread_id}`);
    
    await this.emit(toInfo(sessionId, "Pickup detected. Starting research.", thread.thread_id));
    console.log(`[ORCHESTRATOR] Emitted Info: "Pickup detected. Starting research."`);

    console.log(`[ORCHESTRATOR] Running research...`);
    const research = await this.runResearch(sessionId, thread.thread_id, query, event.search_seed);
    console.log(`[ORCHESTRATOR] Research completed. Top match: "${research.top_match.title}"`);
    console.log(`[ORCHESTRATOR] Alternatives found: ${research.alternatives.length}`);
    await this.emit(research);
    console.log(`[ORCHESTRATOR] Emitted ResearchResults`);

    console.log(`[ORCHESTRATOR] Generating shopping summary with LLM...`);
    const summary = await generateShoppingSummaryWithLLM(
      sessionId,
      thread.thread_id,
      research.top_match,
      research.alternatives,
      event.search_seed,
    );
    console.log(`[ORCHESTRATOR] Summary generated:`, JSON.stringify(summary, null, 2));
    await this.emit(summary);
    console.log(`[ORCHESTRATOR] Emitted ShoppingSummary`);
    console.log(`${"=".repeat(60)}\n`);
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
    console.log(`[RESEARCH] Starting web search for: "${query}"`);
    const searchResults = await this.tools.searchWeb(query);
    console.log(`[RESEARCH] Web search returned ${searchResults.length} results`);
    searchResults.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} - ${r.url}`);
    });
    
    const top = searchResults[0];
    let product: ExtractedProduct | null = null;

    if (top) {
      console.log(`[RESEARCH] Fetching page: ${top.url}`);
      const html = await this.tools.fetchPage(top.url);
      console.log(`[RESEARCH] Page fetched (${html.length} chars). Extracting product fields...`);
      product = await this.tools.extractProductFields(html, top.url);
      if (product) {
        console.log(`[RESEARCH] Extracted product: ${product.title} - ${formatPrice(product.price)}`);
      } else {
        console.log(`[RESEARCH] Failed to extract product fields`);
      }
    } else {
      console.log(`[RESEARCH] No search results found!`);
    }

    const fallbackProduct: ExtractedProduct = {
      title: top?.title ?? `Result for ${query}`,
      image_url: "https://placehold.co/600x600",
      price: { amount: 0, currency: "USD" },
      specs: [],
      source_url: top?.url ?? "https://example.com/unknown",
    };

    const topMatch = product ?? fallbackProduct;
    console.log(`[RESEARCH] Top match: "${topMatch.title}" @ ${formatPrice(topMatch.price)}`);

    console.log(`[RESEARCH] Processing ${Math.min(searchResults.length - 1, 3)} alternatives...`);
    const alternatives = await Promise.all(
      searchResults.slice(1, 4).map(async (result) => {
        // Fetch and extract real price from each competitor page
        let altProduct: ExtractedProduct | null = null;
        try {
          const altHtml = await this.tools.fetchPage(result.url);
          if (altHtml) {
            altProduct = await this.tools.extractProductFields(altHtml, result.url);
            console.log(`[RESEARCH] Alternative "${result.title.slice(0, 40)}..." price: $${altProduct?.price.amount ?? 'N/A'}`);
          }
        } catch (err) {
          console.log(`[RESEARCH] Failed to fetch alternative: ${result.url}`);
        }
        
        const altPrice = altProduct?.price ?? { amount: 0, currency: "USD" };
        const reason = topMatch && altProduct ? await this.tools.compareProducts(topMatch, altProduct) : "Alternative product";
        
        return {
          title: altProduct?.title ?? result.title,
          price: altPrice,
          image_url: altProduct?.image_url ?? "https://placehold.co/300x300",
          reason,
          source_url: result.url,
        };
      }),
    );
    console.log(`[RESEARCH] Alternatives processed: ${alternatives.length}`);

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
