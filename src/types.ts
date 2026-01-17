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
  }[];
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

export type AgentPayload = ResearchResultsPayload | AISummaryPayload | InfoPayload;

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
