/**
 * Analyst Ratings Service
 *
 * Tracks analyst recommendations, upgrades, downgrades, and consensus changes
 */

import YahooFinance from 'yahoo-finance2';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';
import { ErrorHandler, withRetry } from '../utils/error-handler.js';

/**
 * Analyst rating data
 */
export interface AnalystRatingData {
  symbol: string;
  companyName: string;

  // Current consensus
  currentRating: {
    rating: string;                    // e.g., "buy", "hold", "sell"
    targetPrice?: number;              // Mean analyst target price
    targetPriceHigh?: number;          // Highest target
    targetPriceLow?: number;           // Lowest target
    targetPriceMedian?: number;        // Median target
    numberOfAnalysts?: number;         // Number of analysts covering
  };

  // Rating distribution
  ratingDistribution: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    total: number;
  };

  // Recent changes (if available)
  recentChanges?: Array<{
    date: Date;
    firm: string;
    action: 'upgrade' | 'downgrade' | 'initiated' | 'reiterated';
    fromRating?: string;
    toRating: string;
    targetPrice?: number;
  }>;

  // Trend analysis
  trend: {
    direction: 'improving' | 'deteriorating' | 'stable' | 'unknown';
    bullishPercent: number;            // % of buy/strong buy ratings
    bearishPercent: number;            // % of sell/strong sell ratings
    description: string;
  };

  // Price comparison
  priceComparison: {
    currentPrice: number;
    targetPrice?: number;
    upside?: number;                   // % upside to target
    upsideToHigh?: number;            // % upside to highest target
    downside?: number;                 // % downside to lowest target
  };

  timestamp: Date;
}

/**
 * Analyst Ratings Service
 */
export class AnalystRatingsService {
  private cache: CacheService;
  private yahooFinance: typeof YahooFinance;

  constructor() {
    this.cache = CacheService.getInstance();
    this.yahooFinance = YahooFinance;
  }

