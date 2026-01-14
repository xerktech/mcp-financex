/**
 * Tool registry and exports
 */

import { getQuoteTool, handleGetQuote, getBatchQuoteTool, handleGetBatchQuote } from './quote.js';
import { getHistoricalTool, handleGetHistorical } from './historical.js';
import { searchTickerTool, handleSearchTicker } from './search.js';
import { getMarketNewsTool, handleGetMarketNews } from './news.js';
import { getInsiderTradesTool, handleGetInsiderTrades } from './insider.js';
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
  getInsiderTradesTool,
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
export const toolHandlers: Record<string, (args: unknown) => Promise<any>> = {
  // Stock & Crypto handlers
  'get_quote': handleGetQuote,
  'get_quote_batch': handleGetBatchQuote,
  'get_historical_data': handleGetHistorical,
  'search_ticker': handleSearchTicker,
  'get_market_news': handleGetMarketNews,
  'get_insider_trades': handleGetInsiderTrades,
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
