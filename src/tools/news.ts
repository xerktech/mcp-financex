/**
 * Market news tool for retrieving news articles
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
    'Retrieve recent news articles for a specific ticker symbol or general market news. Returns article titles, summaries, publishers, publish dates, and links. Useful for sentiment analysis and staying informed about market events.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Ticker symbol for company-specific news (e.g., AAPL, MSFT). Omit for general market news.'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of articles to return (default: 10, max: 50)',
        minimum: 1,
        maximum: 50
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
    const { symbol, limit } = validateInput(getMarketNewsInputSchema, args);

    const news = await yahooFinanceService.getNews(symbol, limit);

    return {
      symbol: symbol || 'market',
      articleCount: news.length,
      articles: news
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
