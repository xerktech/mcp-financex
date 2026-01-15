/**
 * Short Interest Tracker Tool
 */

import { shortInterestService } from '../services/short-interest.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for short interest tracking
 */
export const getShortInterestTool = {
  name: 'get_short_interest',
  description:
    'Short Interest Tracker | Short Squeeze Potential | Days to Cover - ' +
    'Track short interest, short ratio (days to cover), and short squeeze potential for stocks. ' +
    'Short interest indicates bearish sentiment and can lead to short squeezes when heavily shorted stocks rise. ' +
    '\n\n**Key Metrics:**\n' +
    '- **Short Ratio (Days to Cover)**: Days it would take to cover all short positions based on average volume\n' +
    '- **Short % of Float**: Percentage of tradeable shares that are sold short\n' +
    '- **Shares Short**: Total number of shares sold short\n' +
    '- **Short Interest Change**: Month-over-month change in short positions\n' +
    '- **Squeeze Risk Score**: 0-100 score indicating short squeeze potential\n' +
    '\n**Short Squeeze Indicators:**\n' +
    '- **High Risk**: Short ratio >10 days OR short % >30% (Score: 70-100)\n' +
    '- **Medium Risk**: Short ratio >3 days OR short % >15% (Score: 40-69)\n' +
    '- **Low Risk**: Lower short interest (Score: 0-39)\n' +
    '\n**Use Cases:**\n' +
    '- "What\'s the short interest for Tesla?"\n' +
    '- "Show me short squeeze potential for AMC"\n' +
    '- "Which stocks have high short interest?"\n' +
    '- "How many days to cover short positions on GME?"\n' +
    '- "Is there short squeeze risk for TSLA?"\n' +
    '\n**Why It Matters:**\n' +
    'High short interest can lead to:\n' +
    '- **Short Squeeze**: Rapid price increase forcing shorts to cover\n' +
    '- **Increased Volatility**: More dramatic price swings\n' +
    '- **Trading Opportunities**: Both long and short strategies\n' +
    '\n**Famous Short Squeezes:**\n' +
    '- GameStop (GME) - January 2021\n' +
    '- AMC Entertainment - June 2021\n' +
    '- Volkswagen - October 2008\n' +
    '\n**Returns:** Short ratio, short %, squeeze risk score, days to cover, and month-over-month changes.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to get short interest for (e.g., "TSLA", "GME"). ' +
          'Short interest data is typically only available for US stocks.'
      },
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: Array of symbols to get short interest for multiple stocks at once. ' +
          'If provided, this takes precedence over the single symbol parameter.'
      }
    },
    required: []
  }
};

/**
 * Handle short interest request
 */
export async function handleGetShortInterest(args: unknown) {
  try {
    const { symbol, symbols } = args as {
      symbol?: string;
      symbols?: string[];
    };

    // Batch mode if multiple symbols provided
    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
      const result = await shortInterestService.getShortInterestBatch(symbols);

      return {
        mode: 'batch',
        totalSymbols: symbols.length,
        successful: Object.values(result.data).filter(d => d !== null).length,
        failed: Object.keys(result.errors).length,
        data: Object.entries(result.data).map(([sym, data]) => {
          if (!data) {
            return {
              symbol: sym,
              error: result.errors[sym] || 'Failed to fetch data'
            };
          }

          return {
            symbol: data.symbol,
            companyName: data.companyName,
            shortRatio: data.shortRatio,
            shortPercentOfFloat: data.shortPercentOfFloat,
            squeezeRisk: data.squeezeRisk,
            squeezeScore: data.squeezeScore,
            sharesShort: data.sharesShort,
            shortInterestChange: data.shortInterestChange,
            shortInterestChangePercent: data.shortInterestChangePercent,
            currentPrice: data.currentPrice
          };
        })
      };
    }

    // Single symbol mode
    if (!symbol) {
      throw new Error('Either symbol or symbols parameter is required');
    }

    const data = await shortInterestService.getShortInterest(symbol);

    return {
      mode: 'single',
      symbol: data.symbol,
      companyName: data.companyName,

      // Short interest metrics
      shortInterest: {
        shortRatio: data.shortRatio,
        shortPercentOfFloat: data.shortPercentOfFloat,
        shortPercentOfShares: data.shortPercentOfShares,
        sharesShort: data.sharesShort,
        sharesShortPriorMonth: data.sharesShortPriorMonth,
        shortInterestChange: data.shortInterestChange,
        shortInterestChangePercent: data.shortInterestChangePercent
      },

      // Context metrics
      context: {
        floatShares: data.floatShares,
        impliedSharesOutstanding: data.impliedSharesOutstanding,
        averageDailyVolume: data.averageDailyVolume
      },

      // Squeeze analysis
      squeezeAnalysis: {
        risk: data.squeezeRisk,
        score: data.squeezeScore,
        interpretation: interpretSqueezeRisk(
          data.squeezeRisk,
          data.squeezeScore,
          data.shortRatio,
          data.shortPercentOfFloat
        )
      },

      // Current price
      currentPrice: {
        price: data.currentPrice,
        change: data.priceChange,
        changePercent: data.priceChangePercent
      },

      timestamp: data.timestamp
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Interpret squeeze risk for users
 */
function interpretSqueezeRisk(
  risk: string,
  score: number | undefined,
  shortRatio: number | undefined,
  shortPercentOfFloat: number | undefined
): string {
  if (risk === 'high') {
    const reasons = [];
    if (shortRatio !== undefined && shortRatio > 10) {
      reasons.push(`very high days to cover (${shortRatio.toFixed(1)} days)`);
    } else if (shortRatio !== undefined && shortRatio > 5) {
      reasons.push(`high days to cover (${shortRatio.toFixed(1)} days)`);
    }

    if (shortPercentOfFloat !== undefined && shortPercentOfFloat > 30) {
      reasons.push(`extremely high short interest (${shortPercentOfFloat.toFixed(1)}% of float)`);
    } else if (shortPercentOfFloat !== undefined && shortPercentOfFloat > 20) {
      reasons.push(`very high short interest (${shortPercentOfFloat.toFixed(1)}% of float)`);
    }

    return `HIGH SQUEEZE RISK (Score: ${score}): ${reasons.join(' and ')}. A significant price increase could trigger a short squeeze as shorts rush to cover positions.`;
  }

  if (risk === 'medium') {
    return `MEDIUM SQUEEZE RISK (Score: ${score}): Moderate short interest. Price volatility could increase if positive catalysts emerge. Monitor for changes in short interest and price momentum.`;
  }

  if (risk === 'low') {
    return `LOW SQUEEZE RISK (Score: ${score}): Low short interest levels. Short squeeze is unlikely unless short interest increases significantly. Stock may be less volatile relative to highly shorted names.`;
  }

  return 'SHORT INTEREST DATA UNAVAILABLE: Unable to assess squeeze risk without short interest metrics.';
}
