/**
 * Watchlist resource for tracking favorite symbols
 */

import { WatchlistItem } from '../types/market-data.js';
import { cacheService, CacheService } from '../services/cache.js';

/**
 * Watchlist resource definition
 */
export const watchlistResource = {
  uri: 'watchlist://default',
  name: 'Default Watchlist',
  description: 'Default watchlist of tracked ticker symbols',
  mimeType: 'application/json'
};

/**
 * Get watchlist
 */
export async function getWatchlist(name: string = 'default'): Promise<WatchlistItem[]> {
  const cacheKey = CacheService.generateWatchlistKey(name);
  return (await cacheService.get<WatchlistItem[]>(cacheKey)) || [];
}

/**
 * Add symbol to watchlist
 */
export async function addToWatchlist(
  symbol: string,
  name: string = 'default',
  notes?: string,
  alertPrice?: number
): Promise<WatchlistItem[]> {
  const cacheKey = CacheService.generateWatchlistKey(name);
  const watchlist = await getWatchlist(name);

  // Check if already in watchlist
  if (watchlist.some(item => item.symbol === symbol.toUpperCase())) {
    throw new Error('Symbol already in watchlist');
  }

  watchlist.push({
    symbol: symbol.toUpperCase(),
    addedAt: new Date(),
    notes,
    alertPrice
  });

  await cacheService.set(cacheKey, watchlist, 0); // No TTL for watchlist

  return watchlist;
}

/**
 * Remove symbol from watchlist
 */
export async function removeFromWatchlist(
  symbol: string,
  name: string = 'default'
): Promise<WatchlistItem[]> {
  const cacheKey = CacheService.generateWatchlistKey(name);
  const watchlist = await getWatchlist(name);

  const filtered = watchlist.filter(
    item => item.symbol.toUpperCase() !== symbol.toUpperCase()
  );

  await cacheService.set(cacheKey, filtered, 0);
  return filtered;
}

/**
 * Clear watchlist
 */
export async function clearWatchlist(name: string = 'default'): Promise<void> {
  const cacheKey = CacheService.generateWatchlistKey(name);
  await cacheService.del(cacheKey);
}

/**
 * Handle watchlist resource read
 */
export async function readWatchlistResource(uri: string): Promise<Record<string, unknown>> {
  // Parse watchlist name from URI (format: watchlist://name)
  const name = uri.replace('watchlist://', '');

  const items = await getWatchlist(name);

  return {
    name,
    items,
    count: items.length,
    lastUpdated: new Date().toISOString()
  };
}
