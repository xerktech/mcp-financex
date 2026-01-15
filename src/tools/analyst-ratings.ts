/**
 * Analyst Ratings Tool
 */

import { analystRatingsService } from '../services/analyst-ratings.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for analyst ratings
 */
export const getAnalystRatingsTool = {
  name: 'get_analyst_ratings',
  description:
    'Analyst Ratings & Target Prices | Wall Street Consensus | Upgrades & Downgrades - ' +
    'Track analyst recommendations, price targets, and consensus changes for stocks. ' +
    'Get insights into what Wall Street analysts think about a company\'s prospects. ' +
    '\n\n**Key Metrics:**\n' +
    '- **Consensus Rating**: Overall buy/hold/sell recommendation from analysts\n' +
    '- **Target Price**: Mean analyst price target with high/low/median ranges\n' +
    '- **Rating Distribution**: Breakdown of strong buy, buy, hold, sell, strong sell ratings\n' +
    '- **Analyst Coverage**: Number of analysts actively covering the stock\n' +
    '- **Price Upside/Downside**: Potential gains or losses to target prices\n' +
    '- **Trend Analysis**: Whether analyst sentiment is improving, deteriorating, or stable\n' +
    '\n**Trend Indicators:**\n' +
    '- **Improving**: 50%+ buy ratings indicate bullish analyst sentiment\n' +
    '- **Deteriorating**: 50%+ sell ratings indicate bearish analyst sentiment\n' +
    '- **Stable**: 60%+ hold ratings or mixed opinions with no clear consensus\n' +
    '\n**Use Cases:**\n' +
    '- "What do analysts think about Apple stock?"\n' +
    '- "Show me analyst ratings for TSLA"\n' +
    '- "What\'s the price target for Microsoft?"\n' +
    '- "Which analysts are bullish on NVDA?"\n' +
    '- "Is analyst sentiment improving for AMD?"\n' +
    '\n**Why It Matters:**\n' +
    'Analyst ratings influence:\n' +
    '- **Stock Price**: Upgrades often lead to price increases\n' +
    '- **Investor Sentiment**: Wall Street opinions shape market perception\n' +
    '- **Trading Volume**: Rating changes can trigger significant buying/selling\n' +
    '- **Target Setting**: Price targets help investors gauge potential returns\n' +
    '\n**Important Notes:**\n' +
    '- Analyst ratings are opinions, not guarantees\n' +
    '- Consider multiple factors beyond analyst recommendations\n' +
    '- Rating changes can be influenced by various factors (earnings, industry trends, etc.)\n' +
    '- Strong consensus doesn\'t always predict future performance\n' +
    '\n**Returns:** Consensus rating, target prices, rating distribution, analyst coverage, upside/downside percentages, and trend analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to get analyst ratings for (e.g., "AAPL", "MSFT"). ' +
          'Analyst ratings are typically available for widely-covered US stocks.'
      },
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: Array of symbols to get analyst ratings for multiple stocks at once. ' +
          'If provided, this takes precedence over the single symbol parameter.'
      }
    },
    required: []
  }
};

/**
 * Handle analyst ratings request
 */
