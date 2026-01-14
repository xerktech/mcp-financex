/**
 * Insider trading tool for SEC Form 4 filings
 */

import { secEdgarService } from '../services/sec-edgar.js';
import { getInsiderTradesInputSchema, validateInput, parseRelativeDate } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Get insider trades tool definition
 */
export const getInsiderTradesTool = {
  name: 'get_insider_trades',
  description:
    'Retrieve SEC Form 4 insider trading data for stocks. ' +
    'Provides real-time insider buying and selling activity from SEC EDGAR filings. ' +
    'Two modes: ' +
    '1) Market-wide: Recent insider trades across all companies (omit symbol) ' +
    '2) Company-specific: Detailed insider activity analysis for a specific stock (provide symbol) ' +
    'When symbol is provided, returns comprehensive analysis including: ' +
    '- Transaction history with insider names, titles, shares, and values ' +
    '- Net insider activity (buying vs selling sentiment) ' +
    '- Top insiders by transaction value ' +
    '- Optional company fundamentals and profile for context ' +
    'Essential for understanding insider sentiment, potential price catalysts, and informed trading decisions.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Ticker symbol for company-specific insider analysis (e.g., AAPL, TSLA). ' +
          'Omit this parameter to get market-wide recent insider trades.'
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
          'Filter by transaction type: ' +
          '"buy" for insider purchases only, ' +
          '"sell" for insider sales only, ' +
          '"all" for all transaction types (default: all)'
      },
      startDate: {
        type: 'string',
        description:
          'Filter filings from this date forward. ' +
          'Accepts ISO date (YYYY-MM-DD) or relative format (e.g., "7d" for 7 days, "1m" for 1 month, "3m" for 3 months)'
      },
      includeCompanyInfo: {
        type: 'boolean',
        description:
          'When true and symbol is provided, includes company profile and fundamental metrics from Yahoo Finance. ' +
          'Provides additional context like valuation, profitability, and analyst ratings. ' +
          'Default: true when symbol is provided, ignored for market-wide mode.'
      }
    },
    required: []
  }
};

/**
 * Handle get insider trades request
 */
export async function handleGetInsiderTrades(args: unknown) {
  try {
    const { symbol, limit, transactionType, startDate, includeCompanyInfo } = validateInput(
      getInsiderTradesInputSchema,
      args
    );

    const transactionLimit = limit || 20;
    const filterType = transactionType || 'all';
    const parsedStartDate = startDate
      ? (typeof startDate === 'string' ? parseRelativeDate(startDate) : startDate)
      : undefined;

    if (symbol) {
      // Company-specific mode
      const shouldIncludeInfo = includeCompanyInfo !== false;
      const analysis = await secEdgarService.analyzeInsiderActivity(
        symbol,
        transactionLimit,
        filterType,
        parsedStartDate,
        shouldIncludeInfo
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
        parsedStartDate
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
