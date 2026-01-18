import { 
  ShoppingBag, 
  TrendingDown, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import type { ShoppingData } from '../types';

interface ShoppingHUDProps {
  data: ShoppingData | null;
  isLoading: boolean;
}

export function ShoppingHUD({ data, isLoading }: ShoppingHUDProps) {
  if (isLoading) {
    return (
      <div 
        className="absolute right-6 top-6 z-10 w-1/3 max-w-sm rounded-xl text-white border border-white/20 transition-all duration-500 isolate glass-fade overflow-hidden"
        style={{ padding: '7px' }}
      >
        <div className="space-y-4">
          <div className="h-5 w-3/4 rounded-lg bg-white/10 loading-shimmer" />
          <div className="h-4 w-1/2 rounded-lg bg-white/10 loading-shimmer" />
          <div className="mt-5 space-y-3">
            <div className="h-10 rounded-xl bg-white/10 loading-shimmer" />
            <div className="h-10 rounded-xl bg-white/10 loading-shimmer" />
            <div className="h-10 rounded-xl bg-white/10 loading-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div 
        className="absolute right-6 top-6 z-10 w-1/3 max-w-sm rounded-xl text-white border border-white/20 transition-all duration-500 isolate glass-fade overflow-hidden"
        style={{ padding: '7px' }}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <ShoppingBag className="mb-4 h-10 w-10 text-white" />
          <p className="text-base font-medium text-white">Hold a product</p>
          <p className="mt-1 text-xs text-white">To identify and analyze it</p>
        </div>
      </div>
    );
  }

  const lowestCompetitorPrice = Math.min(
    ...data.competitors.map((c) => parseFloat(c.price.replace('$', '')))
  );
  const detectedPriceNum = parseFloat(data.detectedPrice.replace('$', ''));
  const savings = detectedPriceNum - lowestCompetitorPrice;

  const ContentBlock = () => (
    <div style={{ padding: '7px' }}>
      {/* Product Identity */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-white truncate">{data.productName}</h2>
        <p className="text-sm text-white mt-1 truncate">{data.brand}</p>
      </div>

      {/* Detected Price */}
      <div className="mb-5 rounded-2xl bg-white/5 border border-white/10 overflow-hidden" style={{ padding: '12px' }}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-white">Detected Price</span>
          <span className="text-2xl font-bold text-white">{data.detectedPrice}</span>
        </div>
      </div>

      {/* Price Comparison */}
      <div className="mb-5">
        <h3 className="mb-3 text-sm font-medium text-white uppercase tracking-wider">
          Price Comparison
        </h3>
        <div className="space-y-2">
          {data.competitors.map((competitor, index) => {
            const competitorPriceNum = parseFloat(competitor.price.replace('$', ''));
            const isLower = competitorPriceNum < detectedPriceNum;
            const isLowest = competitorPriceNum === lowestCompetitorPrice;

            return (
              <div
                key={index}
                className={`flex items-center justify-between rounded-xl transition-colors overflow-hidden ${
                  isLowest
                    ? 'bg-green-400/10 border border-green-400/30'
                    : 'bg-white/5 border border-white/10'
                }`}
                style={{ padding: '10px' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-white text-sm truncate">{competitor.site}</span>
                  {isLowest && (
                    <span className="rounded-full border border-green-400/50 px-1.5 py-0.5 text-xs font-medium text-green-400 flex-shrink-0">
                      Best
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`font-semibold text-sm ${
                      isLower ? 'text-green-400' : 'text-white'
                    }`}
                  >
                    {competitor.price}
                  </span>
                  {isLower ? (
                    <TrendingDown className="h-3 w-3 text-green-400" />
                  ) : (
                    <TrendingUp className="h-3 w-3 text-red-400" />
                  )}
                  <ExternalLink className="h-3 w-3 text-white" />
                </div>
              </div>
            );
          })}
        </div>
        {savings > 0 && (
          <p className="mt-3 text-center text-xs text-green-400">
            Save up to ${savings.toFixed(2)} elsewhere
          </p>
        )}
      </div>

      {/* Compatibility Check */}
      <div className="mb-5 rounded-2xl bg-white/5 border border-white/10 overflow-hidden" style={{ padding: '12px' }}>
        <div className="flex items-start gap-3">
          {data.isCompatible ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-400 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0 text-red-400 mt-0.5" />
          )}
          <div className="min-w-0">
            <p
              className={`font-medium text-sm ${
                data.isCompatible ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {data.isCompatible ? 'Compatible' : 'Incompatible'}
            </p>
            <p className="mt-1 text-xs text-white leading-relaxed">{data.compatibilityNote}</p>
          </div>
        </div>
      </div>

      {/* Value Score */}
      <div className="mb-5">
        <div
          className={`rounded-2xl text-center overflow-hidden ${
            data.valueScore === 'buy'
              ? 'bg-green-400/10 border border-green-400/30'
              : 'bg-yellow-400/10 border border-yellow-400/30'
          }`}
          style={{ padding: '12px' }}
        >
          <p className="text-xs font-medium text-white mb-1">AI Recommendation</p>
          <p
            className={`text-lg font-bold ${
              data.valueScore === 'buy' ? 'text-green-400' : 'text-yellow-400'
            }`}
          >
            {data.valueScore === 'buy' ? '✓ Buy Now' : '⏳ Wait'}
          </p>
        </div>
      </div>

      {/* AI Insight */}
      <div className="mb-5 rounded-2xl bg-blue-400/10 border border-blue-400/20 overflow-hidden" style={{ padding: '12px' }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3 w-3 text-blue-400 flex-shrink-0" />
          <span className="text-xs font-medium text-blue-400">AI Insight</span>
        </div>
        <p className="text-xs text-white leading-relaxed">{data.aiInsight}</p>
      </div>
    </div>
  );

  return (
    <div 
      className="absolute right-6 top-6 z-10 w-1/3 max-w-sm rounded-xl text-white border border-white/20 transition-all duration-500 isolate glass-fade overflow-hidden"
      style={{ height: '50vh' }}
    >
      <div className="auto-scroll">
        <ContentBlock />
        <ContentBlock />
      </div>
    </div>
  );
}
