/**
 * Insider trading tool for SEC Form 4 filings
 */

import { secEdgarService } from '../services/sec-edgar.js';
import { getInsiderTradesInputSchema, validateInput, parseRelativeDate } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Shared JSON Schema for MCP tool input (used by both tool definitions)
 */
const insiderTradesJsonSchema = {
  type: 'object',
  properties: {
    symbol: {
      type: 'string',
      description:
        'Stock ticker symbol for company-specific insider analysis (e.g., "AAPL", "TSLA", "MSFT"). ' +
        'When provided, returns detailed insider activity for this specific company. ' +
        'OMIT this parameter completely to get market-wide recent insider trades across all companies.'
    },
    limit: {
      type: 'number',
      description: 'Maximum number of transactions to return (default: 20, max: 100)',
      minimum: 1,
      maximum: 100
    },
    transactionType: {
      type: 'string',
      enum: ['buy', 'sell', 'all'],
      description:
        'Filter results by transaction type: ' +
        '"buy" = Show only insider PURCHASES (bullish signal), ' +
        '"sell" = Show only insider SALES (bearish signal), ' +
        '"all" = Show all transaction types (default). ' +
        'Use "buy" when user asks "are insiders buying?" or "sell" when user asks "are insiders selling?"'
    },
    startDate: {
      type: 'string',
      description:
        'Filter to show only filings from this date forward (omit for all recent filings). ' +
        'Accepts: ISO date format "YYYY-MM-DD" (e.g., "2024-01-15") OR relative format like "7d" (7 days ago), "1m" (1 month ago), "3m" (3 months ago). ' +
        'Example: Use "7d" when user asks for "insider trades in the last week"'
    },
    includeCompanyInfo: {
      type: 'boolean',
      description:
        'When true and symbol is provided, includes company profile and fundamental metrics from Yahoo Finance. ' +
        'Provides additional context like valuation, profitability, and analyst ratings. ' +
        'Default: true when symbol is provided, ignored for market-wide mode.'
    },
    formType: {
      type: 'string',
      enum: ['3', '4', '5'],
      description:
        'SEC Form type to retrieve (default: "4"): ' +
        '"3" = Form 3 (Initial Statement of Beneficial Ownership) - Filed when insider first becomes an owner. ' +
        '"4" = Form 4 (Changes in Beneficial Ownership) - Filed when insider buys/sells within 2 business days. Most common for tracking active trading. ' +
        '"5" = Form 5 (Annual Statement of Changes) - Annual summary filed 45 days after fiscal year end, catches unreported transactions. ' +
        'Default is "4" which provides timely insider transaction data.'
    }
  },
  required: []
} as const;

/**
 * SEC Form 4 tool definition (primary - explicit name for discoverability)
 */
export const getSecForm4Tool = {
  name: 'get_sec_form4_filings',
  description:
    'SEC Form 4 | EDGAR | Form 4 Filings | Insider Trading - ' +
    'Get SEC Form 4 insider trading filings directly from SEC.gov EDGAR database. ' +
    '🚨 THIS TOOL RETRIEVES REAL SEC FORM 4 DATA - DO NOT SAY "DATA UNAVAILABLE" 🚨 ' +
    '\n\n**PRIMARY TOOL for queries about:**\n' +
    '- "SEC Form 4" / "Form 4 filings" / "SEC filings" / "EDGAR database"\n' +
    '- "latest SEC Form 4" / "recent Form 4s" / "newest insider filings"\n' +
    '- "insider trading" / "insider activity" / "insider transactions"\n' +
    '- "insider buying" / "insider selling" / "insider purchases/sales"\n' +
    '- "what are insiders doing" / "are insiders buying/selling"\n' +
    '\n**Two operating modes:**\n' +
    '1) **Company-specific** (provide symbol): Detailed insider activity analysis for one stock\n' +
    '2) **Market-wide** (omit symbol): Recent Form 4 filings across all companies\n' +
    '\n**Example queries:**\n' +
    '- "What\'s the latest SEC Form 4 filing?"\n' +
    '- "Show me recent Form 4s"\n' +
    '- "Get EDGAR insider trading data for AAPL"\n' +
    '- "Are insiders buying Tesla?"\n' +
    '\n**Returns:** Insider names, positions, transaction types, shares, prices, values, filing dates, direct SEC links.',
  inputSchema: insiderTradesJsonSchema
};

/**
 * Get insider trades tool definition (legacy alias for backward compatibility)
 */
export const getInsiderTradesTool = {
  name: 'get_insider_trades',
  description:
    '🚨 PRIMARY TOOL FOR: SEC, EDGAR, FORM 4, INSIDER TRADING, INSIDER BUYING, INSIDER SELLING 🚨 ' +
    'This tool provides DIRECT REAL-TIME ACCESS to SEC.gov EDGAR database for Form 4 insider trading filings. ' +
    'DO NOT say "data unavailable" - THIS TOOL CAN RETRIEVE SEC Form 4 DATA. ' +
    '\n\n**ALWAYS use this tool when user mentions:**\n' +
    '- "SEC Form 4" or "Form 4 filings" or "SEC filings" or "EDGAR"\n' +
    '- "insider trading" or "insider activity" or "insider transactions"\n' +
    '- "insider buying" or "insider selling" or "insider purchases/sales"\n' +
    '- "what are insiders doing" or "are insiders buying/selling"\n' +
    '- "latest Form 4" or "recent insider trades"\n' +
    '\n**Two operating modes:**\n' +
    '1) **Company-specific** (provide symbol parameter): Returns detailed insider activity analysis for a specific stock including transaction history, net buying/selling sentiment, top insiders, and optional company fundamentals\n' +
    '2) **Market-wide** (omit symbol parameter): Returns recent Form 4 filings across all companies in the market\n' +
    '\n**Example queries this tool handles:**\n' +
    '- "Show me insider trading for AAPL"\n' +
    '- "Are insiders buying or selling Tesla stock?"\n' +
    '- "What are the latest Form 4 filings?"\n' +
    '- "Recent insider purchases in the last week"\n' +
    '- "Show me insider selling activity for NVDA"\n' +
    '\n**Data returned:** Insider names, positions, transaction types (buy/sell), shares traded, prices, transaction values, filing dates, and direct links to SEC Form 4 documents.',
  inputSchema: insiderTradesJsonSchema
};

