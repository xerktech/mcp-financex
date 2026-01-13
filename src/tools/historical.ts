/**
 * Historical data tool for retrieving OHLCV data
 */

import { yahooFinanceService } from '../services/yahoo-finance.js';
import { getHistoricalInputSchema, validateInput } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Get historical data tool definition
 */
export const getHistoricalTool = {
  name: 'get_historical_data',
  description:
    'Retrieve historical OHLCV (Open, High, Low, Close, Volume) price data for a stock or cryptocurrency. Supports various time intervals from 1 minute to 1 month. Useful for charting and technical analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Ticker symbol (e.g., AAPL, BTC-USD, MSFT)'
      },
      period1: {
        type: 'string',
        description:
          'Start date/period. Can be ISO date (YYYY-MM-DD), relative period (1d, 7d, 1mo, 3mo, 1y), or timestamp.'
      },
      period2: {
        type: 'string',
        description:
          'End date/period (optional, defaults to now). Can be ISO date (YYYY-MM-DD), relative period, or timestamp.'
      },
      interval: {
        type: 'string',
        enum: ['1m', '5m', '15m', '30m', '1h', '1d', '1wk', '1mo'],
        description:
          'Data interval: 1m=1 minute, 5m=5 minutes, 15m=15 minutes, 30m=30 minutes, 1h=1 hour, 1d=1 day, 1wk=1 week, 1mo=1 month'
      }
    },
    required: ['symbol', 'period1', 'interval']
  }
};

/**
 * Handle get historical data request
 */
export async function handleGetHistorical(args: unknown) {
  try {
    const { symbol, period1, period2, interval } = validateInput(
      getHistoricalInputSchema,
      args
    );

    const data = await yahooFinanceService.getHistorical({
      symbol,
      period1,
      period2,
      interval
    });

    return {
      symbol,
      interval,
      dataPoints: data.length,
      data
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
