/**
 * Options trading tools
 */

import { z } from 'zod';
import { optionsService } from '../services/options.js';
import { greeksCalculator } from '../services/greeks.js';
import { strategyAnalyzer } from '../services/strategy.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { symbolSchema } from '../utils/validators.js';

// ============================================================================
// Input Schemas
// ============================================================================

const getOptionsChainInputSchema = z.object({
  symbol: symbolSchema,
  expirationDate: z.string().optional()
});

const getEarningsCalendarInputSchema = z.object({
  symbol: symbolSchema.optional(),
  daysAhead: z.number().int().positive().max(365).optional()
});

const getDividendInfoInputSchema = z.object({
  symbol: symbolSchema
});

const calculateGreeksInputSchema = z.object({
  symbol: symbolSchema,
  strike: z.number().positive(),
  expirationDate: z.string(),
  optionType: z.enum(['call', 'put']),
  underlyingPrice: z.number().positive().optional(),
  riskFreeRate: z.number().min(0).max(1).optional(),
  dividendYield: z.number().min(0).max(1).optional()
});

const calculateHistoricalVolatilityInputSchema = z.object({
  symbol: symbolSchema,
  periods: z.array(z.number().int().positive()).optional()
});

const calculateMaxPainInputSchema = z.object({
  symbol: symbolSchema,
  expirationDate: z.string().optional()
});

const getImpliedVolatilityInputSchema = z.object({
  symbol: symbolSchema
});

const analyzeOptionsStrategyInputSchema = z.object({
  symbol: symbolSchema,
  strategy: z.enum([
    'call',
    'put',
    'covered_call',
    'protective_put',
    'bull_call_spread',
    'bear_put_spread',
    'bull_put_spread',
    'bear_call_spread',
    'long_straddle',
    'short_straddle',
    'long_strangle',
    'short_strangle',
    'iron_condor',
    'iron_butterfly',
    'butterfly_spread',
    'calendar_spread',
    'diagonal_spread'
  ]),
  legs: z.array(
    z.object({
      strike: z.number().positive(),
      optionType: z.enum(['call', 'put']),
      action: z.enum(['buy', 'sell']),
      quantity: z.number().int().positive(),
      premium: z.number().optional()
    })
  ),
  expirationDate: z.string()
});

// ============================================================================
// Tool Definitions & Handlers
// ============================================================================

/**
 * Get options chain tool
 */
export const getOptionsChainTool = {
  name: 'get_options_chain',
  description:
    'Get options chain data for a stock including all available calls and puts with strikes, premiums, volume, open interest, and implied volatility. Useful for analyzing available options contracts and their prices.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol (e.g., AAPL, MSFT)'
      },
      expirationDate: {
        type: 'string',
        description:
          'Expiration date in YYYY-MM-DD format (optional, defaults to nearest expiration)'
      }
    },
    required: ['symbol']
  }
};

export async function handleGetOptionsChain(args: unknown) {
  try {
    const { symbol, expirationDate } = getOptionsChainInputSchema.parse(args);
    const chain = await optionsService.getOptionsChain(symbol, expirationDate);

    return {
      symbol: chain.symbol,
      expirationDate: chain.expirationDate,
      underlyingPrice: chain.underlyingPrice,
      callsCount: chain.calls.length,
      putsCount: chain.puts.length,
      calls: chain.calls,
      puts: chain.puts,
      timestamp: chain.timestamp
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Get earnings calendar tool
 */
export const getEarningsCalendarTool = {
  name: 'get_earnings_calendar',
  description:
    'Get upcoming earnings dates and historical earnings data for a stock. Earnings announcements significantly impact options pricing due to increased volatility. Returns earnings dates, estimates, and historical results.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol (optional, omit for market-wide calendar)'
      },
      daysAhead: {
        type: 'number',
        description: 'Number of days ahead to look (default: 30, max: 365)'
      }
    },
    required: []
  }
};

export async function handleGetEarningsCalendar(args: unknown) {
  try {
    const { symbol, daysAhead } = getEarningsCalendarInputSchema.parse(args);
    const events = await optionsService.getEarningsCalendar(symbol, daysAhead);

    return {
      symbol: symbol || 'market',
      eventsCount: events.length,
      events
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Get dividend info tool
 */
export const getDividendInfoTool = {
  name: 'get_dividend_info',
  description:
    'Get dividend information for a stock including dividend rate, yield, ex-dividend date, and payout ratio. Dividends affect options pricing, especially for calls around ex-dividend dates.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol (e.g., AAPL, MSFT)'
      }
    },
    required: ['symbol']
  }
};

