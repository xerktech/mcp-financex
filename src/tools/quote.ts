/**
 * Quote tools for fetching real-time stock and crypto prices
 */

import { yahooFinanceService } from '../services/yahoo-finance.js';
import {
  getQuoteInputSchema,
  getBatchQuoteInputSchema,
  validateInput
} from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Get quote tool definition
 */
export const getQuoteTool = {
  name: 'get_quote',
  description:
    'Get real-time price quote for a stock or cryptocurrency ticker. Returns current price, change, volume, market cap, and other market data. Examples: AAPL (Apple), BTC-USD (Bitcoin), MSFT (Microsoft).',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Ticker symbol (e.g., AAPL for Apple, BTC-USD for Bitcoin, MSFT for Microsoft)'
      },
      fields: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: specific fields to return (e.g., ["regularMarketPrice", "marketCap"])'
      }
    },
    required: ['symbol']
  }
};

/**
 * Handle get quote request
 */
export async function handleGetQuote(args: unknown) {
  try {
    const { symbol, fields } = validateInput(getQuoteInputSchema, args);

    const quote = await yahooFinanceService.getQuote(symbol);

    // Filter fields if specified
    if (fields && fields.length > 0) {
      const filtered: any = { symbol: quote.symbol };
      fields.forEach(field => {
        if (field in quote) {
          filtered[field] = quote[field as keyof typeof quote];
        }
      });
      return filtered;
    }

    return quote;
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Get batch quote tool definition
 */
export const getBatchQuoteTool = {
  name: 'get_quote_batch',
  description:
    'Get real-time quotes for multiple stock or cryptocurrency tickers efficiently in a single request. Returns quotes for all symbols with error handling for invalid symbols.',
  inputSchema: {
    type: 'object',
    properties: {
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of ticker symbols (e.g., ["AAPL", "MSFT", "BTC-USD", "GOOGL"]). Maximum 50 symbols.'
      }
    },
    required: ['symbols']
  }
};

/**
 * Handle batch quote request
 */
export async function handleGetBatchQuote(args: unknown) {
  try {
    const { symbols } = validateInput(getBatchQuoteInputSchema, args);

    const result = await yahooFinanceService.getQuoteBatch(symbols);

    return result;
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
