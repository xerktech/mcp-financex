/**
 * Search tool for finding ticker symbols
 */

import { yahooFinanceService } from '../services/yahoo-finance.js';
import { searchTickerInputSchema, validateInput } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Search ticker tool definition
 */
export const searchTickerTool = {
  name: 'search_ticker',
  description:
    'Search for stock or cryptocurrency ticker symbols by company name, keyword, or partial symbol. Returns matching tickers with their full names, exchanges, and types. Useful for finding the correct ticker symbol when you know the company name.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query - can be company name (e.g., "Apple"), partial symbol (e.g., "AAPL"), or keyword (e.g., "electric vehicle")'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10, max: 50)',
        minimum: 1,
        maximum: 50
      }
    },
    required: ['query']
  }
};

/**
 * Handle search ticker request
 */
export async function handleSearchTicker(args: unknown) {
  try {
    const { query, limit } = validateInput(searchTickerInputSchema, args);

    const results = await yahooFinanceService.search(query, limit);

    return {
      query,
      resultsCount: results.length,
      results
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
