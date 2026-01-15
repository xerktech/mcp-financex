/**
 * Extended Hours Trading Tool (Pre-market & After-hours)
 */

import { extendedHoursService } from '../services/extended-hours.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for extended hours trading data
 */
export const getExtendedHoursTool = {
  name: 'get_extended_hours_data',
  description:
    'Pre-Market & After-Hours Trading | Extended Session Data | Early/Late Trading Activity - ' +
    'Get real-time pre-market and after-hours trading data for stocks. ' +
    'Extended hours trading occurs before and after regular market hours, allowing traders to react to news and events. ' +
    '\n\n**Trading Sessions:**\n' +
    '- **Pre-Market**: 4:00 AM - 9:30 AM ET (before regular hours)\n' +
    '- **Regular Hours**: 9:30 AM - 4:00 PM ET (standard trading)\n' +
    '- **After-Hours**: 4:00 PM - 8:00 PM ET (after regular hours)\n' +
    '\n**Data Provided:**\n' +
    '- Pre-market price, change, volume\n' +
    '- After-hours price, change, volume\n' +
    '- Regular market data (for comparison)\n' +
    '- Current active session indicator\n' +
    '- Most recent price across all sessions\n' +
    '\n**Use Cases:**\n' +
    '- "Show me Apple\'s pre-market price"\n' +
    '- "What\'s Tesla trading at after-hours?"\n' +
    '- "Get extended hours data for NVDA"\n' +
    '- "Is there pre-market activity on AAPL?"\n' +
    '- "Compare regular vs after-hours price for MSFT"\n' +
    '\n**Why It Matters:**\n' +
    'Extended hours trading reveals early market reactions to:\n' +
    '- Earnings announcements (typically after-hours or pre-market)\n' +
    '- Breaking news and geopolitical events\n' +
    '- Analyst upgrades/downgrades\n' +
    '- Economic data releases\n' +
    '\n**Important Notes:**\n' +
    '- Extended hours have lower liquidity (wider spreads)\n' +
    '- Prices can be more volatile\n' +
    '- Not all stocks are actively traded in extended hours\n' +
    '\n**Returns:** Pre-market and after-hours prices, changes, current session, and comparison with regular hours.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to get extended hours data for (e.g., "AAPL", "TSLA"). ' +
          'Extended hours data is typically only available for US stocks.'
      },
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: Array of symbols to get extended hours data for multiple stocks at once. ' +
          'If provided, this takes precedence over the single symbol parameter.'
      }
    },
    required: []
  }
};

/**
 * Handle extended hours data request
 */
export async function handleGetExtendedHours(args: unknown) {
  try {
    const { symbol, symbols } = args as {
      symbol?: string;
      symbols?: string[];
    };

    // Batch mode if multiple symbols provided
    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
      const result = await extendedHoursService.getExtendedHoursBatch(symbols);

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
            currentSession: data.currentSession,
            currentPrice: data.currentPrice,
            currentChange: data.currentChange,
            currentChangePercent: data.currentChangePercent,
            regularMarket: data.regularMarket,
            preMarket: data.preMarket,
            postMarket: data.postMarket,
            timestamp: data.timestamp
          };
        })
      };
    }

    // Single symbol mode
    if (!symbol) {
      throw new Error('Either symbol or symbols parameter is required');
    }

    const data = await extendedHoursService.getExtendedHours(symbol);

    return {
      mode: 'single',
      symbol: data.symbol,
      companyName: data.companyName,

      // Current session info
      currentSession: data.currentSession,
      currentPrice: data.currentPrice,
      currentChange: data.currentChange,
      currentChangePercent: data.currentChangePercent,

      // Regular market data
      regularMarket: {
        price: data.regularMarket.price,
        change: data.regularMarket.change,
        changePercent: data.regularMarket.changePercent,
        volume: data.regularMarket.volume,
        time: data.regularMarket.time,
        isOpen: data.regularMarket.isOpen
      },

      // Pre-market data (if available)
      preMarket: data.preMarket
        ? {
            price: data.preMarket.price,
            change: data.preMarket.change,
            changePercent: data.preMarket.changePercent,
            time: data.preMarket.time,
            isActive: data.preMarket.isActive,
            changeFromRegularClose: data.preMarket.price - data.regularMarket.price,
            changePercentFromRegularClose:
              ((data.preMarket.price - data.regularMarket.price) / data.regularMarket.price) * 100
          }
        : undefined,

      // After-hours data (if available)
      postMarket: data.postMarket
        ? {
            price: data.postMarket.price,
            change: data.postMarket.change,
            changePercent: data.postMarket.changePercent,
            time: data.postMarket.time,
            isActive: data.postMarket.isActive,
            changeFromRegularClose: data.postMarket.price - data.regularMarket.price,
            changePercentFromRegularClose:
              ((data.postMarket.price - data.regularMarket.price) / data.regularMarket.price) * 100
          }
        : undefined,

      // Analysis
      analysis: {
        sessionStatus: data.currentSession,
        hasPreMarketActivity: data.preMarket !== undefined,
        hasAfterHoursActivity: data.postMarket !== undefined,
        description: generateSessionDescription(data)
      },

      timestamp: data.timestamp
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}

/**
 * Generate human-readable session description
 */
function generateSessionDescription(data: {
  currentSession: string;
  preMarket?: { price: number; changePercent: number };
  postMarket?: { price: number; changePercent: number };
  regularMarket: { price: number };
}): string {
  const session = data.currentSession;

  if (session === 'pre-market' && data.preMarket) {
    const direction = data.preMarket.changePercent > 0 ? 'up' : 'down';
    return `Trading in pre-market session. Price is ${direction} ${Math.abs(data.preMarket.changePercent).toFixed(2)}% from previous close.`;
  }

  if (session === 'regular') {
    return 'Regular trading hours. Market is open.';
  }

  if (session === 'post-market' && data.postMarket) {
    const direction = data.postMarket.changePercent > 0 ? 'up' : 'down';
    return `Trading in after-hours session. Price is ${direction} ${Math.abs(data.postMarket.changePercent).toFixed(2)}% from regular close.`;
  }

  if (session === 'closed') {
    let desc = 'Markets are closed.';
    if (data.postMarket) {
      desc += ` Last after-hours price was ${data.postMarket.price.toFixed(2)}.`;
    }
    return desc;
  }

  return 'Market session information unavailable.';
}
