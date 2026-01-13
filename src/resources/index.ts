/**
 * Resource registry and exports
 */

import {
  watchlistResource,
  readWatchlistResource
} from './watchlist.js';
import {
  marketSummaryResource,
  trendingResource,
  readMarketSummaryResource,
  readTrendingResource
} from './market-summary.js';

/**
 * All available resources
 */
export const resources = [
  watchlistResource,
  marketSummaryResource,
  trendingResource
];

/**
 * Resource handlers mapped by URI pattern
 */
export const resourceHandlers: Record<string, (uri: string) => Promise<any>> = {
  'watchlist': readWatchlistResource,
  'market://summary': readMarketSummaryResource,
  'market://trending': readTrendingResource
};

/**
 * Get resource handler for URI
 */
export function getResourceHandler(uri: string): ((uri: string) => Promise<any>) | undefined {
  // Check for exact match first
  if (resourceHandlers[uri]) {
    return resourceHandlers[uri];
  }

  // Check for pattern match (e.g., watchlist://*)
  if (uri.startsWith('watchlist://')) {
    return resourceHandlers['watchlist'];
  }

  return undefined;
}
