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
  analyzeOptionsStrategyTool
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
  'analyze_options_strategy': handleAnalyzeOptionsStrategy
};
