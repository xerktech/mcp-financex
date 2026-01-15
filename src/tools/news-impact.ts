/**
 * News Impact Analysis Tool
 */

import { newsImpactService, NewsPriceImpact } from '../services/news-impact.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for news impact analysis
 */
export const analyzeNewsImpactTool = {
  name: 'analyze_news_impact',
  description:
    'News Impact Analysis | Price Movement Correlation | Event-Driven Trading - ' +
    'Analyze how news events affect stock prices over time. Correlates news articles with ' +
    'price movements to identify which news has the most significant impact on stock performance. ' +
    '\n\n**Key Metrics:**\n' +
    '- **Short-Term Impact (1 Hour)**: Immediate price reaction to news\n' +
    '- **Medium-Term Impact (1 Day)**: Daily price movement after news\n' +
    '- **Long-Term Impact (1 Week)**: Extended price trend following news\n' +
    '- **Impact Score**: 0-100 score indicating magnitude of price movement\n' +
    '- **Impact Direction**: Positive, negative, or neutral price impact\n' +
    '- **Correlation Strength**: Overall news-price correlation (strong/moderate/weak/none)\n' +
    '\n**Impact Classification:**\n' +
    '- **Significant**: ≥5% price movement (Score: 70-100)\n' +
    '- **Moderate**: 2-5% price movement (Score: 40-69)\n' +
    '- **Minor**: 0.5-2% price movement (Score: 15-39)\n' +
    '- **Negligible**: <0.5% price movement (Score: 0-14)\n' +
    '\n**Use Cases:**\n' +
    '- "How does news affect Tesla stock price?"\n' +
    '- "Which news had the biggest impact on AAPL?"\n' +
    '- "Analyze news correlation for Microsoft"\n' +
    '- "Show me price movements after earnings news"\n' +
    '- "What news caused the biggest price drop for NVDA?"\n' +
    '\n**Why It Matters:**\n' +
    'News impact analysis helps:\n' +
    '- **Event-Driven Trading**: Identify patterns in news-driven price movements\n' +
    '- **Risk Management**: Understand how different news types affect volatility\n' +
    '- **Trading Strategy**: Time entry/exit based on news impact patterns\n' +
    '- **Market Sentiment**: Gauge how market reacts to different news categories\n' +
    '\n**Analysis Insights:**\n' +
    '- Aggregate statistics across all news events\n' +
    '- Most positive and negative impact events\n' +
    '- Correlation between news frequency and price volatility\n' +
    '- Category-specific impact patterns (earnings, M&A, analyst ratings, etc.)\n' +
    '\n**Important Notes:**\n' +
    '- Correlation does not imply causation - other factors may influence price\n' +
    '- Market-wide events can affect all stocks simultaneously\n' +
    '- Low-volume stocks may show exaggerated price impacts\n' +
    '- Some news may be priced in before official publication\n' +
    '\n**Returns:** Individual news impacts, aggregate statistics, top impacts, correlation strength, and event analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to analyze news impact for (e.g., "AAPL", "TSLA"). ' +
          'The analysis will cover recent news and corresponding price movements.'
      },
      days_back: {
        type: 'number',
        description:
          'Number of days to look back for news analysis (default: 30, max: 90). ' +
          'Longer periods provide more data but may include less relevant events.',
        minimum: 1,
        maximum: 90,
        default: 30
      },
      news_limit: {
        type: 'number',
        description:
          'Maximum number of news articles to analyze (default: 20, max: 50). ' +
          'More articles provide better statistical analysis but take longer to process.',
        minimum: 5,
        maximum: 50,
        default: 20
      }
    },
    required: ['symbol']
  }
};

/**
 * Handle news impact analysis request
 */
