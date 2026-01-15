/**
 * SEC EDGAR service for fetching Form 4 insider trading data
 */

import { XMLParser } from 'fast-xml-parser';
import pThrottle from 'p-throttle';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';
import { yahooFinanceService } from './yahoo-finance.js';
import { withRetry } from '../utils/error-handler.js';
import type {
  InsiderTransaction,
  InsiderTradingAnalysis
} from '../types/market-data.js';

/**
 * SEC EDGAR service configuration
 */
const SEC_USER_AGENT = 'mcp-financex/1.0 (contact@example.com)';
const SEC_BASE_URL = 'https://www.sec.gov';
const SEC_REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Throttled fetch function to comply with SEC rate limits (10 req/sec)
 */
const throttle = pThrottle({
  limit: 10,
  interval: 1000
});

const throttledFetch = throttle(async (url: string): Promise<Response> => {
  return fetch(url, {
    headers: {
      'User-Agent': SEC_USER_AGENT,
      'Accept': 'application/xml, text/xml, */*'
    },
    signal: AbortSignal.timeout(SEC_REQUEST_TIMEOUT)
  });
});

/**
 * Company ticker to CIK mapping
 */
interface CIKMapping {
  cik_str: number;
  ticker: string;
  title: string;
}

/**
 * RSS Feed Entry
 */
interface RSSEntry {
  title: string;
  link: string | { '@_href': string } | { href: string };
  updated: string;
  published?: string;
  category?: {
    term?: string;
    label?: string;
  };
  summary?: string;
}

/**
 * SEC EDGAR Service for Form 4 insider trading data
 */
export class SECEdgarService {
  private cache: CacheService;
  private xmlParser: XMLParser;
  private tickerToCikMap: Map<string, string>;