  /**
   * Get analyst ratings for a symbol
   */
  async getAnalystRatings(symbol: string): Promise<AnalystRatingData> {
    const cacheKey = `${CachePrefix.QUOTE}:ratings:${symbol.toLowerCase()}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            // Get both quote and quoteSummary for comprehensive data
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const quote = await this.yahooFinance.quote(symbol, {}, { validateResult: false }) as any;

            // Try to get recommendation and financial data
            let summary = null;
            try {
              summary = await this.yahooFinance.quoteSummary(symbol, {
                modules: ['recommendationTrend', 'financialData', 'price']
              });
            } catch {
              // Summary data not available, continue with just quote
            }

            if (!quote) {
              throw new Error('No data found for symbol');
            }

            return this.transformRatingData(quote, summary);
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      CacheTTL.QUOTE
    );
  }

  /**
   * Get analyst ratings for multiple symbols
   */
  async getAnalystRatingsBatch(symbols: string[]): Promise<{
    data: Record<string, AnalystRatingData | null>;
    errors: Record<string, string>;
  }> {
    const data: Record<string, AnalystRatingData | null> = {};
    const errors: Record<string, string> = {};

    // Fetch data in parallel
    const results = await Promise.allSettled(
      symbols.map(async symbol => ({
        symbol,
        data: await this.getAnalystRatings(symbol)
      }))
    );

    // Process results
    results.forEach((result, index) => {
      const symbol = symbols[index];

      if (result.status === 'fulfilled') {
        data[symbol] = result.value.data;
      } else {
        data[symbol] = null;
        errors[symbol] = result.reason?.message || 'Failed to fetch analyst ratings';
      }
    });

    return { data, errors };
  }

  /**
   * Determine rating trend
   */
  private determineTrend(
    strongBuy: number,
    buy: number,
    hold: number,
    sell: number,
    strongSell: number
  ): { direction: 'improving' | 'deteriorating' | 'stable' | 'unknown'; bullishPercent: number; bearishPercent: number; description: string } {
    const total = strongBuy + buy + hold + sell + strongSell;

    if (total === 0) {
      return {
        direction: 'unknown',
        bullishPercent: 0,
        bearishPercent: 0,
        description: 'No analyst ratings available'
      };
    }

    const bullishPercent = ((strongBuy + buy) / total) * 100;
    const bearishPercent = ((sell + strongSell) / total) * 100;
    const neutralPercent = (hold / total) * 100;

    let direction: 'improving' | 'deteriorating' | 'stable' | 'unknown';
    let description: string;

    if (bullishPercent >= 70) {
      direction = 'improving';
      description = `Strong bullish consensus with ${bullishPercent.toFixed(0)}% buy ratings`;
    } else if (bullishPercent >= 50) {
      direction = 'improving';
      description = `Moderately bullish with ${bullishPercent.toFixed(0)}% buy ratings`;
    } else if (bearishPercent >= 50) {
      direction = 'deteriorating';
      description = `Bearish sentiment with ${bearishPercent.toFixed(0)}% sell ratings`;
    } else if (neutralPercent >= 60) {
      direction = 'stable';
      description = `Neutral stance with ${neutralPercent.toFixed(0)}% hold ratings`;
    } else {
      direction = 'stable';
      description = 'Mixed analyst opinions with no clear consensus';
    }

    return { direction, bullishPercent, bearishPercent, description };
  }

  /**
   * Transform Yahoo Finance data to analyst rating data
   */
  private transformRatingData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quote: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: any
  ): AnalystRatingData {
    const currentPrice = quote.regularMarketPrice || 0;

    // Extract recommendation data from summary
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recommendationTrend = summary?.recommendationTrend?.trend?.[0] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const financialData = summary?.financialData as any;

    // Rating distribution
    const strongBuy = recommendationTrend?.strongBuy || 0;
    const buy = recommendationTrend?.buy || 0;
    const hold = recommendationTrend?.hold || 0;
    const sell = recommendationTrend?.sell || 0;
    const strongSell = recommendationTrend?.strongSell || 0;
    const total = strongBuy + buy + hold + sell + strongSell;

    // Target prices
    const targetPrice = financialData?.targetMeanPrice || undefined;
    const targetPriceHigh = financialData?.targetHighPrice || undefined;
    const targetPriceLow = financialData?.targetLowPrice || undefined;
    const targetPriceMedian = financialData?.targetMedianPrice || undefined;
    const numberOfAnalysts = financialData?.numberOfAnalystOpinions || undefined;

    // Calculate upside/downside
    let upside: number | undefined;
    let upsideToHigh: number | undefined;
    let downside: number | undefined;

    if (targetPrice && currentPrice > 0) {
      upside = ((targetPrice - currentPrice) / currentPrice) * 100;
    }
    if (targetPriceHigh && currentPrice > 0) {
      upsideToHigh = ((targetPriceHigh - currentPrice) / currentPrice) * 100;
    }
    if (targetPriceLow && currentPrice > 0) {
      downside = ((targetPriceLow - currentPrice) / currentPrice) * 100;
    }

    // Determine trend
    const trend = this.determineTrend(strongBuy, buy, hold, sell, strongSell);

    // Current rating (simplified from distribution)
    let currentRatingStr = 'hold';
    if (strongBuy + buy > hold + sell + strongSell) {
      currentRatingStr = 'buy';
    } else if (sell + strongSell > hold + buy + strongBuy) {
      currentRatingStr = 'sell';
    }

    return {
      symbol: quote.symbol,
      companyName: quote.longName || quote.shortName || quote.symbol,

      currentRating: {
        rating: currentRatingStr,
        targetPrice,
        targetPriceHigh,
        targetPriceLow,
        targetPriceMedian,
        numberOfAnalysts
      },

      ratingDistribution: {
        strongBuy,
        buy,
        hold,
        sell,
        strongSell,
        total
      },

      trend,

      priceComparison: {
        currentPrice,
        targetPrice,
        upside,
        upsideToHigh,
        downside
      },

      timestamp: new Date()
    };
  }
}

/**
 * Singleton instance
 */
export const analystRatingsService = new AnalystRatingsService();
