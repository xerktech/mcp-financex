/**
 * Tool registry and exports
 */

import { getQuoteTool, handleGetQuote, getBatchQuoteTool, handleGetBatchQuote } from './quote.js';
import { getHistoricalTool, handleGetHistorical } from './historical.js';
import { searchTickerTool, handleSearchTicker } from './search.js';
import { getMarketNewsTool, handleGetMarketNews } from './news.js';
import { getSecForm4Tool, getInsiderTradesTool, handleGetInsiderTrades } from './insider.js';
import { calculateIndicatorTool, handleCalculateIndicator } from './indicators.js';
import {
  getOptionsChainTool,
  handleGetOptionsChain,
  getEarningsCalendarTool,
  handleGetEarningsCalendar,
  getDividendInfoTool,
  handleGetDividendInfo,
  calculateGreeksTool,
  handleCalculateGreeks,
  calculateHistoricalVolatilityTool,
  handleCalculateHistoricalVolatility,
  calculateMaxPainTool,
  handleCalculateMaxPain,
  getImpliedVolatilityTool,
  handleGetImpliedVolatility,
  analyzeOptionsStrategyTool,
  handleAnalyzeOptionsStrategy
} from './options.js';
import { get13FFilingsTool, handleGet13FFilings } from './institutional.js';
import { get13DGFilingsTool, handleGet13DGFilings } from './ownership.js';
import { get8KEventsTool, handleGet8KEvents } from './material-events.js';
import { getFinancialStatementsTool, handleGetFinancialStatements } from './financials.js';
import { calculateDCFValuationTool, handleCalculateDCFValuation } from './dcf.js';
import { comparePeersTool, handleComparePeers } from './peer-comparison.js';

/**
 * All available tools
 */
export const tools = [
  // Stock & Crypto tools
  getQuoteTool,
  getBatchQuoteTool,
  getHistoricalTool,
  searchTickerTool,
  getMarketNewsTool,
  getSecForm4Tool,        // Primary SEC Form 4 tool (explicit naming for discoverability)
  getInsiderTradesTool,   // Legacy alias for backward compatibility
  calculateIndicatorTool,

  // Options trading tools
  getOptionsChainTool,
  getEarningsCalendarTool,
  getDividendInfoTool,
  calculateGreeksTool,
  calculateHistoricalVolatilityTool,
  calculateMaxPainTool,
  getImpliedVolatilityTool,
  analyzeOptionsStrategyTool,

  // SEC Filings & Institutional Analysis tools
  get13FFilingsTool,          // Institutional holdings (hedge funds, mutual funds)
  get13DGFilingsTool,         // Major ownership changes (5%+ stakes, activist investors)
  get8KEventsTool,            // Material corporate events (8-K filings)

  // Fundamental Analysis tools
  getFinancialStatementsTool, // Income statements, balance sheets, cash flows, ratios
  calculateDCFValuationTool,  // Discounted cash flow intrinsic valuation
  comparePeersTool            // Peer comparison and competitive analysis
];

/**
 * Tool handlers mapped by name
 */
export const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  // Stock & Crypto handlers
  'get_quote': handleGetQuote,
  'get_quote_batch': handleGetBatchQuote,
  'get_historical_data': handleGetHistorical,
  'search_ticker': handleSearchTicker,
  'get_market_news': handleGetMarketNews,
  'get_sec_form4_filings': handleGetInsiderTrades,  // Primary SEC Form 4 handler
  'get_insider_trades': handleGetInsiderTrades,     // Legacy alias (same handler)
  'calculate_indicator': handleCalculateIndicator,

  // Options trading handlers
  'get_options_chain': handleGetOptionsChain,
  'get_earnings_calendar': handleGetEarningsCalendar,
  'get_dividend_info': handleGetDividendInfo,
  'calculate_greeks': handleCalculateGreeks,
  'calculate_historical_volatility': handleCalculateHistoricalVolatility,
  'calculate_max_pain': handleCalculateMaxPain,
  'get_implied_volatility': handleGetImpliedVolatility,
  'analyze_options_strategy': handleAnalyzeOptionsStrategy,

  // SEC Filings & Institutional Analysis handlers
  'get_13f_institutional_holdings': handleGet13FFilings,
  'get_13dg_ownership_changes': handleGet13DGFilings,
  'get_8k_material_events': handleGet8KEvents,

  // Fundamental Analysis handlers
  'get_financial_statements': handleGetFinancialStatements,
  'calculate_dcf_valuation': handleCalculateDCFValuation,
  'compare_peer_companies': handleComparePeers
};
