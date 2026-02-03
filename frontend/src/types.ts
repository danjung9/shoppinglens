<<<<<<< HEAD
=======
// Types matching backend payload structures

>>>>>>> origin/srinivas/final
export interface Competitor {
  site: string;
  price: string;
}

export interface ShoppingData {
  productName: string;
  brand: string;
  detectedPrice: string;
  competitors: Competitor[];
  isCompatible: boolean;
  compatibilityNote: string;
  valueScore: 'buy' | 'wait';
  aiInsight: string;
}

<<<<<<< HEAD
=======
export interface Price {
  amount: number;
  currency: string;
}

export interface ProductSpec {
  key: string;
  value: string;
}

export interface TopMatch {
  title: string;
  image_url: string;
  price: Price;
  specs: ProductSpec[];
  source_url: string;
}

export interface Alternative {
  title: string;
  price: Price;
  image_url: string;
  reason: string;
  source_url?: string;
}

// Backend payload types
export interface ResearchResultsPayload {
  type: 'ResearchResults';
  session_id: string;
  thread_id: string;
  query: string;
  top_match: TopMatch;
  alternatives: Alternative[];
}

export interface ShoppingSummaryPayload {
  type: 'ShoppingSummary';
  session_id: string;
  thread_id: string;
  productName: string;
  brand: string;
  detectedPrice: string;
  competitors: Competitor[];
  isCompatible: boolean;
  compatibilityNote: string;
  valueScore: 'buy' | 'hold' | 'avoid';
  aiInsight: string;
}

export interface InfoPayload {
  type: 'Info';
  session_id: string;
  thread_id?: string;
  message: string;
}

export type AgentPayload = ResearchResultsPayload | ShoppingSummaryPayload | InfoPayload;

export interface SearchSeed {
  visible_text: string[];
  brand_hint?: string;
  category_hint?: string;
  visual_description?: string;
}

export interface PickupEvent {
  event_id: string;
  event_type: 'PICKUP_DETECTED';
  confidence: number;
  frame_ref: string;
  search_seed: SearchSeed;
}

>>>>>>> origin/srinivas/final
export interface StatusState {
  cameraActive: boolean;
  backendConnected: boolean;
  processingFrame: boolean;
}