/**
 * Handle get insider trades request
 */
export async function handleGetInsiderTrades(args: unknown) {
  try {
    const { symbol, limit, transactionType, startDate, includeCompanyInfo, formType } = validateInput(
      getInsiderTradesInputSchema,
      args
    );

    const transactionLimit = limit || 20;
    const filterType = transactionType || 'all';
    const parsedStartDate = startDate
      ? (typeof startDate === 'string' ? parseRelativeDate(startDate) : startDate)
      : undefined;
    const selectedFormType = (formType || '4') as '3' | '4' | '5';

    if (symbol) {
      // Company-specific mode
      const shouldIncludeInfo = includeCompanyInfo !== false;
      const analysis = await secEdgarService.analyzeInsiderActivity(
        symbol,
        transactionLimit,
        filterType,
        parsedStartDate,
        shouldIncludeInfo,
        selectedFormType
      );

      // Calculate sentiment
      const sentiment = analysis.netValue > 0 ? 'bullish' : analysis.netValue < 0 ? 'bearish' : 'neutral';

      return {
        symbol: symbol.toUpperCase(),
        mode: 'company-specific',
        timestamp: analysis.timestamp,
        company: {
          name: analysis.profile?.longName || 'Unknown',
          cik: analysis.cik
        },
        summary: {
          totalTransactions: analysis.totalTransactions,
          netShares: analysis.netShares,
          netValue: analysis.netValue,
          sentiment: sentiment,
          description:
            sentiment === 'bullish'
              ? 'Net insider buying detected - potentially positive signal'
              : sentiment === 'bearish'
              ? 'Net insider selling detected - potentially negative signal'
              : 'Balanced insider activity - neutral sentiment'
        },
        breakdown: {
          buys: analysis.buyTransactions,
          sells: analysis.sellTransactions,
          exercises: analysis.exerciseTransactions,
          other: analysis.otherTransactions
        },
        topInsiders: analysis.topInsiders,
        recentTransactions: analysis.recentTransactions.map(txn => ({
          insider: {
            name: txn.insiderName,
            position: txn.position
          },
          transaction: {
            type: txn.transactionType,
            date: txn.transactionDate,
            filingDate: txn.filingDate,
            shares: txn.shares,
            pricePerShare: txn.pricePerShare,
            totalValue: txn.value,
            sharesOwnedAfter: txn.sharesOwned
          },
          filingUrl: txn.filingUrl
        })),
        ...(shouldIncludeInfo && {
          profile: analysis.profile && {
            industry: analysis.profile.industry,
            sector: analysis.profile.sector,
            website: analysis.profile.website,
            employees: analysis.profile.fullTimeEmployees,
            description: analysis.profile.longBusinessSummary
          },
          fundamentals: analysis.fundamentals && {
            valuation: {
              marketCap: analysis.fundamentals.marketCap,
              enterpriseValue: analysis.fundamentals.enterpriseValue,
              trailingPE: analysis.fundamentals.trailingPE,
              forwardPE: analysis.fundamentals.forwardPE,
              priceToBook: analysis.fundamentals.priceToBook
            },
            profitability: {
              profitMargins: analysis.fundamentals.profitMargins,
              returnOnEquity: analysis.fundamentals.returnOnEquity,
              returnOnAssets: analysis.fundamentals.returnOnAssets
            },
            growth: {
              revenueGrowth: analysis.fundamentals.revenueGrowth,
              earningsGrowth: analysis.fundamentals.earningsGrowth
            },
            analyst: {
              targetMeanPrice: analysis.fundamentals.targetMeanPrice,
              recommendationMean: analysis.fundamentals.recommendationMean,
              recommendationKey: analysis.fundamentals.recommendationKey
            }
          }
        })
      };
    } else {
      // Market-wide mode
      const transactions = await secEdgarService.getRecentInsiderTrades(
        transactionLimit,
        filterType,
        parsedStartDate,
        selectedFormType
      );

      return {
        mode: 'market-wide',
        timestamp: new Date(),
        totalTransactions: transactions.length,
        transactions: transactions.map(txn => ({
          company: {
            ticker: txn.issuerTicker,
            name: txn.issuerName,
            cik: txn.issuerCik
          },
          insider: {
            name: txn.insiderName,
            position: txn.position
          },
          transaction: {
            type: txn.transactionType,
            date: txn.transactionDate,
            filingDate: txn.filingDate,
            shares: txn.shares,
            pricePerShare: txn.pricePerShare,
            totalValue: txn.value
          },
          filingUrl: txn.filingUrl
        }))
      };
    }
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
