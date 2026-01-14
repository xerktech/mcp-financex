/**
 * Yahoo Finance service wrapper with caching and error handling
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance instance
const yahooFinance = new YahooFinance();
import {
  QuoteData,
  HistoricalDataPoint,
  HistoricalParams,
  NewsArticle,
  SearchResult,
  MarketSummary,
  BatchQuoteResponse,
  MarketContext,
  CompanyProfile,
  CompanyFundamentals,
  UpcomingEvent,
  InsiderTransaction
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
   * Get comprehensive market context for in-depth analysis
   * Includes company profile, fundamentals, news, events, institutional holdings, etc.
   */
  async getMarketContext(symbol: string, newsLimit: number = 20): Promise<MarketContext> {
    const cacheKey = `market_context:${symbol.toUpperCase()}`;
    const ttl = CacheService.getAdjustedTTL(CacheTTL.NEWS); // Use news TTL since context includes news

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            // Fetch comprehensive data using quoteSummary with multiple modules
            const [quoteSummaryData, quoteData, news] = await Promise.allSettled([
              yahooFinance.quoteSummary(symbol, {
                modules: [
                  'assetProfile',
                  'summaryDetail',
                  'financialData',
                  'defaultKeyStatistics',
                  'calendarEvents',
                  'recommendationTrend',
                  'upgradeDowngradeHistory',
                  'earnings',
                  'earningsHistory',
                  'insiderTransactions',
                  'institutionOwnership',
                  'fundOwnership',
                  'majorDirectHolders',
                  'majorHoldersBreakdown',
                  'price'
                ]
              }, { validateResult: false }),
              this.getQuote(symbol),
              this.getNews(symbol, newsLimit)
            ]);

            const summary = quoteSummaryData.status === 'fulfilled' ? quoteSummaryData.value : {} as any;
            const quote = quoteData.status === 'fulfilled' ? quoteData.value : null;
            const newsArticles = news.status === 'fulfilled' ? news.value : [];

            // Build comprehensive market context
            const context: MarketContext = {
              symbol,
              timestamp: new Date(),
              recentNews: newsArticles,
              newsCount: newsArticles.length
            };

            // Extract profile information
            if (summary.assetProfile || summary.price) {
              context.profile = this.extractCompanyProfile(summary, symbol);
            }

            // Extract fundamentals
            if (summary.summaryDetail || summary.financialData || summary.defaultKeyStatistics) {
              context.fundamentals = this.extractFundamentals(summary, quote);
            }

            // Extract upcoming events
            if (summary.calendarEvents) {
              context.upcomingEvents = this.extractUpcomingEvents(summary.calendarEvents);
            }

            // Extract institutional ownership
            if (summary.institutionOwnership || summary.fundOwnership || summary.majorHoldersBreakdown) {
              context.institutionalOwnership = this.extractInstitutionalOwnership(summary);
            }

            // Extract insider transactions
            if (summary.insiderTransactions) {
              context.insiderTransactions = this.extractInsiderTransactions(summary.insiderTransactions);
            }

            // Extract short interest
            if (summary.defaultKeyStatistics) {
              context.shortInterest = this.extractShortInterest(summary.defaultKeyStatistics);
            }

            // Extract analyst ratings
            if (summary.recommendationTrend || summary.financialData) {
              context.analystRatings = this.extractAnalystRatings(summary);
            }

            // Add sector performance context
            if (summary.assetProfile?.sector) {
              context.sectorPerformance = {
                sector: summary.assetProfile.sector,
                sectorChange: 0, // Would need additional API call for real-time sector data
                sectorChangePercent: 0
              };
            }

            return context;
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      ttl
    );
  }

  /**
   * Extract company profile from quoteSummary data
   */
  private extractCompanyProfile(summary: any, symbol: string): CompanyProfile {
    const profile = summary.assetProfile || {};
    const price = summary.price || {};

    return {
      symbol,
      longName: price.longName || profile.longName,
      industry: profile.industry,
      sector: profile.sector,
      website: profile.website,
      fullTimeEmployees: profile.fullTimeEmployees,
      longBusinessSummary: profile.longBusinessSummary,
      officers: profile.companyOfficers?.slice(0, 5).map((officer: any) => ({
        name: officer.name,
        title: officer.title,
        age: officer.age,
        totalPay: officer.totalPay
      }))
    };
  }

  /**
   * Extract company fundamentals
   */
  private extractFundamentals(summary: any, quote: QuoteData | null): CompanyFundamentals {
    const detail = summary.summaryDetail || {};
    const financial = summary.financialData || {};
    const keyStats = summary.defaultKeyStatistics || {};

    return {
      // Valuation metrics
      marketCap: quote?.marketCap || keyStats.marketCap,
      enterpriseValue: keyStats.enterpriseValue,
      trailingPE: quote?.trailingPE || keyStats.trailingPE,
      forwardPE: quote?.forwardPE || keyStats.forwardPE,
      pegRatio: keyStats.pegRatio,
      priceToBook: keyStats.priceToBook,
      priceToSales: keyStats.priceToSalesTrailing12Months,

      // Profitability metrics
      profitMargins: financial.profitMargins,
      operatingMargins: financial.operatingMargins,
      returnOnAssets: financial.returnOnAssets,
      returnOnEquity: financial.returnOnEquity,

      // Growth metrics
      revenueGrowth: financial.revenueGrowth,
      earningsGrowth: financial.earningsGrowth,

      // Financial health
      totalDebt: financial.totalDebt,
      debtToEquity: financial.debtToEquity,
      currentRatio: financial.currentRatio,
      quickRatio: financial.quickRatio,

      // Dividend info
      dividendYield: quote?.dividendYield || detail.dividendYield,
      dividendRate: detail.dividendRate,
      payoutRatio: keyStats.payoutRatio,
      exDividendDate: detail.exDividendDate ? new Date(detail.exDividendDate * 1000) : undefined,

      // Analyst data
      targetMeanPrice: financial.targetMeanPrice,
      targetHighPrice: financial.targetHighPrice,
      targetLowPrice: financial.targetLowPrice,
      numberOfAnalystOpinions: financial.numberOfAnalystOpinions,
      recommendationMean: financial.recommendationMean,
      recommendationKey: financial.recommendationKey
    };
  }

  /**
   * Extract upcoming events (earnings, dividends, etc.)
   */
  private extractUpcomingEvents(calendarEvents: any): UpcomingEvent[] {
    const events: UpcomingEvent[] = [];

    // Earnings date - already in Date format from Yahoo Finance
    if (calendarEvents.earnings?.earningsDate?.[0]) {
      const earningsDate = calendarEvents.earnings.earningsDate[0];
      events.push({
        type: 'earnings',
        date: earningsDate instanceof Date ? earningsDate : new Date(earningsDate),
        description: 'Earnings Report',
        estimatedEPS: calendarEvents.earnings.earningsAverage
      });
    }

    // Ex-dividend date
    if (calendarEvents.exDividendDate) {
      const exDivDate = calendarEvents.exDividendDate;
      events.push({
        type: 'dividend',
        date: exDivDate instanceof Date ? exDivDate : new Date(exDivDate),
        description: 'Ex-Dividend Date'
      });
    }

    // Dividend date
    if (calendarEvents.dividendDate) {
      const divDate = calendarEvents.dividendDate;
      events.push({
        type: 'dividend',
        date: divDate instanceof Date ? divDate : new Date(divDate),
        description: 'Dividend Payment Date'
      });
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Extract institutional ownership data
   */
  private extractInstitutionalOwnership(summary: any): MarketContext['institutionalOwnership'] {
    const institutions = summary.institutionOwnership?.ownershipList || [];
    const funds = summary.fundOwnership?.ownershipList || [];
    const breakdown = summary.majorHoldersBreakdown || {};

    const allHolders = [...institutions, ...funds]
      .sort((a: any, b: any) => b.position - a.position)
      .slice(0, 10)
      .map((holder: any) => ({
        organization: holder.organization,
        shares: holder.position,
        value: holder.value,
        percentHeld: holder.pctHeld * 100,
        reportDate: holder.reportDate ? new Date(holder.reportDate * 1000) : new Date()
      }));

    return {
      percentHeld: (breakdown.institutionsPercentHeld || 0) * 100,
      institutionsCount: breakdown.institutionsCount || institutions.length,
      topHolders: allHolders
    };
  }

  /**
   * Extract insider transactions
   */
  private extractInsiderTransactions(insiderData: any): MarketContext['insiderTransactions'] {
    const transactions = insiderData.transactions || [];

    const recentTransactions: InsiderTransaction[] = transactions
      .slice(0, 10)
      .map((txn: any) => ({
        filingDate: txn.startDate ? new Date(txn.startDate * 1000) : new Date(),
        transactionDate: txn.startDate ? new Date(txn.startDate * 1000) : new Date(),
        insiderName: txn.filerName || 'Unknown',
        position: txn.filerRelation,
        transactionType: this.categorizeTransactionType(txn.transactionText),
        shares: txn.shares || 0,
        value: txn.value || 0,
        sharesOwned: txn.ownership
      }));

    // Calculate net insider activity
    const netActivity = recentTransactions.reduce((sum, txn) => {
      const multiplier = txn.transactionType === 'Buy' ? 1 : txn.transactionType === 'Sell' ? -1 : 0;
      return sum + (txn.value * multiplier);
    }, 0);

    return {
      netInsiderActivity: netActivity,
      recentTransactions
    };
  }

  /**
   * Categorize transaction type from text
   */
  private categorizeTransactionType(text: string): 'Buy' | 'Sell' | 'Option Exercise' | 'Other' {
    const lowerText = (text || '').toLowerCase();
    if (lowerText.includes('buy') || lowerText.includes('purchase')) {
      return 'Buy';
    }
    if (lowerText.includes('sell') || lowerText.includes('sale')) {
      return 'Sell';
    }
    if (lowerText.includes('option') || lowerText.includes('exercise')) {
      return 'Option Exercise';
    }
    return 'Other';
  }

  /**
   * Extract short interest data
   */
  private extractShortInterest(keyStats: any): MarketContext['shortInterest'] {
    return {
      shortRatio: keyStats.shortRatio,
      shortPercentOfFloat: keyStats.shortPercentOfFloat ? keyStats.shortPercentOfFloat * 100 : undefined,
      sharesShort: keyStats.sharesShort,
      dateShortInterest: keyStats.dateShortInterest ? new Date(keyStats.dateShortInterest * 1000) : undefined
    };
  }

  /**
   * Extract analyst ratings
   */
  private extractAnalystRatings(summary: any): MarketContext['analystRatings'] {
    const recommendation = summary.recommendationTrend?.trend?.[0];
    const financial = summary.financialData || {};

    if (!recommendation) {
      return {
        strongBuy: 0,
        buy: 0,
        hold: 0,
        sell: 0,
        strongSell: 0,
        consensusRating: financial.recommendationKey || 'none'
      };
    }

    return {
      strongBuy: recommendation.strongBuy || 0,
      buy: recommendation.buy || 0,
      hold: recommendation.hold || 0,
      sell: recommendation.sell || 0,
      strongSell: recommendation.strongSell || 0,
      consensusRating: financial.recommendationKey || 'hold'
    };
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
      relatedTickers: article.relatedTickers,
      summary: article.summary,
      uuid: article.uuid,
      categories: this.categorizeNews(article)
    };
  }

  /**
   * Categorize news articles based on content
   */
  private categorizeNews(article: any): string[] {
    const categories: string[] = [];
    const title = (article.title || '').toLowerCase();

    // Earnings-related
    if (title.includes('earnings') || title.includes('revenue') || title.includes('profit') ||
        title.includes('results') || title.includes('q1') || title.includes('q2') ||
        title.includes('q3') || title.includes('q4') || title.includes('quarterly')) {
      categories.push('earnings');
    }

    // Product/innovation
    if (title.includes('launch') || title.includes('product') || title.includes('release') ||
        title.includes('unveil') || title.includes('announce') || title.includes('innovation')) {
      categories.push('product');
    }

    // M&A and deals
    if (title.includes('acquire') || title.includes('merger') || title.includes('acquisition') ||
        title.includes('buyout') || title.includes('deal') || title.includes('partnership')) {
      categories.push('mergers-acquisitions');
    }

    // Leadership/management
    if (title.includes('ceo') || title.includes('executive') || title.includes('board') ||
        title.includes('management') || title.includes('resign') || title.includes('appoint')) {
      categories.push('leadership');
    }

    // Legal/regulatory
    if (title.includes('lawsuit') || title.includes('regulation') || title.includes('sec') ||
        title.includes('investigation') || title.includes('fine') || title.includes('legal')) {
      categories.push('legal-regulatory');
    }

    // Analyst ratings
    if (title.includes('upgrade') || title.includes('downgrade') || title.includes('analyst') ||
        title.includes('rating') || title.includes('price target')) {
      categories.push('analyst-rating');
    }

    // Dividend news
    if (title.includes('dividend') || title.includes('payout') || title.includes('distribution')) {
      categories.push('dividend');
    }

    // Market movement
    if (title.includes('surge') || title.includes('plunge') || title.includes('rally') ||
        title.includes('tank') || title.includes('soar') || title.includes('drop')) {
      categories.push('price-movement');
    }

    // Competition
    if (title.includes('vs') || title.includes('versus') || title.includes('competitor') ||
        title.includes('competition') || title.includes('battle')) {
      categories.push('competition');
    }

    // General if no specific category
    if (categories.length === 0) {
      categories.push('general');
    }

    return categories;
  }
}

// Export singleton instance
export const yahooFinanceService = new YahooFinanceService();