export async function handleAnalyzeNewsImpact(args: unknown) {
  try {
    const { symbol, days_back = 30, news_limit = 20 } = args as {
      symbol: string;
      days_back?: number;
      news_limit?: number;
    };

    if (!symbol) {
      throw new Error('symbol parameter is required');
    }

    // Validate parameters
    const daysBack = Math.min(90, Math.max(1, days_back));
    const newsLimit = Math.min(50, Math.max(5, news_limit));

    const data = await newsImpactService.analyzeNewsImpact(symbol, daysBack, newsLimit);

    return {
      symbol: data.symbol,
      companyName: data.companyName,

      // Analysis timeframe
      analysisTimeframe: {
        startDate: data.analysisStartDate,
        endDate: data.analysisEndDate,
        daysAnalyzed: daysBack,
        newsArticlesAnalyzed: data.newsArticleCount
      },

      // Overall statistics
      overallStatistics: {
        correlationStrength: data.statistics.correlationStrength,
        correlationInterpretation: interpretCorrelation(
          data.statistics.correlationStrength,
          data.statistics.significantImpacts,
          data.newsArticleCount
        ),
        significantImpacts: data.statistics.significantImpacts,
        averageImpact1Hour: data.statistics.averageImpact1Hour,
        averageImpact1Day: data.statistics.averageImpact1Day,
        averageImpact1Week: data.statistics.averageImpact1Week,
        impactDistribution: {
          positiveNews: data.statistics.positiveNewsCount,
          negativeNews: data.statistics.negativeNewsCount,
          neutralNews: data.statistics.neutralNewsCount
        }
      },

      // Top impact events
      topImpactEvents: {
        mostPositiveImpact: data.topImpacts.mostPositive
          ? formatImpactEvent(data.topImpacts.mostPositive, 'most positive')
          : undefined,
        mostNegativeImpact: data.topImpacts.mostNegative
          ? formatImpactEvent(data.topImpacts.mostNegative, 'most negative')
          : undefined,
        largestAbsoluteMove: data.topImpacts.largestMove
          ? formatImpactEvent(data.topImpacts.largestMove, 'largest move')
          : undefined
      },

      // Individual news impacts
      newsImpacts: data.newsImpacts.map(impact => ({
        news: {
          title: impact.newsTitle,
          publisher: impact.newsPublisher,
          timestamp: impact.newsTimestamp,
          categories: impact.newsCategories
        },
        priceData: {
          priceBeforeNews: impact.priceBeforeNews,
          priceAfter1Hour: impact.priceAfter1Hour,
          priceAfter1Day: impact.priceAfter1Day,
          priceAfter1Week: impact.priceAfter1Week
        },
        priceChanges: {
          after1Hour: {
            change: impact.changeAfter1Hour,
            changePercent: impact.changePercentAfter1Hour
          },
          after1Day: {
            change: impact.changeAfter1Day,
            changePercent: impact.changePercentAfter1Day
          },
          after1Week: {
            change: impact.changeAfter1Week,
            changePercent: impact.changePercentAfter1Week
          }
        },
        impact: {
          level: impact.impactLevel,
          score: impact.impactScore,
          direction: impact.impactDirection,
          interpretation: interpretImpact(impact)
        }
      })),

      timestamp: data.timestamp
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Interpret correlation strength for users
 */
function interpretCorrelation(
  strength: 'strong' | 'moderate' | 'weak' | 'none',
  significantImpacts: number,
  totalNews: number
): string {
  const significantPercent = totalNews > 0 ? (significantImpacts / totalNews) * 100 : 0;

  if (strength === 'strong') {
    return (
      `STRONG CORRELATION: News events have a significant impact on price movements. ` +
      `${significantImpacts} out of ${totalNews} news events (${significantPercent.toFixed(1)}%) ` +
      `caused significant price changes (≥5%). This stock is highly news-sensitive.`
    );
  }

  if (strength === 'moderate') {
    return (
      `MODERATE CORRELATION: News events have a noticeable effect on prices. ` +
      `${significantImpacts} significant impacts detected. The stock shows moderate news sensitivity. ` +
      `Major news events tend to move the stock, but not all news has substantial impact.`
    );
  }

  if (strength === 'weak') {
    return (
      `WEAK CORRELATION: News events have limited impact on price movements. ` +
      `Only ${significantImpacts} significant price changes detected. The stock may be more influenced ` +
      `by broader market trends, technical factors, or is less reactive to news.`
    );
  }

  return (
    `NO CORRELATION: Very little connection between news and price movements detected. ` +
    `The stock appears relatively insensitive to news events, possibly due to low volatility, ` +
    `strong fundamental stability, or market factors dominating price action.`
  );
}

/**
 * Format impact event for display
 */
function formatImpactEvent(impact: NewsPriceImpact, eventType: string): object {
  return {
    eventType,
    title: impact.newsTitle,
    publisher: impact.newsPublisher,
    timestamp: impact.newsTimestamp,
    categories: impact.newsCategories,
    priceBeforeNews: impact.priceBeforeNews,
    priceAfter1Day: impact.priceAfter1Day,
    changePercent: impact.changePercentAfter1Day,
    impactLevel: impact.impactLevel,
    impactScore: impact.impactScore,
    impactDirection: impact.impactDirection
  };
}

/**
 * Interpret individual news impact for users
 */
function interpretImpact(impact: NewsPriceImpact): string {
  if (impact.impactLevel === 'unknown') {
    return 'IMPACT UNKNOWN: Insufficient price data available to assess the impact of this news.';
  }

  const primaryChange = impact.changePercentAfter1Day ?? impact.changePercentAfter1Hour;
  if (primaryChange === undefined) {
    return 'IMPACT UNAVAILABLE: No price data available for impact analysis.';
  }

  const absChange = Math.abs(primaryChange);
  const direction = impact.impactDirection === 'positive' ? 'increased' : 'decreased';
  const timeframe = impact.changePercentAfter1Day !== undefined ? '1 day' : '1 hour';

  if (impact.impactLevel === 'significant') {
    return (
      `SIGNIFICANT IMPACT (Score: ${impact.impactScore.toFixed(0)}): Stock price ${direction} by ` +
      `${absChange.toFixed(2)}% within ${timeframe} of this news. This represents a major price movement ` +
      `likely driven by the news event.`
    );
  }

  if (impact.impactLevel === 'moderate') {
    return (
      `MODERATE IMPACT (Score: ${impact.impactScore.toFixed(0)}): Stock price ${direction} by ` +
      `${absChange.toFixed(2)}% within ${timeframe}. Noticeable price movement that may be partially ` +
      `attributable to this news event.`
    );
  }

  if (impact.impactLevel === 'minor') {
    return (
      `MINOR IMPACT (Score: ${impact.impactScore.toFixed(0)}): Stock price ${direction} by ` +
      `${absChange.toFixed(2)}% within ${timeframe}. Small price movement that could be related to ` +
      `the news or general market activity.`
    );
  }

  return (
    `NEGLIGIBLE IMPACT (Score: ${impact.impactScore.toFixed(0)}): Stock price changed by only ` +
    `${absChange.toFixed(2)}% within ${timeframe}. This news appears to have had minimal effect on ` +
    `the stock price.`
  );
}
