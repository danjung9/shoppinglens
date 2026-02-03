export type SearchSeed = {
  visible_text: string[];
  brand_hint?: string;
  category_hint?: string;
  visual_description?: string;
};

export type PickupEvent = {
  event_id: string;
  event_type: "PICKUP_DETECTED";
  confidence: number;
  frame_ref: string;
  search_seed: SearchSeed;
};

export type Price = {
  amount: number;
  currency: "USD" | string;
};

export type ProductSpec = {
  key: string;
  value: string;
};

export type ResearchResultsPayload = {
  type: "ResearchResults";
  session_id: string;
  thread_id: string;
  query: string;
  top_match: {
    title: string;
    image_url: string;
    price: Price;
    specs: ProductSpec[];
    source_url: string;
  };
  alternatives: {
    title: string;
    price: Price;
    image_url: string;
    reason: string;
    source_url?: string;
  }[];
};

export type CompetitorPrice = {
  site: string;
  price: string;
};

export type ValueScore = "buy" | "hold" | "avoid";

export type ShoppingSummaryPayload = {
  type: "ShoppingSummary";
  session_id: string;
  thread_id: string;
  productName: string;
  brand: string;
  detectedPrice: string;
  competitors: CompetitorPrice[];
  isCompatible: boolean;
  compatibilityNote: string;
  valueScore: ValueScore;
  aiInsight: string;
};

export type AISummaryPayload = {
  type: "AISummary";
  session_id: string;
  thread_id: string;
  summary: string;
  pros: string[];
  cons: string[];
  best_for: string[];
};

export type InfoPayload = {
  type: "Info";
  session_id: string;
  thread_id?: string;
  message: string;
};

export type AgentPayload =
  | ResearchResultsPayload
  | ShoppingSummaryPayload
  | AISummaryPayload
  | InfoPayload;

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export type ExtractedProduct = {
  title: string;
  image_url: string;
  price: Price;
  specs: ProductSpec[];
  source_url: string;
};

export type ThreadState = {
  thread_id: string;
  query: string;
  search_seed?: SearchSeed;
  messages: AgentPayload[];
  created_at: string;
};

export type SessionState = {
  session_id: string;
  active_thread_id?: string;
  threads: Map<string, ThreadState>;
  created_at: string;
};
