/**
 * News Impact Analysis Service
 *
 * Analyzes correlation between news events and stock price movements
 */

import { yahooFinanceService } from './yahoo-finance.js';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';
import { ErrorHandler, withRetry } from '../utils/error-handler.js';
import { NewsArticle } from '../types/market-data.js';

/**
 * Price impact data for a news event
 */
export interface NewsPriceImpact {
  newsTitle: string;
  newsPublisher: string;
  newsTimestamp: Date;
  newsCategories?: string[];

  // Price before news
  priceBeforeNews: number;

  // Short-term impact (1 hour after)
  priceAfter1Hour?: number;
  changeAfter1Hour?: number;
  changePercentAfter1Hour?: number;

  // Medium-term impact (1 day after)
  priceAfter1Day?: number;
  changeAfter1Day?: number;
  changePercentAfter1Day?: number;

  // Longer-term impact (1 week after)
  priceAfter1Week?: number;
  changeAfter1Week?: number;
  changePercentAfter1Week?: number;

  // Impact classification
  impactLevel: 'significant' | 'moderate' | 'minor' | 'negligible' | 'unknown';
  impactScore: number; // 0-100 score
  impactDirection: 'positive' | 'negative' | 'neutral';
}

/**
 * News impact analysis data
 */
export interface NewsImpactData {
  symbol: string;
  companyName: string;

  // Analysis timeframe
  analysisStartDate: Date;
  analysisEndDate: Date;
  newsArticleCount: number;

  // Individual news impacts
  newsImpacts: NewsPriceImpact[];

  // Aggregate statistics
  statistics: {
    significantImpacts: number;        // Count of significant price movements
    averageImpact1Hour: number;        // Average 1-hour price change
    averageImpact1Day: number;         // Average 1-day price change
    averageImpact1Week: number;        // Average 1-week price change
    positiveNewsCount: number;         // News with positive price impact
    negativeNewsCount: number;         // News with negative price impact
    neutralNewsCount: number;          // News with minimal impact
    correlationStrength: 'strong' | 'moderate' | 'weak' | 'none';
  };

  // Most impactful news
  topImpacts: {
    mostPositive?: NewsPriceImpact;
    mostNegative?: NewsPriceImpact;
    largestMove?: NewsPriceImpact;
  };

  timestamp: Date;
}

/**
 * News Impact Analysis Service
 */
export class NewsImpactService {
  private cache: CacheService;
  private yahooFinanceService: typeof yahooFinanceService;

  constructor() {
    this.cache = CacheService.getInstance();
    this.yahooFinanceService = yahooFinanceService;
  }

