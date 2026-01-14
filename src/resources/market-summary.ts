/**
 * Market summary resources for market overview
 */

import { yahooFinanceService } from '../services/yahoo-finance.js';

/**
 * Market summary resource definition
 */
export const marketSummaryResource = {
  uri: 'market://summary',
  name: 'Market Summary',
  description: 'Real-time summary of major market indices (S&P 500, Dow Jones, NASDAQ, VIX)',
  mimeType: 'application/json'
};

/**
 * Trending stocks resource definition
 */
export const trendingResource = {
  uri: 'market://trending',
  name: 'Trending Stocks',
  description: 'Most active and trending stocks',
  mimeType: 'application/json'
};

/**
 * Handle market summary resource read
 */
export async function readMarketSummaryResource(): Promise<Record<string, unknown>> {
  const summary = await yahooFinanceService.getMarketSummary();

  return {
    timestamp: new Date().toISOString(),
    indices: summary
  };
}

/**
 * Handle trending resource read
 */
export async function readTrendingResource(): Promise<Record<string, unknown>> {
  const trending = await yahooFinanceService.getTrending(10);

  return {
    timestamp: new Date().toISOString(),
    count: trending.length,
    stocks: trending
  };
}