export async function handleGetDividendInfo(args: unknown) {
  try {
    const { symbol } = getDividendInfoInputSchema.parse(args);
    const dividendInfo = await optionsService.getDividendInfo(symbol);

    return dividendInfo;
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Calculate Greeks tool
 */
export const calculateGreeksTool = {
  name: 'calculate_greeks',
  description:
    'Calculate option Greeks (Delta, Gamma, Theta, Vega, Rho) using the Black-Scholes model. Greeks measure risk and sensitivity:\n' +
    '- Delta: Price change per $1 move in underlying (0-1 for calls, -1-0 for puts)\n' +
    '- Gamma: Rate of delta change\n' +
    '- Theta: Daily time decay\n' +
    '- Vega: Sensitivity to 1% volatility change\n' +
    '- Rho: Sensitivity to 1% interest rate change',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol'
      },
      strike: {
        type: 'number',
        description: 'Option strike price'
      },
      expirationDate: {
        type: 'string',
        description: 'Expiration date in YYYY-MM-DD format'
      },
      optionType: {
        type: 'string',
        enum: ['call', 'put'],
        description: 'Option type: call or put'
      },
      underlyingPrice: {
        type: 'number',
        description: 'Current underlying price (optional, will be fetched if not provided)'
      },
      riskFreeRate: {
        type: 'number',
        description: 'Risk-free interest rate as decimal (optional, default: 0.045)'
      },
      dividendYield: {
        type: 'number',
        description: 'Annual dividend yield as decimal (optional, default: 0)'
      }
    },
    required: ['symbol', 'strike', 'expirationDate', 'optionType']
  }
};

export async function handleCalculateGreeks(args: unknown) {
  try {
    const params = calculateGreeksInputSchema.parse(args);
    const result = await greeksCalculator.calculateGreeks(params);

    return {
      symbol: params.symbol,
      strike: params.strike,
      expirationDate: params.expirationDate,
      optionType: params.optionType,
      greeks: {
        delta: result.delta,
        gamma: result.gamma,
        theta: result.theta,
        vega: result.vega,
        rho: result.rho
      },
      impliedVolatility: result.impliedVolatility,
      interpretation: interpretGreeks(result, params.optionType)
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Calculate historical volatility tool
 */
export const calculateHistoricalVolatilityTool = {
  name: 'calculate_historical_volatility',
  description:
    'Calculate historical volatility (realized volatility) for multiple periods. Historical volatility measures past price fluctuations and is used to compare with implied volatility to identify potential opportunities. Returns annualized volatility percentages.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol'
      },
      periods: {
        type: 'array',
        items: { type: 'number' },
        description:
          'Array of periods in days to calculate (default: [10, 20, 30, 60, 90])'
      }
    },
    required: ['symbol']
  }
};

export async function handleCalculateHistoricalVolatility(args: unknown) {
  try {
    const { symbol, periods } = calculateHistoricalVolatilityInputSchema.parse(args);
    const result = await optionsService.calculateHistoricalVolatility(symbol, periods);

    return result;
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Calculate max pain tool
 */
export const calculateMaxPainTool = {
  name: 'calculate_max_pain',
  description:
    'Calculate the max pain price for an options expiration. Max pain is the strike price where option holders (buyers) experience maximum loss, and option writers (sellers) experience maximum profit. Many traders believe prices gravitate toward max pain as expiration approaches.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol'
      },
      expirationDate: {
        type: 'string',
        description:
          'Expiration date in YYYY-MM-DD format (optional, defaults to nearest expiration)'
      }
    },
    required: ['symbol']
  }
};

export async function handleCalculateMaxPain(args: unknown) {
  try {
    const { symbol, expirationDate } = calculateMaxPainInputSchema.parse(args);
    const result = await optionsService.calculateMaxPain(symbol, expirationDate);

    return {
      ...result,
      summary: {
        maxPainPrice: result.maxPainPrice,
        currentPrice: result.currentPrice,
        difference: Number((result.maxPainPrice - result.currentPrice).toFixed(2)),
        differencePercent: Number(
          (((result.maxPainPrice - result.currentPrice) / result.currentPrice) * 100).toFixed(2)
        ),
        putCallRatio: result.putCallRatio
      }
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Get implied volatility tool
 */
export const getImpliedVolatilityTool = {
  name: 'get_implied_volatility',
  description:
    'Get implied volatility (IV) data for a stock. IV represents market expectations of future volatility. Compare IV to historical volatility to identify high or low volatility environments. Returns current IV, IV by expiration, and comparison with historical volatility.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol'
      }
    },
    required: ['symbol']
  }
};

