/**
 * Extended Hours Trading Service (Pre-market & After-hours)
 *
 * Provides access to pre-market and after-hours trading data
 */

import YahooFinance from 'yahoo-finance2';
import { CacheService, CachePrefix } from './cache.js';
import { ErrorHandler, withRetry } from '../utils/error-handler.js';

/**
 * Extended hours trading session data
 */
export interface ExtendedHoursData {
  symbol: string;
  companyName: string;

  // Regular market data (for reference)
  regularMarket: {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    time: Date;
    isOpen: boolean;
  };

  // Pre-market data
  preMarket?: {
    price: number;
    change: number;
    changePercent: number;
    time: Date;
    isActive: boolean;
  };

  // After-hours data
  postMarket?: {
    price: number;
    change: number;
    changePercent: number;
    time: Date;
    isActive: boolean;
  };

  // Current session info
  currentSession: 'pre-market' | 'regular' | 'post-market' | 'closed';

  // Most recent price (from whichever session is active)
  currentPrice: number;
  currentChange: number;
  currentChangePercent: number;

  timestamp: Date;
}

/**
 * Extended Hours Service
 */
export class ExtendedHoursService {
  private cache: CacheService;
  private yahooFinance: typeof YahooFinance;

  constructor() {
    this.cache = CacheService.getInstance();
    this.yahooFinance = YahooFinance;
  }

  /**
   * Get extended hours data for a symbol
   */
  async getExtendedHours(symbol: string): Promise<ExtendedHoursData> {
    const cacheKey = `${CachePrefix.QUOTE}:extended:${symbol.toLowerCase()}`;

    // Use shorter TTL for extended hours (5 minutes) since prices change rapidly
    const ttl = 300; // 5 minutes

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const quote = await this.yahooFinance.quote(symbol, {}, { validateResult: false }) as any;

            if (!quote) {
              throw new Error('No data found for symbol');
            }

            return this.transformExtendedHoursData(quote);
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      ttl
    );
  }

  /**
   * Get extended hours data for multiple symbols
   */
  async getExtendedHoursBatch(symbols: string[]): Promise<{
    data: Record<string, ExtendedHoursData | null>;
    errors: Record<string, string>;
  }> {
    const data: Record<string, ExtendedHoursData | null> = {};
    const errors: Record<string, string> = {};

    // Fetch data in parallel
    const results = await Promise.allSettled(
      symbols.map(async symbol => ({
        symbol,
        data: await this.getExtendedHours(symbol)
      }))
    );

    // Process results
    results.forEach((result, index) => {
      const symbol = symbols[index];

      if (result.status === 'fulfilled') {
        data[symbol] = result.value.data;
      } else {
        data[symbol] = null;
        errors[symbol] = result.reason?.message || 'Failed to fetch extended hours data';
      }
    });

    return { data, errors };
  }

  /**
   * Determine current trading session based on time
   */
  private determineCurrentSession(
    regularMarketTime: Date,
    preMarketTime?: Date,
    postMarketTime?: Date
  ): 'pre-market' | 'regular' | 'post-market' | 'closed' {
    const now = new Date();
    const marketDay = new Date(regularMarketTime);

    // Check if it's the same day
    const isSameDay =
      now.getUTCFullYear() === marketDay.getUTCFullYear() &&
      now.getUTCMonth() === marketDay.getUTCMonth() &&
      now.getUTCDate() === marketDay.getUTCDate();

    if (!isSameDay) {
      return 'closed';
    }

    // Pre-market is typically 4:00 AM - 9:30 AM ET
    // Regular hours are 9:30 AM - 4:00 PM ET
    // After-hours are 4:00 PM - 8:00 PM ET

    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinutes;

    // Convert to ET (approximately, without timezone library)
    // This is simplified - in production, use proper timezone handling
    const preMarketStart = 4 * 60; // 4:00 AM
    const regularStart = 9 * 60 + 30; // 9:30 AM
    const regularEnd = 16 * 60; // 4:00 PM
    const postMarketEnd = 20 * 60; // 8:00 PM

    if (preMarketTime && currentTime >= preMarketStart && currentTime < regularStart) {
      return 'pre-market';
    }

    if (currentTime >= regularStart && currentTime < regularEnd) {
      return 'regular';
    }

    if (postMarketTime && currentTime >= regularEnd && currentTime < postMarketEnd) {
      return 'post-market';
    }

    return 'closed';
  }

  /**
   * Transform Yahoo Finance quote to extended hours data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transformExtendedHoursData(quote: any): ExtendedHoursData {
    const regularMarketTime = quote.regularMarketTime
      ? new Date(quote.regularMarketTime * 1000)
      : new Date();

    // Regular market data
    const regularMarket = {
      price: quote.regularMarketPrice || 0,
      change: quote.regularMarketChange || 0,
      changePercent: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || 0,
      time: regularMarketTime,
      isOpen: quote.marketState === 'REGULAR' || quote.marketState === 'REGULAR_HOURS'
    };

    // Pre-market data (if available)
    let preMarket: ExtendedHoursData['preMarket'];
    if (quote.preMarketPrice !== undefined && quote.preMarketPrice !== null) {
      preMarket = {
        price: quote.preMarketPrice,
        change: quote.preMarketChange || 0,
        changePercent: quote.preMarketChangePercent || 0,
        time: quote.preMarketTime
          ? new Date(quote.preMarketTime * 1000)
          : new Date(),
        isActive: quote.marketState === 'PRE' || quote.marketState === 'PREPRE'
      };
    }

    // After-hours data (if available)
    let postMarket: ExtendedHoursData['postMarket'];
    if (quote.postMarketPrice !== undefined && quote.postMarketPrice !== null) {
      postMarket = {
        price: quote.postMarketPrice,
        change: quote.postMarketChange || 0,
        changePercent: quote.postMarketChangePercent || 0,
        time: quote.postMarketTime
          ? new Date(quote.postMarketTime * 1000)
          : new Date(),
        isActive: quote.marketState === 'POST' || quote.marketState === 'POSTPOST'
      };
    }

    // Determine current session
    const currentSession = this.determineCurrentSession(
      regularMarketTime,
      preMarket?.time,
      postMarket?.time
    );

    // Determine current price based on active session
    let currentPrice = regularMarket.price;
    let currentChange = regularMarket.change;
    let currentChangePercent = regularMarket.changePercent;

    if (currentSession === 'pre-market' && preMarket) {
      currentPrice = preMarket.price;
      currentChange = preMarket.change;
      currentChangePercent = preMarket.changePercent;
    } else if (currentSession === 'post-market' && postMarket) {
      currentPrice = postMarket.price;
      currentChange = postMarket.change;
      currentChangePercent = postMarket.changePercent;
    }

    return {
      symbol: quote.symbol,
      companyName: quote.longName || quote.shortName || quote.symbol,
      regularMarket,
      preMarket,
      postMarket,
      currentSession,
      currentPrice,
      currentChange,
      currentChangePercent,
      timestamp: new Date()
    };
  }
}

/**
 * Singleton instance
 */
export const extendedHoursService = new ExtendedHoursService();
