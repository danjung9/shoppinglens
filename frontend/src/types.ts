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

export interface StatusState {
  cameraActive: boolean;
  backendConnected: boolean;
  processingFrame: boolean;
}