export async function handleGetAnalystRatings(args: unknown) {
  try {
    const { symbol, symbols } = args as {
      symbol?: string;
      symbols?: string[];
    };

    // Batch mode if multiple symbols provided
    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
      const result = await analystRatingsService.getAnalystRatingsBatch(symbols);

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
            consensus: data.currentRating.rating,
            targetPrice: data.currentRating.targetPrice,
            numberOfAnalysts: data.currentRating.numberOfAnalysts,
            trend: data.trend.direction,
            bullishPercent: data.trend.bullishPercent,
            bearishPercent: data.trend.bearishPercent,
            upside: data.priceComparison.upside,
            currentPrice: data.priceComparison.currentPrice
          };
        })
      };
    }

    // Single symbol mode
    if (!symbol) {
      throw new Error('Either symbol or symbols parameter is required');
    }

    const data = await analystRatingsService.getAnalystRatings(symbol);

    return {
      mode: 'single',
      symbol: data.symbol,
      companyName: data.companyName,

      // Current consensus
      consensus: {
        rating: data.currentRating.rating,
        targetPrice: data.currentRating.targetPrice,
        targetPriceHigh: data.currentRating.targetPriceHigh,
        targetPriceLow: data.currentRating.targetPriceLow,
        targetPriceMedian: data.currentRating.targetPriceMedian,
        numberOfAnalysts: data.currentRating.numberOfAnalysts,
        interpretation: interpretConsensus(
          data.currentRating.rating,
          data.currentRating.numberOfAnalysts
        )
      },

      // Rating distribution
      ratingDistribution: {
        strongBuy: data.ratingDistribution.strongBuy,
        buy: data.ratingDistribution.buy,
        hold: data.ratingDistribution.hold,
        sell: data.ratingDistribution.sell,
        strongSell: data.ratingDistribution.strongSell,
        total: data.ratingDistribution.total,
        summary: formatRatingDistribution(data.ratingDistribution)
      },

      // Trend analysis
      trend: {
        direction: data.trend.direction,
        bullishPercent: data.trend.bullishPercent,
        bearishPercent: data.trend.bearishPercent,
        description: data.trend.description,
        interpretation: interpretTrend(data.trend.direction, data.trend.description)
      },

      // Price comparison
      priceComparison: {
        currentPrice: data.priceComparison.currentPrice,
        targetPrice: data.priceComparison.targetPrice,
        upside: data.priceComparison.upside,
        upsideToHigh: data.priceComparison.upsideToHigh,
        downside: data.priceComparison.downside,
        interpretation: interpretPriceComparison(
          data.priceComparison.upside,
          data.priceComparison.upsideToHigh,
          data.priceComparison.downside
        )
      },

      timestamp: data.timestamp
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Interpret consensus rating for users
 */
function interpretConsensus(
  rating: string,
  numberOfAnalysts: number | undefined
): string {
  const analystCount = numberOfAnalysts ? `${numberOfAnalysts} analysts` : 'analysts';

  if (rating === 'buy') {
    return `BULLISH CONSENSUS: ${analystCount} recommend buying. Positive outlook on the company's prospects.`;
  }

  if (rating === 'hold') {
    return `NEUTRAL CONSENSUS: ${analystCount} recommend holding. Mixed opinions or wait-and-see approach.`;
  }

  if (rating === 'sell') {
    return `BEARISH CONSENSUS: ${analystCount} recommend selling. Negative outlook or concerns about valuation.`;
  }

  return `CONSENSUS UNAVAILABLE: Limited analyst coverage or data not available.`;
}

/**
 * Format rating distribution as a summary
 */
function formatRatingDistribution(distribution: {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  total: number;
}): string {
  if (distribution.total === 0) {
    return 'No analyst ratings available';
  }

  const parts = [];

  if (distribution.strongBuy > 0) {
    parts.push(`${distribution.strongBuy} Strong Buy`);
  }
  if (distribution.buy > 0) {
    parts.push(`${distribution.buy} Buy`);
  }
  if (distribution.hold > 0) {
    parts.push(`${distribution.hold} Hold`);
  }
  if (distribution.sell > 0) {
    parts.push(`${distribution.sell} Sell`);
  }
  if (distribution.strongSell > 0) {
    parts.push(`${distribution.strongSell} Strong Sell`);
  }

  return `${parts.join(', ')} (Total: ${distribution.total})`;
}

/**
 * Interpret trend direction for users
 */
function interpretTrend(
  direction: string,
  description: string
): string {
  if (direction === 'improving') {
    return `POSITIVE TREND: ${description} This suggests growing analyst confidence in the stock.`;
  }

  if (direction === 'deteriorating') {
    return `NEGATIVE TREND: ${description} This suggests declining analyst confidence in the stock.`;
  }

  if (direction === 'stable') {
    return `STABLE TREND: ${description} Analyst opinions are relatively unchanged.`;
  }

  return `TREND UNKNOWN: ${description}`;
}

/**
 * Interpret price comparison for users
 */
function interpretPriceComparison(
  upside: number | undefined,
  upsideToHigh: number | undefined,
  downside: number | undefined
): string {
  if (upside === undefined) {
    return 'PRICE TARGETS UNAVAILABLE: No analyst price targets available for comparison.';
  }

  const parts = [];

  if (upside > 20) {
    parts.push(`SIGNIFICANT UPSIDE: ${upside.toFixed(1)}% potential gain to mean target`);
  } else if (upside > 10) {
    parts.push(`MODERATE UPSIDE: ${upside.toFixed(1)}% potential gain to mean target`);
  } else if (upside > 0) {
    parts.push(`SLIGHT UPSIDE: ${upside.toFixed(1)}% potential gain to mean target`);
  } else if (upside > -10) {
    parts.push(`SLIGHT DOWNSIDE: ${Math.abs(upside).toFixed(1)}% below mean target`);
  } else {
    parts.push(`SIGNIFICANT DOWNSIDE: ${Math.abs(upside).toFixed(1)}% below mean target`);
  }

  if (upsideToHigh !== undefined && upsideToHigh > 0) {
    parts.push(`${upsideToHigh.toFixed(1)}% to highest target`);
  }

  if (downside !== undefined && downside < 0) {
    parts.push(`${Math.abs(downside).toFixed(1)}% to lowest target`);
  }

  return parts.join('. ');
}
