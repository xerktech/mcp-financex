/**
 * Short Interest Tracker Service
 *
 * Tracks short interest, short ratio, days to cover, and squeeze potential
 */

import YahooFinance from 'yahoo-finance2';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';
import { ErrorHandler, withRetry } from '../utils/error-handler.js';

/**
 * Short interest data
 */
export interface ShortInterestData {
  symbol: string;
  companyName: string;

  // Short interest metrics
  shortRatio?: number;              // Days to cover (volume / avg daily volume)
  shortPercentOfFloat?: number;     // Percentage of float shares that are shorted
  shortPercentOfShares?: number;    // Percentage of total shares that are shorted
  sharesShort?: number;             // Number of shares sold short
  sharesShortPriorMonth?: number;   // Shares short from previous month
  shortInterestChange?: number;     // Change in short interest (current - prior month)
  shortInterestChangePercent?: number; // Percentage change in short interest

  // Context metrics
  floatShares?: number;             // Number of shares available for trading
  impliedSharesOutstanding?: number; // Total shares outstanding
  averageDailyVolume?: number;      // Average trading volume per day

  // Squeeze indicators
  squeezeRisk: 'high' | 'medium' | 'low' | 'unknown';
  squeezeScore?: number;            // 0-100 score indicating squeeze potential

  // Current price context
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;

  timestamp: Date;
}

/**
 * Short Interest Service
 */
export class ShortInterestService {
  private cache: CacheService;
  private yahooFinance: typeof YahooFinance;

  constructor() {
    this.cache = CacheService.getInstance();
    this.yahooFinance = YahooFinance;
  }

  /**
   * Get short interest data for a symbol
   */
  async getShortInterest(symbol: string): Promise<ShortInterestData> {
    const cacheKey = `${CachePrefix.QUOTE}:short:${symbol.toLowerCase()}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            // Get both quote and quoteSummary for comprehensive data
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const quote = await this.yahooFinance.quote(symbol, {}, { validateResult: false }) as any;

            // Try to get summary data, but don't fail if it's not available
            let summary = null;
            try {
              summary = await this.yahooFinance.quoteSummary(symbol, {
                modules: ['defaultKeyStatistics', 'price']
              });
            } catch {
              // Summary data not available, continue with just quote
            }

            if (!quote) {
              throw new Error('No data found for symbol');
            }

            return this.transformShortInterestData(quote, summary);
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      CacheTTL.QUOTE
    );
  }

  /**
   * Get short interest data for multiple symbols
   */
  async getShortInterestBatch(symbols: string[]): Promise<{
    data: Record<string, ShortInterestData | null>;
    errors: Record<string, string>;
  }> {
    const data: Record<string, ShortInterestData | null> = {};
    const errors: Record<string, string> = {};

    // Fetch data in parallel
    const results = await Promise.allSettled(
      symbols.map(async symbol => ({
        symbol,
        data: await this.getShortInterest(symbol)
      }))
    );

    // Process results
    results.forEach((result, index) => {
      const symbol = symbols[index];

      if (result.status === 'fulfilled') {
        data[symbol] = result.value.data;
      } else {
        data[symbol] = null;
        errors[symbol] = result.reason?.message || 'Failed to fetch short interest data';
      }
    });

    return { data, errors };
  }

  /**
   * Calculate squeeze risk based on short metrics
   */
  private calculateSqueezeRisk(
    shortRatio?: number,
    shortPercentOfFloat?: number
  ): { risk: 'high' | 'medium' | 'low' | 'unknown'; score?: number } {
    // If we don't have enough data, return unknown
    if (shortRatio === undefined && shortPercentOfFloat === undefined) {
      return { risk: 'unknown' };
    }

    // Calculate score (0-100)
    let score = 0;

    // Short ratio contribution (0-50 points)
    // Higher days to cover = higher squeeze risk
    if (shortRatio !== undefined) {
      if (shortRatio > 10) {
        score += 50;
      } else if (shortRatio > 5) {
        score += 40;
      } else if (shortRatio > 3) {
        score += 30;
      } else if (shortRatio > 1) {
        score += 15;
      }
    }

    // Short percent of float contribution (0-50 points)
    // Higher short % = higher squeeze risk
    if (shortPercentOfFloat !== undefined) {
      if (shortPercentOfFloat > 30) {
        score += 50;
      } else if (shortPercentOfFloat > 20) {
        score += 40;
      } else if (shortPercentOfFloat > 15) {
        score += 30;
      } else if (shortPercentOfFloat > 10) {
        score += 20;
      } else if (shortPercentOfFloat > 5) {
        score += 10;
      }
    }

    // Determine risk level
    let risk: 'high' | 'medium' | 'low' | 'unknown';
    if (score >= 70) {
      risk = 'high';
    } else if (score >= 40) {
      risk = 'medium';
    } else {
      risk = 'low';
    }

    return { risk, score };
  }

  /**
   * Transform Yahoo Finance data to short interest data
   */
  private transformShortInterestData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quote: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: any
  ): ShortInterestData {
    // Extract short interest from quote
    const shortRatio = quote.shortRatio;
    const shortPercentOfFloat = quote.shortPercentOfFloat;
    const sharesShort = quote.sharesShort;
    const sharesShortPriorMonth = quote.sharesShortPriorMonth;

    // Calculate change in short interest
    let shortInterestChange: number | undefined;
    let shortInterestChangePercent: number | undefined;
    if (sharesShort !== undefined && sharesShortPriorMonth !== undefined) {
      shortInterestChange = sharesShort - sharesShortPriorMonth;
      if (sharesShortPriorMonth > 0) {
        shortInterestChangePercent = (shortInterestChange / sharesShortPriorMonth) * 100;
      }
    }

    // Get additional metrics from summary if available
    const floatShares = summary?.defaultKeyStatistics?.floatShares;
    const impliedSharesOutstanding = summary?.defaultKeyStatistics?.impliedSharesOutstanding;
    const averageDailyVolume = quote.averageDailyVolume3Month || quote.averageDailyVolume10Day;

    // Calculate short percent of shares if we have the data
    let shortPercentOfShares: number | undefined;
    if (sharesShort !== undefined && impliedSharesOutstanding !== undefined && impliedSharesOutstanding > 0) {
      shortPercentOfShares = (sharesShort / impliedSharesOutstanding) * 100;
    }

    // Calculate squeeze risk
    const squeezeRisk = this.calculateSqueezeRisk(shortRatio, shortPercentOfFloat);

    return {
      symbol: quote.symbol,
      companyName: quote.longName || quote.shortName || quote.symbol,

      // Short interest metrics
      shortRatio,
      shortPercentOfFloat,
      shortPercentOfShares,
      sharesShort,
      sharesShortPriorMonth,
      shortInterestChange,
      shortInterestChangePercent,

      // Context metrics
      floatShares,
      impliedSharesOutstanding,
      averageDailyVolume,

      // Squeeze indicators
      squeezeRisk: squeezeRisk.risk,
      squeezeScore: squeezeRisk.score,

      // Current price context
      currentPrice: quote.regularMarketPrice || 0,
      priceChange: quote.regularMarketChange || 0,
      priceChangePercent: quote.regularMarketChangePercent || 0,

      timestamp: new Date()
    };
  }
}

/**
 * Singleton instance
 */
export const shortInterestService = new ShortInterestService();
