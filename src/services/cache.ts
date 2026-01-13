/**
 * Caching service with TTL support
 */

import NodeCache from 'node-cache';

/**
 * Cache TTL values in seconds
 */
export const CacheTTL = {
  QUOTE: parseInt(process.env.CACHE_QUOTE_TTL || '5', 10),
  HISTORICAL: parseInt(process.env.CACHE_HISTORICAL_TTL || '3600', 10),
  NEWS: parseInt(process.env.CACHE_NEWS_TTL || '300', 10),
  SEARCH: parseInt(process.env.CACHE_SEARCH_TTL || '3600', 10),
  INDICATOR: parseInt(process.env.CACHE_INDICATOR_TTL || '300', 10),
  MARKET_SUMMARY: 60, // 1 minute
  DEFAULT: parseInt(process.env.CACHE_DEFAULT_TTL || '300', 10)
} as const;

/**
 * Cache key prefixes for different data types
 */
export const CachePrefix = {
  QUOTE: 'quote',
  HISTORICAL: 'historical',
  NEWS: 'news',
  SEARCH: 'search',
  INDICATOR: 'indicator',
  MARKET: 'market',
  WATCHLIST: 'watchlist'
} as const;

export class CacheService {
  private cache: NodeCache;
  private static instance: CacheService;

  private constructor() {
    this.cache = new NodeCache({
      stdTTL: CacheTTL.DEFAULT,
      checkperiod: 60, // Cleanup every 60 seconds
      useClones: false, // Performance optimization
      deleteOnExpire: true
    });

    // Log cache statistics periodically in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const stats = this.cache.getStats();
        console.error(
          `[Cache Stats] Keys: ${stats.keys}, Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${
            stats.hits + stats.misses > 0
              ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
              : 0
          }%`
        );
      }, 60000); // Log every minute
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    const value = this.cache.get<T>(key);
    if (value !== undefined) {
      console.error(`[Cache HIT] ${key}`);
    } else {
      console.error(`[Cache MISS] ${key}`);
    }
    return value;
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const success = this.cache.set(key, value, ttl || CacheTTL.DEFAULT);
    if (success) {
      console.error(`[Cache SET] ${key} (TTL: ${ttl || CacheTTL.DEFAULT}s)`);
    } else {
      console.error(`[Cache SET FAILED] ${key}`);
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<void> {
    const deletedCount = this.cache.del(key);
    if (deletedCount > 0) {
      console.error(`[Cache DEL] ${key}`);
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async delPattern(pattern: string): Promise<void> {
    const keys = this.cache.keys();
    const matchingKeys = keys.filter(key => key.includes(pattern));

    if (matchingKeys.length > 0) {
      this.cache.del(matchingKeys);
      console.error(`[Cache DEL PATTERN] ${pattern} (${matchingKeys.length} keys)`);
    }
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  /**
   * Flush all cache entries
   */
  flush(): void {
    this.cache.flushAll();
    console.error('[Cache FLUSH] All entries cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Get or set pattern: get from cache, or compute and cache
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Generate cache key for quote
   */
  static generateQuoteKey(symbol: string): string {
    return `${CachePrefix.QUOTE}:${symbol.toUpperCase()}`;
  }

  /**
   * Generate cache key for historical data
   */
  static generateHistoricalKey(
    symbol: string,
    period1: string | Date,
    period2: string | Date | undefined,
    interval: string
  ): string {
    const p1 = typeof period1 === 'string' ? period1 : period1.toISOString();
    const p2 = period2
      ? typeof period2 === 'string'
        ? period2
        : period2.toISOString()
      : 'now';
    return `${CachePrefix.HISTORICAL}:${symbol.toUpperCase()}:${p1}:${p2}:${interval}`;
  }

  /**
   * Generate cache key for news
   */
  static generateNewsKey(symbol?: string): string {
    return symbol
      ? `${CachePrefix.NEWS}:${symbol.toUpperCase()}`
      : `${CachePrefix.NEWS}:market`;
  }

  /**
   * Generate cache key for search
   */
  static generateSearchKey(query: string): string {
    return `${CachePrefix.SEARCH}:${query.toLowerCase()}`;
  }

  /**
   * Generate cache key for indicator
   */
  static generateIndicatorKey(
    symbol: string,
    indicator: string,
    period: number,
    interval: string
  ): string {
    return `${CachePrefix.INDICATOR}:${symbol.toUpperCase()}:${indicator}:${period}:${interval}`;
  }

  /**
   * Generate cache key for market summary
   */
  static generateMarketKey(type: 'summary' | 'trending'): string {
    return `${CachePrefix.MARKET}:${type}`;
  }

  /**
   * Generate cache key for watchlist
   */
  static generateWatchlistKey(name: string = 'default'): string {
    return `${CachePrefix.WATCHLIST}:${name}`;
  }

  /**
   * Adjust TTL based on market hours
   * During market hours (9:30 AM - 4:00 PM ET), use shorter TTL
   * After hours, use longer TTL
   */
  static getAdjustedTTL(baseTTL: number): number {
    const now = new Date();
    const et = new Date(
      now.toLocaleString('en-US', { timeZone: 'America/New_York' })
    );
    const hour = et.getHours();
    const minute = et.getMinutes();
    const day = et.getDay();

    // Weekend (Saturday = 6, Sunday = 0)
    if (day === 0 || day === 6) {
      return baseTTL * 24; // 24x longer on weekends
    }

    // Market hours: 9:30 AM - 4:00 PM ET
    const isMarketHours =
      (hour === 9 && minute >= 30) ||
      (hour > 9 && hour < 16) ||
      (hour === 16 && minute === 0);

    return isMarketHours ? baseTTL : baseTTL * 12; // 12x longer after hours
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance();
