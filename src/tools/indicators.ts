/**
 * Technical indicators tool for calculating various indicators
 */

import { indicatorService } from '../services/indicators.js';
import { calculateIndicatorInputSchema, validateInput } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Calculate indicator tool definition
 */
export const calculateIndicatorTool = {
  name: 'calculate_indicator',
  description:
    'Calculate technical indicators on price data for a stock or cryptocurrency. Supports RSI, MACD, SMA, EMA, Bollinger Bands, and Stochastic oscillator. Returns calculated values with timestamps and trading signals where applicable.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Ticker symbol (e.g., AAPL, BTC-USD, MSFT)'
      },
      indicator: {
        type: 'string',
        enum: ['rsi', 'macd', 'sma', 'ema', 'bollinger_bands', 'stochastic'],
        description:
          'Technical indicator to calculate:\n' +
          '- rsi: Relative Strength Index (momentum oscillator, 0-100)\n' +
          '- macd: Moving Average Convergence Divergence (trend following)\n' +
          '- sma: Simple Moving Average (trend indicator)\n' +
          '- ema: Exponential Moving Average (trend indicator, more responsive)\n' +
          '- bollinger_bands: Bollinger Bands (volatility indicator)\n' +
          '- stochastic: Stochastic Oscillator (momentum indicator)'
      },
      period: {
        type: 'number',
        description:
          'Lookback period for calculation (default varies by indicator: RSI=14, SMA/EMA=20, Bollinger Bands=20, Stochastic=14, MACD=12 for fast period)'
      },
      interval: {
        type: 'string',
        enum: ['1m', '5m', '15m', '30m', '1h', '1d', '1wk', '1mo'],
        description:
          'Data interval for calculations (default: 1d for daily data)'
      },
      startDate: {
        type: 'string',
        description:
          'Start date for historical data (optional, defaults to sufficient data for indicator)'
      }
    },
    required: ['symbol', 'indicator']
  }
};

/**
 * Handle calculate indicator request
 */
export async function handleCalculateIndicator(args: unknown) {
  try {
    const { symbol, indicator, period, interval, startDate } = validateInput(
      calculateIndicatorInputSchema,
      args
    );

    const result = await indicatorService.calculateIndicator({
      symbol,
      indicator,
      period,
      interval,
      startDate: startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate
    });

    return {
      ...result,
      dataPoints: result.values.length,
      latestValue: result.values[result.values.length - 1]
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
