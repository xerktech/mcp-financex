/**
 * Market news and context tool for comprehensive company analysis
 */

import { yahooFinanceService } from '../services/yahoo-finance.js';
import { getMarketNewsInputSchema, validateInput } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Get market news tool definition
 */
export const getMarketNewsTool = {
  name: 'get_market_news',
  description:
    'Retrieve comprehensive market intelligence for a ticker symbol or general market news. ' +
    'When a symbol is provided with comprehensive=true, returns detailed context including: ' +
    '- Recent news articles with automatic categorization (earnings, M&A, legal, analyst ratings, etc.) ' +
    '- Company fundamentals (valuation metrics, profitability, growth, financial health) ' +
    '- Analyst ratings and price targets ' +
    '- Upcoming events (earnings dates, dividends, splits) ' +
    '- Institutional ownership and top holders ' +
    '- Insider transactions and net insider activity ' +
    '- Short interest and options activity (volatility indicators) ' +
    '- Sector and industry context ' +
    'This comprehensive view helps LLMs understand factors affecting volatility and future price movements. ' +
    'For basic news only, set comprehensive=false.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Ticker symbol for company-specific intelligence (e.g., AAPL, MSFT). Omit for general market news.'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of news articles to return (default: 20 for comprehensive, 10 for basic, max: 50)',
        minimum: 1,
        maximum: 50
      },
      comprehensive: {
        type: 'boolean',
        description:
          'When true and symbol is provided, returns comprehensive market context including fundamentals, ' +
          'analyst ratings, upcoming events, institutional holdings, insider transactions, short interest, ' +
          'and categorized news. When false, returns only news articles. Default: true if symbol provided, false otherwise.',
        default: true
      }
    },
    required: []
  }
};

/**
 * Handle get market news request
 */
export async function handleGetMarketNews(args: unknown) {
  try {
    const { symbol, limit, comprehensive } = validateInput(getMarketNewsInputSchema, args);

    // Determine if we should fetch comprehensive data
    const shouldFetchComprehensive = comprehensive !== false && !!symbol;
    const articleLimit = limit || (shouldFetchComprehensive ? 20 : 10);

    if (shouldFetchComprehensive) {
      // Fetch comprehensive market context
      const context = await yahooFinanceService.getMarketContext(symbol!, articleLimit);

      return {
        symbol: symbol!,
        timestamp: context.timestamp,
        comprehensive: true,

        // Company profile
        profile: context.profile,

        // News with categories
        news: {
          articleCount: context.newsCount,
          articles: context.recentNews,
          categories: extractUniqueCategories(context.recentNews)
        },

        // Financial fundamentals
        fundamentals: context.fundamentals,

        // Upcoming catalysts
        upcomingEvents: context.upcomingEvents,

        // Analyst sentiment
        analystRatings: context.analystRatings,

        // Ownership data
        institutionalOwnership: context.institutionalOwnership,
        insiderActivity: context.insiderTransactions,

        // Volatility indicators
        shortInterest: context.shortInterest,
        optionsActivity: context.optionsActivity,

        // Market context
        sectorPerformance: context.sectorPerformance,
        relatedCompanies: context.relatedCompanies
      };
    } else {
      // Fetch basic news only
      const news = await yahooFinanceService.getNews(symbol, articleLimit);

      return {
        symbol: symbol || 'market',
        comprehensive: false,
        articleCount: news.length,
        articles: news,
        categories: extractUniqueCategories(news)
      };
    }
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Extract unique categories from news articles
 */
function extractUniqueCategories(articles: any[]): string[] {
  const categoriesSet = new Set<string>();
  articles.forEach(article => {
    article.categories?.forEach((cat: string) => categoriesSet.add(cat));
  });
  return Array.from(categoriesSet).sort();
}