  constructor() {
    this.cache = CacheService.getInstance();
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true
    });
    this.tickerToCikMap = new Map();
  }

  /**
   * Get recent insider trades across all companies (market-wide mode)
   */
  async getRecentInsiderTrades(
    limit: number = 20,
    transactionType: 'buy' | 'sell' | 'all' = 'all',
    startDate?: Date
  ): Promise<InsiderTransaction[]> {
    const cacheKey = `${CachePrefix.INSIDER_TRADES}:recent:${limit}:${transactionType}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Fetch RSS feed for recent Form 4 filings
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&start=0&count=${Math.min(limit * 3, 100)}&output=atom`;
          const transactions = await this.fetchAndParseRSSFeed(rssUrl, limit, transactionType, startDate);

          if (transactions.length === 0) {
            throw new Error('No filings found');
          }

          return transactions;
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'sec-error';
          throw err;
        }
      },
      CacheTTL.INSIDER_TRADES
    );
  }

  /**
   * Analyze insider trading activity for a specific company
   */
  async analyzeInsiderActivity(
    symbol: string,
    limit: number = 20,
    transactionType: 'buy' | 'sell' | 'all' = 'all',
    startDate?: Date,
    includeCompanyInfo: boolean = true
  ): Promise<InsiderTradingAnalysis> {
    const cacheKey = `${CachePrefix.INSIDER_TRADES}:symbol:${symbol}:${limit}:${transactionType}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Get CIK for symbol
          const cik = await this.getCIKForTicker(symbol);

          // Fetch company-specific RSS feed
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&start=0&count=${Math.min(limit * 2, 100)}&output=atom`;
          const transactions = await this.fetchAndParseRSSFeed(rssUrl, limit, transactionType, startDate);

          // Calculate summary statistics
          const analysis = this.calculateInsiderAnalysis(symbol, cik, transactions);

          // Optionally include company context from Yahoo Finance
          if (includeCompanyInfo) {
            try {
              const marketContext = await yahooFinanceService.getMarketContext(symbol, 0);
              analysis.profile = marketContext.profile;
              analysis.fundamentals = marketContext.fundamentals;
            } catch (error) {
              // Gracefully handle if company context fetch fails
              console.error('Failed to fetch company context:', error);
            }
          }

          return analysis;
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'sec-error';
          throw err;
        }
      },
      CacheTTL.INSIDER_TRADES
    );
  }

  /**
   * Fetch and parse RSS feed for Form 4 filings
   */
  private async fetchAndParseRSSFeed(
    url: string,
    limit: number,
    transactionType: 'buy' | 'sell' | 'all',
    startDate?: Date
  ): Promise<InsiderTransaction[]> {
    const response = await withRetry(
      async () => {
        const res = await throttledFetch(url);
        if (!res.ok) {
          throw new Error(`SEC API returned ${res.status}: ${res.statusText}`);
        }
        return res;
      },
      {
        maxRetries: 3,
        shouldRetry: (error: unknown) => {
          // Don't retry on rate limits or 404s
          const message = (error as Error).message || '';
          if (message.includes('403') || message.includes('404')) {
            return false;
          }
          // Retry on 503 and network errors
          return message.includes('503') || message.includes('timeout') || message.includes('network');
        }
      }
    );

    const xmlText = await response.text();
    const feed = this.xmlParser.parse(xmlText);

    // Extract entries from the feed
    const entries: RSSEntry[] = this.extractRSSEntries(feed);

    if (!entries || entries.length === 0) {
      return [];
    }

    // Parse Form 4 filings in parallel (batches of 5)
    const transactions: InsiderTransaction[] = [];
    const batchSize = 5;

    for (let i = 0; i < Math.min(entries.length, limit * 2); i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(entry => this.parseForm4FromEntry(entry))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          const txns = result.value;
          for (const txn of txns) {
            // Filter by transaction type
            if (transactionType !== 'all') {
              const txnType = txn.transactionType.toLowerCase();
              if (transactionType === 'buy' && txnType !== 'buy') {
                continue;
              }
              if (transactionType === 'sell' && txnType !== 'sell') {
                continue;
              }
            }

            // Filter by date
            if (startDate && txn.transactionDate < startDate) {
              continue;
            }

            transactions.push(txn);
            if (transactions.length >= limit) {
              break;
            }
          }
        }
        if (transactions.length >= limit) {
          break;
        }
      }
      if (transactions.length >= limit) {
        break;
      }
    }

    return transactions.slice(0, limit);
  }

  /**
   * Extract RSS entries from parsed feed
   */
  private extractRSSEntries(feed: Record<string, unknown>): RSSEntry[] {
    // Handle different RSS/Atom feed structures
    const feedData = feed as { feed?: { entry?: unknown }; rss?: { channel?: { item?: unknown } } };
    const entries = feedData.feed?.entry || feedData.rss?.channel?.item || [];
    return Array.isArray(entries) ? (entries as RSSEntry[]) : [entries as RSSEntry];
  }

  /**
   * Parse Form 4 filing from RSS entry
   */
  private async parseForm4FromEntry(entry: RSSEntry): Promise<InsiderTransaction[]> {
    try {
      // Extract basic info from RSS entry
      const title = entry.title || '';
      // Handle link as string or object (XML parser sometimes returns { '@_href': url })
      let link = '';
      if (typeof entry.link === 'string') {
        link = entry.link;
      } else if (entry.link && typeof entry.link === 'object') {
        link = (entry.link as { '@_href'?: string; href?: string })['@_href'] ||
               (entry.link as { '@_href'?: string; href?: string })['href'] || '';
      }
      const filingDate = new Date(entry.updated || entry['published'] || new Date());

      // Extract issuer and reporting owner from title
      // Title format: "4 - Company Name (CIK) (Filer)"
      const titleMatch = title.match(/4\s*-\s*([^(]+)\((\d+)\)/);
      const issuerName = titleMatch ? titleMatch[1].trim() : 'Unknown';
      const issuerCik = titleMatch ? titleMatch[2].trim() : '';

      // For now, create a basic transaction from RSS metadata
      // In a full implementation, we would fetch and parse the actual Form 4 XML
      const transaction: InsiderTransaction = {
        filingDate,
        transactionDate: filingDate, // Approximate - would get actual date from XML
        insiderName: this.extractInsiderNameFromTitle(title),
        position: undefined,
        transactionType: 'Other', // Would determine from XML
        shares: 0, // Would get from XML
        value: 0, // Would calculate from XML
        formType: 'Form 4',
        filingUrl: link.startsWith('http') ? link : `${SEC_BASE_URL}${link}`,
        issuerCik,
        issuerName,
        issuerTicker: undefined
      };

      return [transaction];
    } catch (error) {
      console.error('Failed to parse Form 4 entry:', error);
      return [];
    }
  }

  /**
   * Extract insider name from RSS title
   */
  private extractInsiderNameFromTitle(title: string): string {
    // Try to extract name from various title formats
    const match = title.match(/\(Filer\)\s*-\s*([^(]+)/);
    if (match) {
      return match[1].trim();
    }

    // Fallback: use last part after dash
    const parts = title.split('-');
    if (parts.length > 1) {
      return parts[parts.length - 1].trim();
    }

    return 'Unknown Insider';
  }

  /**
   * Calculate insider trading analysis from transactions
   */
  private calculateInsiderAnalysis(
    symbol: string,
    cik: string,
    transactions: InsiderTransaction[]
  ): InsiderTradingAnalysis {
    let netShares = 0;
    let netValue = 0;
    let buyTransactions = 0;
    let sellTransactions = 0;
    let exerciseTransactions = 0;
    let otherTransactions = 0;

    const insiderMap = new Map<string, { name: string; position: string; totalValue: number; netShares: number }>();

    for (const txn of transactions) {
      const txnType = txn.transactionType.toLowerCase();

      // Count transaction types
      if (txnType.includes('buy')) {
        buyTransactions++;
        netShares += txn.shares;
        netValue += txn.value;
      } else if (txnType.includes('sell')) {
        sellTransactions++;
        netShares -= txn.shares;
        netValue -= txn.value;
      } else if (txnType.includes('exercise')) {
        exerciseTransactions++;
      } else {
        otherTransactions++;
      }

      // Track by insider
      const insiderKey = txn.insiderName;
      const existing = insiderMap.get(insiderKey);
      if (existing) {
        existing.totalValue += Math.abs(txn.value);
        existing.netShares += txnType.includes('buy') ? txn.shares : -txn.shares;
      } else {
        insiderMap.set(insiderKey, {
          name: txn.insiderName,
          position: txn.position || 'Unknown',
          totalValue: Math.abs(txn.value),
          netShares: txnType.includes('buy') ? txn.shares : -txn.shares
        });
      }
    }

    // Get top insiders by total value
    const topInsiders = Array.from(insiderMap.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    return {
      symbol,
      cik,
      timestamp: new Date(),
      totalTransactions: transactions.length,
      netShares,
      netValue,
      buyTransactions,
      sellTransactions,
      exerciseTransactions,
      otherTransactions,
      recentTransactions: transactions,
      topInsiders: topInsiders.length > 0 ? topInsiders : undefined
    };
  }

  /**
   * Get CIK for a ticker symbol
   */
  async getCIKForTicker(ticker: string): Promise<string> {
    const normalizedTicker = ticker.toUpperCase();

    // Check in-memory cache first
    const memCached = this.tickerToCikMap.get(normalizedTicker);
    if (memCached) {
      return memCached;
    }

    // Check persistent cache
    const cacheKey = `${CachePrefix.CIK_MAP}:ticker:${normalizedTicker}`;
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) {
      this.tickerToCikMap.set(normalizedTicker, cached);
      return cached;
    }

    // Fetch from SEC company tickers endpoint
    try {
      const cik = await this.fetchCIKFromSEC(normalizedTicker);

      // Cache both in-memory and persistent
      this.tickerToCikMap.set(normalizedTicker, cik);
      await this.cache.set(cacheKey, cik, CacheTTL.CIK_MAPPING);

      return cik;
    } catch (error: unknown) {
      const err = error as Error & { type?: string };
      err.message = `CIK not found for ticker ${ticker}`;
      err.type = 'sec-error';
      throw err;
    }
  }

  /**
   * Fetch CIK from SEC company tickers JSON
   */
  private async fetchCIKFromSEC(ticker: string): Promise<string> {
    const cacheKey = CachePrefix.COMPANY_TICKERS;

    // Get or fetch company tickers JSON
    const companyTickers = await this.cache.getOrSet<Record<string, CIKMapping>>(
      cacheKey,
      async () => {
        const response = await withRetry(
          async () => {
            const res = await throttledFetch(`${SEC_BASE_URL}/files/company_tickers.json`);
            if (!res.ok) {
              throw new Error(`Failed to fetch company tickers: ${res.status}`);
            }
            return res;
          },
          { maxRetries: 3 }
        );

        const json = await response.json();
        return json as Record<string, CIKMapping>;
      },
      CacheTTL.COMPANY_TICKERS
    );

    // Search for ticker in the mappings
    for (const key of Object.keys(companyTickers)) {
      const company = companyTickers[key];
      if (company.ticker.toUpperCase() === ticker) {
        // Format CIK with leading zeros (10 digits)
        return company.cik_str.toString().padStart(10, '0');
      }
    }

    throw new Error(`No matching Ticker Symbol found for ${ticker}`);
  }
}

/**
 * Singleton instance
 */
export const secEdgarService = new SECEdgarService();
