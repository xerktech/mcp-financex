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
  id?: string; // Contains accession number
  content?: {
    '#text'?: string;
    '@_type'?: string;
  };
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
    startDate?: Date,
    formType: '3' | '4' | '5' = '4'
  ): Promise<InsiderTransaction[]> {
    const cacheKey = `${CachePrefix.INSIDER_TRADES}:recent:${formType}:${limit}:${transactionType}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Fetch RSS feed for recent Form filings
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=${formType}&owner=include&start=0&count=${Math.min(limit * 3, 100)}&output=atom`;
          const transactions = await this.fetchAndParseRSSFeed(rssUrl, limit, transactionType, startDate, formType);

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
    includeCompanyInfo: boolean = true,
    formType: '3' | '4' | '5' = '4'
  ): Promise<InsiderTradingAnalysis> {
    const cacheKey = `${CachePrefix.INSIDER_TRADES}:symbol:${symbol}:${formType}:${limit}:${transactionType}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Get CIK for symbol
          const cik = await this.getCIKForTicker(symbol);

          // Fetch company-specific RSS feed
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${formType}&dateb=&owner=include&start=0&count=${Math.min(limit * 2, 100)}&output=atom`;
          const transactions = await this.fetchAndParseRSSFeed(rssUrl, limit, transactionType, startDate, formType);

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
   * Fetch and parse RSS feed for Form 3/4/5 filings
   */
  private async fetchAndParseRSSFeed(
    url: string,
    limit: number,
    transactionType: 'buy' | 'sell' | 'all',
    startDate?: Date,
    formType: '3' | '4' | '5' = '4'
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

    // Parse Form filings in parallel (batches of 5)
    const transactions: InsiderTransaction[] = [];
    const batchSize = 5;

    for (let i = 0; i < Math.min(entries.length, limit * 2); i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(entry => this.parseFormFromEntry(entry, formType))
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
   * Parse Form 3/4/5 filing from RSS entry
   */
  private async parseFormFromEntry(entry: RSSEntry, formType: '3' | '4' | '5' = '4'): Promise<InsiderTransaction[]> {
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

      // Extract issuer CIK from title
      // Title format: "3/4/5 - Company Name (CIK) (Filer)"
      const titleMatch = title.match(/[345]\s*-\s*([^(]+)\((\d+)\)/);
      const issuerName = titleMatch ? titleMatch[1].trim() : 'Unknown';
      const issuerCik = titleMatch ? titleMatch[2].trim() : '';

      // Get the actual Form XML URL from the RSS entry
      const xmlUrl = this.extractXmlUrlFromEntry(entry);
      if (!xmlUrl) {
        // Fallback to basic transaction if we can't get XML URL
        // In production, we would fetch the filing detail page to get the XML URL
        return this.createFallbackTransaction(filingDate, title, link, issuerName, issuerCik, formType);
      }

      // Fetch and parse the actual Form XML
      try {
        const transactions = await this.fetchAndParseOwnershipXml(xmlUrl, filingDate, issuerName, issuerCik, link, formType);
        return transactions.length > 0 ? transactions : this.createFallbackTransaction(filingDate, title, link, issuerName, issuerCik, formType);
      } catch (error) {
        // If XML fetch/parse fails, use fallback
        console.warn(`Failed to fetch/parse Form ${formType} XML, using fallback:`, error);
        return this.createFallbackTransaction(filingDate, title, link, issuerName, issuerCik, formType);
      }
    } catch (error) {
      console.error('Failed to parse Form 4 entry:', error);
      return [];
    }
  }

  /**
   * Extract XML URL from RSS entry
   */
  private extractXmlUrlFromEntry(entry: RSSEntry): string | null {
    try {
      // SEC RSS entries include an 'id' field with accession number
      // Format: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=XXXXX&type=4&dateb=&owner=include&start=0&count=100&accession_number=XXXX-XX-XXXXXX

      // Try to extract from ID field first
      if (entry.id) {
        const accessionMatch = entry.id.match(/accession[_-]number=([0-9-]+)/i);
        if (accessionMatch) {
          const accessionNumber = accessionMatch[1];
          // Extract CIK from title or link
          const title = entry.title || '';
          const cikMatch = title.match(/\((\d+)\)/);
          if (cikMatch) {
            const cik = cikMatch[1];
            // Remove dashes from accession number for directory path
            const accessionNoDashes = accessionNumber.replace(/-/g, '');
            // Construct XML URL
            // Format: https://www.sec.gov/Archives/edgar/data/CIK/ACCESSION/ACCESSION-WITH-DASHES.xml
            // or primary document
            return `${SEC_BASE_URL}/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionNumber}.xml`;
          }
        }
      }

      // Try to parse from summary or content
      if (entry.summary && typeof entry.summary === 'string') {
        const accessionMatch = entry.summary.match(/Accession Number:\s*([0-9-]+)/i);
        if (accessionMatch) {
          const accessionNumber = accessionMatch[1];
          const title = entry.title || '';
          const cikMatch = title.match(/\((\d+)\)/);
          if (cikMatch) {
            const cik = cikMatch[1];
            const accessionNoDashes = accessionNumber.replace(/-/g, '');
            return `${SEC_BASE_URL}/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionNumber}.xml`;
          }
        }
      }

      // For now, return null to use fallback parsing method
      // A full implementation would fetch the filing index page to get the actual document links
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch and parse actual Form 3/4/5 XML document (all use ownershipDocument structure)
   */
  private async fetchAndParseOwnershipXml(
    xmlUrl: string,
    filingDate: Date,
    issuerName: string,
    issuerCik: string,
    detailUrl: string,
    formType: '3' | '4' | '5' = '4'
  ): Promise<InsiderTransaction[]> {
    try {
      const response = await throttledFetch(xmlUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch Form 4 XML: ${response.status}`);
      }

      const xmlText = await response.text();
      const parsed = this.xmlParser.parse(xmlText);

      const ownershipDoc = parsed.ownershipDocument || parsed;
      if (!ownershipDoc) {
        return [];
      }

      // Extract reporting owner (insider) information
      const reportingOwner = ownershipDoc.reportingOwner || {};
      const reportingOwnerId = reportingOwner.reportingOwnerId || {};
      const insiderName = reportingOwnerId.rptOwnerName || 'Unknown Insider';

      // Extract insider position/relationship
      const reportingOwnerRelationship = reportingOwner.reportingOwnerRelationship || {};
      const positions: string[] = [];
      if (reportingOwnerRelationship.isDirector === '1' || reportingOwnerRelationship.isDirector === true) {
        positions.push('Director');
      }
      if (reportingOwnerRelationship.isOfficer === '1' || reportingOwnerRelationship.isOfficer === true) {
        positions.push(reportingOwnerRelationship.officerTitle || 'Officer');
      }
      if (reportingOwnerRelationship.isTenPercentOwner === '1' || reportingOwnerRelationship.isTenPercentOwner === true) {
        positions.push('10% Owner');
      }
      const position = positions.length > 0 ? positions.join(', ') : undefined;

      // Extract issuer (company) information
      const issuer = ownershipDoc.issuer || {};
      const issuerTradingSymbol = issuer.issuerTradingSymbol || undefined;
      const issuerNameFromXml = issuer.issuerName || issuerName;

      // Parse non-derivative transactions (common stock)
      const transactions: InsiderTransaction[] = [];

      // Handle both single transaction and array of transactions
      const nonDerivativeTable = ownershipDoc.nonDerivativeTable || {};
      let nonDerivativeTransactions = nonDerivativeTable.nonDerivativeTransaction || [];
      if (!Array.isArray(nonDerivativeTransactions)) {
        nonDerivativeTransactions = nonDerivativeTransactions ? [nonDerivativeTransactions] : [];
      }

      for (const txn of nonDerivativeTransactions) {
        const transactionDate = new Date(txn.transactionDate?.value || filingDate);

        // Transaction coding: P = Purchase, S = Sale, A = Award, M = Exercise, etc.
        const transactionCode = txn.transactionCoding?.transactionCode || 'Unknown';
        const transactionType = this.mapTransactionCode(transactionCode);

        // Transaction amounts
        const transactionAmounts = txn.transactionAmounts || {};
        const shares = Number(transactionAmounts.transactionShares?.value || 0);
        const pricePerShare = Number(transactionAmounts.transactionPricePerShare?.value || 0);
        const value = shares * pricePerShare;

        // Acquisition or disposition
        const acquiredDisposed = transactionAmounts.transactionAcquiredDisposedCode?.value || '';

        // Post-transaction ownership
        const postTransactionAmounts = txn.postTransactionAmounts || {};
        const sharesOwned = Number(postTransactionAmounts.sharesOwnedFollowingTransaction?.value || 0);

        // Security title (e.g., "Common Stock")
        const securityTitle = txn.securityTitle?.value || 'Common Stock';

        transactions.push({
          filingDate,
          transactionDate,
          insiderName,
          position,
          transactionType,
          shares,
          pricePerShare,
          value,
          sharesOwned,
          formType: `Form ${formType}` as 'Form 3' | 'Form 4' | 'Form 5',
          filingUrl: detailUrl.startsWith('http') ? detailUrl : `${SEC_BASE_URL}${detailUrl}`,
          issuerCik,
          issuerName: issuerNameFromXml,
          issuerTicker: issuerTradingSymbol,
          securityType: securityTitle,
          acquiredDisposed: acquiredDisposed as 'A' | 'D' | undefined
        });
      }

      // Also parse derivative transactions (options, warrants, etc.)
      const derivativeTable = ownershipDoc.derivativeTable || {};
      let derivativeTransactions = derivativeTable.derivativeTransaction || [];
      if (!Array.isArray(derivativeTransactions)) {
        derivativeTransactions = derivativeTransactions ? [derivativeTransactions] : [];
      }

      for (const txn of derivativeTransactions) {
        const transactionDate = new Date(txn.transactionDate?.value || filingDate);

        const transactionCode = txn.transactionCoding?.transactionCode || 'Unknown';
        const transactionType = this.mapTransactionCode(transactionCode);

        const transactionAmounts = txn.transactionAmounts || {};
        const shares = Number(transactionAmounts.transactionShares?.value || 0);
        const pricePerShare = Number(transactionAmounts.transactionPricePerShare?.value || 0);

        const acquiredDisposed = transactionAmounts.transactionAcquiredDisposedCode?.value || '';

        // Underlying security
        const underlyingSecurity = txn.underlyingSecurity || {};
        const underlyingShares = Number(underlyingSecurity.underlyingSecurityShares?.value || shares);

        // Security title (e.g., "Stock Option", "Restricted Stock Unit")
        const securityTitle = txn.securityTitle?.value || 'Derivative Security';

        transactions.push({
          filingDate,
          transactionDate,
          insiderName,
          position,
          transactionType,
          shares: underlyingShares, // Use underlying shares for derivatives
          pricePerShare,
          value: underlyingShares * pricePerShare,
          formType: `Form ${formType}` as 'Form 3' | 'Form 4' | 'Form 5',
          filingUrl: detailUrl.startsWith('http') ? detailUrl : `${SEC_BASE_URL}${detailUrl}`,
          issuerCik,
          issuerName: issuerNameFromXml,
          issuerTicker: issuerTradingSymbol,
          securityType: securityTitle,
          acquiredDisposed: acquiredDisposed as 'A' | 'D' | undefined,
          isDerivative: true
        });
      }

      return transactions;
    } catch (error) {
      console.error('Failed to parse Form 4 XML:', error);
      return [];
    }
  }

  /**
   * Map SEC transaction code to human-readable type
   */
  private mapTransactionCode(code: string): 'Buy' | 'Sell' | 'Award' | 'Exercise' | 'Tax Payment' | 'Gift' | 'Disposal' | 'Conversion' | 'Other' {
    const codeMap: Record<string, 'Buy' | 'Sell' | 'Award' | 'Exercise' | 'Tax Payment' | 'Gift' | 'Disposal' | 'Conversion' | 'Other'> = {
      'P': 'Buy',
      'S': 'Sell',
      'A': 'Award',
      'D': 'Disposal',
      'F': 'Tax Payment',
      'I': 'Other',
      'M': 'Exercise',
      'C': 'Conversion',
      'E': 'Other',
      'H': 'Other',
      'J': 'Other',
      'G': 'Gift',
      'L': 'Buy',
      'W': 'Buy',
      'Z': 'Other',
      'U': 'Other'
    };

    return codeMap[code.toUpperCase()] || 'Other';
  }

  /**
   * Create fallback transaction when XML parsing fails
   */
  private createFallbackTransaction(
    filingDate: Date,
    title: string,
    link: string,
    issuerName: string,
    issuerCik: string,
    formType: '3' | '4' | '5' = '4'
  ): InsiderTransaction[] {
    const transaction: InsiderTransaction = {
      filingDate,
      transactionDate: filingDate,
      insiderName: this.extractInsiderNameFromTitle(title),
      position: undefined,
      transactionType: 'Other',
      shares: 0,
      value: 0,
      formType: `Form ${formType}` as 'Form 3' | 'Form 4' | 'Form 5',
      filingUrl: link.startsWith('http') ? link : `${SEC_BASE_URL}${link}`,
      issuerCik,
      issuerName,
      issuerTicker: undefined
    };

    return [transaction];
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
