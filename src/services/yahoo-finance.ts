/**
 * Yahoo Finance service wrapper with caching and error handling
 */

import yahooFinance from 'yahoo-finance2';
import {
  QuoteData,
  HistoricalDataPoint,
  HistoricalParams,
  NewsArticle,
  SearchResult,
  MarketSummary,
  BatchQuoteResponse
} from '../types/market-data.js';
import { cacheService, CacheService, CacheTTL } from './cache.js';
import { ErrorHandler, withRetry } from '../utils/error-handler.js';
import { parseRelativeDate, validateDateRange } from '../utils/validators.js';

export class YahooFinanceService {
  private cache: CacheService;

  constructor() {
    this.cache = cacheService;
  }

  /**
   * Get real-time quote for a symbol
   */
  async getQuote(symbol: string): Promise<QuoteData> {
    const cacheKey = CacheService.generateQuoteKey(symbol);
    const ttl = CacheService.getAdjustedTTL(CacheTTL.QUOTE);

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            const quote = await yahooFinance.quote(symbol, {}, { validateResult: false }) as any;

            if (!quote) {
              throw new Error('No data found for symbol');
            }

            return this.transformQuote(quote);
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      ttl
    );
  }

  /**
   * Get quotes for multiple symbols
   */
  async getQuoteBatch(symbols: string[]): Promise<BatchQuoteResponse> {
    const quotes: Record<string, QuoteData | null> = {};
    const errors: Record<string, string> = {};

    // Fetch quotes in parallel
    const results = await Promise.allSettled(
      symbols.map(async symbol => ({
        symbol,
        quote: await this.getQuote(symbol)
      }))
    );

    // Process results
    results.forEach((result, index) => {
      const symbol = symbols[index];

      if (result.status === 'fulfilled') {
        quotes[symbol] = result.value.quote;
      } else {
        quotes[symbol] = null;
        errors[symbol] = result.reason?.message || 'Failed to fetch quote';
      }
    });

    return { quotes, errors };
  }

  /**
   * Get historical data for a symbol
   */
  async getHistorical(params: HistoricalParams): Promise<HistoricalDataPoint[]> {
    const { symbol, period1, period2, interval } = params;

    // Parse dates
    const startDate =
      typeof period1 === 'string' ? parseRelativeDate(period1) : period1;
    const endDate = period2
      ? typeof period2 === 'string'
        ? parseRelativeDate(period2)
        : period2
      : new Date();

    // Validate date range
    validateDateRange(startDate, endDate);

    const cacheKey = CacheService.generateHistoricalKey(
      symbol,
      period1,
      period2,
      interval
    );
    const ttl = CacheService.getAdjustedTTL(CacheTTL.HISTORICAL);

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            const result = await yahooFinance.chart(symbol, {
              period1: startDate,
              period2: endDate,
              interval: interval as any
            }, { validateResult: false }) as any;

            if (!result || !result.quotes || result.quotes.length === 0) {
              throw new Error('No historical data found');
            }

            return result.quotes.map(this.transformHistoricalPoint);
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      ttl
    );
  }

  /**
   * Search for ticker symbols
   */
  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    const cacheKey = CacheService.generateSearchKey(query);

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            const results = await yahooFinance.search(query, {}, { validateResult: false }) as any;

            if (!results || !results.quotes) {
              return [];
            }

            return results.quotes
              .slice(0, limit)
              .map(this.transformSearchResult);
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      CacheTTL.SEARCH
    );
  }

  /**
   * Get news for a symbol or general market
   */
  async getNews(symbol?: string, limit: number = 10): Promise<NewsArticle[]> {
    const cacheKey = CacheService.generateNewsKey(symbol);

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            let news;

            if (symbol) {
              // Get symbol-specific news
              const quote = await yahooFinance.quoteSummary(symbol, {
                modules: ['assetProfile']
              }, { validateResult: false });
              news = (quote as any).news || [];
            } else {
              // Get general market news (use a major index)
              const quote = await yahooFinance.quoteSummary('^GSPC', {
                modules: ['assetProfile']
              }, { validateResult: false });
              news = (quote as any).news || [];
            }

            return news.slice(0, limit).map(this.transformNewsArticle);
          } catch (error) {
            // If news fails, return empty array rather than error
            console.error('Failed to fetch news:', error);
            return [];
          }
        });
      },
      CacheTTL.NEWS
    );
  }

  /**
   * Get market summary (major indices)
   */
  async getMarketSummary(): Promise<MarketSummary[]> {
    const cacheKey = CacheService.generateMarketKey('summary');

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const symbols = ['^GSPC', '^DJI', '^IXIC', '^VIX'];
        const names = ['S&P 500', 'Dow Jones', 'NASDAQ', 'VIX'];

        const quotes = await Promise.all(
          symbols.map(symbol => yahooFinance.quote(symbol, {}, { validateResult: false }) as any)
        );

        return quotes.map((quote, index) => ({
          symbol: symbols[index],
          name: names[index],
          regularMarketPrice: quote.regularMarketPrice || 0,
          regularMarketChange: quote.regularMarketChange || 0,
          regularMarketChangePercent: quote.regularMarketChangePercent || 0,
          regularMarketTime: quote.regularMarketTime
            ? new Date(quote.regularMarketTime)
            : new Date()
        }));
      },
      CacheTTL.MARKET_SUMMARY
    );
  }

  /**
   * Get trending/most active stocks
   */
  async getTrending(limit: number = 10): Promise<SearchResult[]> {
    const cacheKey = CacheService.generateMarketKey('trending');

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          const result = await yahooFinance.trendingSymbols('US', {}, { validateResult: false }) as any;

          if (!result || !result.quotes) {
            return [];
          }

          return result.quotes
            .slice(0, limit)
            .map(this.transformSearchResult);
        } catch (error) {
          console.error('Failed to fetch trending:', error);
          return [];
        }
      },
      CacheTTL.MARKET_SUMMARY
    );
  }

  /**
   * Transform yahoo-finance2 quote to our QuoteData type
   */
  private transformQuote(quote: any): QuoteData {
    return {
      symbol: quote.symbol,
      regularMarketPrice: quote.regularMarketPrice || 0,
      regularMarketChange: quote.regularMarketChange || 0,
      regularMarketChangePercent: quote.regularMarketChangePercent || 0,
      regularMarketVolume: quote.regularMarketVolume || 0,
      marketCap: quote.marketCap,
      currency: quote.currency || 'USD',
      exchangeName: quote.fullExchangeName || quote.exchange || 'Unknown',
      quoteType: quote.quoteType || 'EQUITY',
      regularMarketTime: quote.regularMarketTime
        ? new Date(quote.regularMarketTime)
        : new Date(),
      bid: quote.bid,
      ask: quote.ask,
      bidSize: quote.bidSize,
      askSize: quote.askSize,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      fiftyDayAverage: quote.fiftyDayAverage,
      twoHundredDayAverage: quote.twoHundredDayAverage,
      trailingPE: quote.trailingPE,
      forwardPE: quote.forwardPE,
      dividendYield: quote.dividendYield,
      shortName: quote.shortName,
      longName: quote.longName
    };
  }

  /**
   * Transform historical data point
   */
  private transformHistoricalPoint(point: any): HistoricalDataPoint {
    return {
      date: point.date instanceof Date ? point.date : new Date(point.date),
      open: point.open || 0,
      high: point.high || 0,
      low: point.low || 0,
      close: point.close || 0,
      volume: point.volume || 0,
      adjClose: point.adjClose
    };
  }

  /**
   * Transform search result
   */
  private transformSearchResult(result: any): SearchResult {
    return {
      symbol: result.symbol,
      name: result.shortname || result.longname || result.symbol,
      exchDisp: result.exchDisp || result.exchange || 'Unknown',
      typeDisp: result.typeDisp || result.quoteType || 'Unknown',
      quoteType: result.quoteType || 'EQUITY',
      exchange: result.exchange || 'Unknown',
      industry: result.industry,
      sector: result.sector
    };
  }

  /**
   * Transform news article
   */
  private transformNewsArticle(article: any): NewsArticle {
    return {
      title: article.title || 'No title',
      publisher: article.publisher || 'Unknown',
      link: article.link || '',
      providerPublishTime: article.providerPublishTime
        ? new Date(article.providerPublishTime * 1000)
        : new Date(),
      type: article.type || 'STORY',
      thumbnail: article.thumbnail
        ? {
            url: article.thumbnail.resolutions?.[0]?.url || article.thumbnail.url,
            width: article.thumbnail.resolutions?.[0]?.width,
            height: article.thumbnail.resolutions?.[0]?.height
          }
        : undefined,
      relatedTickers: article.relatedTickers
    };
  }
}

// Export singleton instance
export const yahooFinanceService = new YahooFinanceService();