  /**
   * Analyze news impact on stock price
   */
  async analyzeNewsImpact(
    symbol: string,
    daysBack: number = 30,
    newsLimit: number = 20
  ): Promise<NewsImpactData> {
    const cacheKey = `${CachePrefix.QUOTE}:news-impact:${symbol.toLowerCase()}:${daysBack}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            // Get news articles
            const news = await this.yahooFinanceService.getNews(symbol, newsLimit);

            if (!news || news.length === 0) {
              throw new Error('No news articles found for symbol');
            }

            // Get current quote for company name
            const quote = await this.yahooFinanceService.getQuote(symbol);

            // Filter news within the analysis timeframe
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysBack);

            const recentNews = news.filter(article => {
              const publishTime = new Date(article.providerPublishTime);
              return publishTime >= startDate && publishTime <= endDate;
            });

            if (recentNews.length === 0) {
              throw new Error(`No news articles found in the last ${daysBack} days`);
            }

            // Get historical data for the analysis period (add extra days for lookback)
            const historicalStartDate = new Date(startDate);
            historicalStartDate.setDate(historicalStartDate.getDate() - 7); // Add 7 days buffer

            const historicalData = await this.yahooFinanceService.getHistorical({
              symbol,
              period1: historicalStartDate,
              period2: endDate,
              interval: '1d'
            });

            // Analyze impact for each news article
            const newsImpacts = await Promise.all(
              recentNews.map(article => this.analyzeArticleImpact(article, historicalData))
            );

            // Calculate statistics
            const statistics = this.calculateStatistics(newsImpacts);

            // Find top impacts
            const topImpacts = this.findTopImpacts(newsImpacts);

            return {
              symbol: quote.symbol,
              companyName: quote.longName || quote.shortName || quote.symbol,
              analysisStartDate: startDate,
              analysisEndDate: endDate,
              newsArticleCount: recentNews.length,
              newsImpacts,
              statistics,
              topImpacts,
              timestamp: new Date()
            };
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      CacheTTL.QUOTE // Cache for 5 minutes
    );
  }

  /**
   * Analyze price impact for a single news article
   */
  private analyzeArticleImpact(
    article: NewsArticle,
    historicalData: Array<{ date: Date; open: number; close: number; high: number; low: number; volume: number }>
  ): NewsPriceImpact {
    const newsTime = new Date(article.providerPublishTime);

    // Find the closest price before the news
    const priceBeforeNews = this.findPriceAtTime(historicalData, newsTime, 'before');

    // If we can't find a price, return unknown impact
    if (priceBeforeNews === null) {
      return {
        newsTitle: article.title,
        newsPublisher: article.publisher,
        newsTimestamp: newsTime,
        newsCategories: article.categories,
        priceBeforeNews: 0,
        impactLevel: 'unknown',
        impactScore: 0,
        impactDirection: 'neutral'
      };
    }

    // Find prices after news at different intervals
    const priceAfter1Hour = this.findPriceAtTime(
      historicalData,
      new Date(newsTime.getTime() + 60 * 60 * 1000),
      'after'
    );
    const priceAfter1Day = this.findPriceAtTime(
      historicalData,
      new Date(newsTime.getTime() + 24 * 60 * 60 * 1000),
      'after'
    );
    const priceAfter1Week = this.findPriceAtTime(
      historicalData,
      new Date(newsTime.getTime() + 7 * 24 * 60 * 60 * 1000),
      'after'
    );

    // Calculate changes
    const changeAfter1Hour = priceAfter1Hour !== null ? priceAfter1Hour - priceBeforeNews : undefined;
    const changePercentAfter1Hour =
      changeAfter1Hour !== undefined ? (changeAfter1Hour / priceBeforeNews) * 100 : undefined;

    const changeAfter1Day = priceAfter1Day !== null ? priceAfter1Day - priceBeforeNews : undefined;
    const changePercentAfter1Day =
      changeAfter1Day !== undefined ? (changeAfter1Day / priceBeforeNews) * 100 : undefined;

    const changeAfter1Week = priceAfter1Week !== null ? priceAfter1Week - priceBeforeNews : undefined;
    const changePercentAfter1Week =
      changeAfter1Week !== undefined ? (changeAfter1Week / priceBeforeNews) * 100 : undefined;

    // Determine impact level and direction
    const { impactLevel, impactScore, impactDirection } = this.classifyImpact(
      changePercentAfter1Hour,
      changePercentAfter1Day,
      changePercentAfter1Week
    );

    return {
      newsTitle: article.title,
      newsPublisher: article.publisher,
      newsTimestamp: newsTime,
      newsCategories: article.categories,
      priceBeforeNews,
      priceAfter1Hour: priceAfter1Hour ?? undefined,
      changeAfter1Hour,
      changePercentAfter1Hour,
      priceAfter1Day: priceAfter1Day ?? undefined,
      changeAfter1Day,
      changePercentAfter1Day,
      priceAfter1Week: priceAfter1Week ?? undefined,
      changeAfter1Week,
      changePercentAfter1Week,
      impactLevel,
      impactScore,
      impactDirection
    };
  }

  /**
   * Find price at a specific time from historical data
   */
  private findPriceAtTime(
    historicalData: Array<{ date: Date; open: number; close: number; high: number; low: number }>,
    targetTime: Date,
    direction: 'before' | 'after'
  ): number | null {
    if (historicalData.length === 0) {
      return null;
    }

    // Sort data by date
    const sorted = [...historicalData].sort((a, b) => a.date.getTime() - b.date.getTime());

    if (direction === 'before') {
      // Find the latest data point before the target time
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].date <= targetTime) {
          return sorted[i].close;
        }
      }
      // If no data before, return the earliest close price
      return sorted[0].close;
    } else {
      // Find the earliest data point after the target time
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].date >= targetTime) {
          return sorted[i].close;
        }
      }
      // If no data after, return the latest close price
      return sorted[sorted.length - 1].close;
    }
  }

  /**
   * Classify the impact of news on price
   */
  private classifyImpact(
    changePercent1Hour?: number,
    changePercent1Day?: number,
    changePercent1Week?: number
  ): {
    impactLevel: 'significant' | 'moderate' | 'minor' | 'negligible' | 'unknown';
    impactScore: number;
    impactDirection: 'positive' | 'negative' | 'neutral';
  } {
    // Use the most reliable metric (prioritize 1-day over 1-hour over 1-week)
    const primaryChange = changePercent1Day ?? changePercent1Hour ?? changePercent1Week;

    if (primaryChange === undefined) {
      return { impactLevel: 'unknown', impactScore: 0, impactDirection: 'neutral' };
    }

    // Calculate absolute change for scoring
    const absChange = Math.abs(primaryChange);

    // Determine impact level
    let impactLevel: 'significant' | 'moderate' | 'minor' | 'negligible';
    let impactScore: number;

    if (absChange >= 5) {
      impactLevel = 'significant';
      impactScore = Math.min(100, 70 + absChange * 3);
    } else if (absChange >= 2) {
      impactLevel = 'moderate';
      impactScore = 40 + absChange * 10;
    } else if (absChange >= 0.5) {
      impactLevel = 'minor';
      impactScore = 15 + absChange * 20;
    } else {
      impactLevel = 'negligible';
      impactScore = absChange * 30;
    }

    // Determine direction
    const impactDirection = primaryChange > 0.1 ? 'positive' : primaryChange < -0.1 ? 'negative' : 'neutral';

    return { impactLevel, impactScore, impactDirection };
  }

  /**
   * Calculate aggregate statistics
   */
  private calculateStatistics(newsImpacts: NewsPriceImpact[]): NewsImpactData['statistics'] {
    const validImpacts1Hour = newsImpacts.filter(ni => ni.changePercentAfter1Hour !== undefined);
    const validImpacts1Day = newsImpacts.filter(ni => ni.changePercentAfter1Day !== undefined);
    const validImpacts1Week = newsImpacts.filter(ni => ni.changePercentAfter1Week !== undefined);

    const averageImpact1Hour =
      validImpacts1Hour.length > 0
        ? validImpacts1Hour.reduce((sum, ni) => sum + (ni.changePercentAfter1Hour || 0), 0) /
          validImpacts1Hour.length
        : 0;

    const averageImpact1Day =
      validImpacts1Day.length > 0
        ? validImpacts1Day.reduce((sum, ni) => sum + (ni.changePercentAfter1Day || 0), 0) / validImpacts1Day.length
        : 0;

    const averageImpact1Week =
      validImpacts1Week.length > 0
        ? validImpacts1Week.reduce((sum, ni) => sum + (ni.changePercentAfter1Week || 0), 0) /
          validImpacts1Week.length
        : 0;

    const significantImpacts = newsImpacts.filter(ni => ni.impactLevel === 'significant').length;
    const positiveNewsCount = newsImpacts.filter(ni => ni.impactDirection === 'positive').length;
    const negativeNewsCount = newsImpacts.filter(ni => ni.impactDirection === 'negative').length;
    const neutralNewsCount = newsImpacts.filter(ni => ni.impactDirection === 'neutral').length;

    // Determine correlation strength based on significant impacts and average changes
    const avgAbsChange = (Math.abs(averageImpact1Hour) + Math.abs(averageImpact1Day) + Math.abs(averageImpact1Week)) / 3;
    const significantRatio = newsImpacts.length > 0 ? significantImpacts / newsImpacts.length : 0;

    let correlationStrength: 'strong' | 'moderate' | 'weak' | 'none';
    if (avgAbsChange >= 3 || significantRatio >= 0.3) {
      correlationStrength = 'strong';
    } else if (avgAbsChange >= 1.5 || significantRatio >= 0.15) {
      correlationStrength = 'moderate';
    } else if (avgAbsChange >= 0.5 || significantRatio >= 0.05) {
      correlationStrength = 'weak';
    } else {
      correlationStrength = 'none';
    }

    return {
      significantImpacts,
      averageImpact1Hour,
      averageImpact1Day,
      averageImpact1Week,
      positiveNewsCount,
      negativeNewsCount,
      neutralNewsCount,
      correlationStrength
    };
  }

  /**
   * Find the most impactful news articles
   */
  private findTopImpacts(newsImpacts: NewsPriceImpact[]): NewsImpactData['topImpacts'] {
    if (newsImpacts.length === 0) {
      return {};
    }

    // Find most positive (largest positive change)
    const mostPositive = newsImpacts
      .filter(ni => ni.changePercentAfter1Day !== undefined)
      .sort((a, b) => (b.changePercentAfter1Day || 0) - (a.changePercentAfter1Day || 0))[0];

    // Find most negative (largest negative change)
    const mostNegative = newsImpacts
      .filter(ni => ni.changePercentAfter1Day !== undefined)
      .sort((a, b) => (a.changePercentAfter1Day || 0) - (b.changePercentAfter1Day || 0))[0];

    // Find largest move (absolute)
    const largestMove = newsImpacts
      .filter(ni => ni.changePercentAfter1Day !== undefined)
      .sort((a, b) => Math.abs(b.changePercentAfter1Day || 0) - Math.abs(a.changePercentAfter1Day || 0))[0];

    return {
      mostPositive: mostPositive && mostPositive.changePercentAfter1Day !== undefined && mostPositive.changePercentAfter1Day > 0 ? mostPositive : undefined,
      mostNegative: mostNegative && mostNegative.changePercentAfter1Day !== undefined && mostNegative.changePercentAfter1Day < 0 ? mostNegative : undefined,
      largestMove
    };
  }
}

/**
 * Singleton instance
 */
export const newsImpactService = new NewsImpactService();
