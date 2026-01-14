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
 * Resource data type - flexible structure for MCP resources
 */
type ResourceData = Record<string, unknown>;

/**
 * Resource handler function type
 */
type ResourceHandler = (uri: string) => Promise<ResourceData>;

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
export const resourceHandlers: Record<string, ResourceHandler> = {
  'watchlist': readWatchlistResource,
  'market://summary': readMarketSummaryResource,
  'market://trending': readTrendingResource
};

/**
 * Get resource handler for URI
 */
export function getResourceHandler(uri: string): ResourceHandler | undefined {
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