export async function handleGetImpliedVolatility(args: unknown) {
  try {
    const { symbol } = getImpliedVolatilityInputSchema.parse(args);
    const result = await optionsService.getImpliedVolatility(symbol);

    return {
      ...result,
      analysis: {
        ivVsHV: result.ivVsHV > 0 ? 'IV is higher than HV' : 'IV is lower than HV',
        ivVsHVPercent: result.ivVsHV,
        environment:
          result.currentIV > result.historicalVolatility * 1.2
            ? 'High IV environment - options expensive'
            : result.currentIV < result.historicalVolatility * 0.8
            ? 'Low IV environment - options cheap'
            : 'Normal IV environment'
      }
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Analyze options strategy tool
 */
export const analyzeOptionsStrategyTool = {
  name: 'analyze_options_strategy',
  description:
    'Analyze an options strategy to calculate max profit, max loss, break-even points, Greeks, and generate a profit/loss chart. Supports complex multi-leg strategies like spreads, straddles, iron condors, and butterflies. Helps visualize risk/reward before entering a trade.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Stock ticker symbol'
      },
      strategy: {
        type: 'string',
        enum: [
          'call',
          'put',
          'covered_call',
          'protective_put',
          'bull_call_spread',
          'bear_put_spread',
          'bull_put_spread',
          'bear_call_spread',
          'long_straddle',
          'short_straddle',
          'long_strangle',
          'short_strangle',
          'iron_condor',
          'iron_butterfly',
          'butterfly_spread',
          'calendar_spread',
          'diagonal_spread'
        ],
        description: 'Strategy type'
      },
      legs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            strike: { type: 'number', description: 'Strike price' },
            optionType: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'call or put'
            },
            action: {
              type: 'string',
              enum: ['buy', 'sell'],
              description: 'buy or sell'
            },
            quantity: { type: 'number', description: 'Number of contracts' },
            premium: {
              type: 'number',
              description: 'Premium price (optional, will be fetched if not provided)'
            }
          }
        },
        description: 'Strategy legs (options positions)'
      },
      expirationDate: {
        type: 'string',
        description: 'Expiration date in YYYY-MM-DD format'
      }
    },
    required: ['symbol', 'strategy', 'legs', 'expirationDate']
  }
};

export async function handleAnalyzeOptionsStrategy(args: unknown) {
  try {
    const { symbol, strategy, legs, expirationDate } =
      analyzeOptionsStrategyInputSchema.parse(args);

    const analysis = await strategyAnalyzer.analyzeStrategy(
      symbol,
      strategy,
      legs,
      expirationDate
    );

    return {
      ...analysis,
      summary: {
        strategy: analysis.strategy,
        maxProfit: analysis.maxProfit,
        maxLoss: analysis.maxLoss,
        maxProfitPercent:
          analysis.netDebit > 0
            ? Number(((analysis.maxProfit / analysis.netDebit) * 100).toFixed(2))
            : Infinity,
        maxLossPercent:
          analysis.netDebit > 0
            ? Number(((analysis.maxLoss / analysis.netDebit) * 100).toFixed(2))
            : 0,
        breakEvenPoints: analysis.breakEvenPoints,
        netPremium: analysis.netPremium,
        riskRewardRatio:
          analysis.maxLoss !== 0
            ? Number((Math.abs(analysis.maxProfit / analysis.maxLoss)).toFixed(2))
            : Infinity
      }
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Interpret Greeks for user
 */
function interpretGreeks(
  greeks: { delta: number; gamma: number; theta: number; vega: number; rho: number },
  optionType: 'call' | 'put'
): string[] {
  const interpretations: string[] = [];

  // Delta interpretation
  if (optionType === 'call') {
    if (Math.abs(greeks.delta) > 0.7) {
      interpretations.push('Deep in-the-money - high probability of profit');
    } else if (Math.abs(greeks.delta) > 0.3) {
      interpretations.push('At-the-money - moderate probability of profit');
    } else {
      interpretations.push('Out-of-the-money - lower probability of profit');
    }
  }

  // Theta interpretation
  if (greeks.theta < -0.05) {
    interpretations.push('High time decay - loses value quickly');
  } else if (greeks.theta < -0.01) {
    interpretations.push('Moderate time decay');
  }

  // Vega interpretation
  if (greeks.vega > 0.15) {
    interpretations.push('High vega - very sensitive to volatility changes');
  } else if (greeks.vega > 0.05) {
    interpretations.push('Moderate vega - moderately sensitive to volatility');
  }

  // Gamma interpretation
  if (greeks.gamma > 0.05) {
    interpretations.push('High gamma - delta changes rapidly with price moves');
  }

  return interpretations;
}
