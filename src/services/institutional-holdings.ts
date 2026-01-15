/**
 * Institutional Holdings Service - 13F Filings Analysis
 *
 * Tracks institutional investor holdings (hedge funds, mutual funds, etc.)
 * from SEC Form 13F filed quarterly by institutions managing >$100M
 */

import { XMLParser } from 'fast-xml-parser';
import pThrottle from 'p-throttle';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';
import { withRetry } from '../utils/error-handler.js';

const SEC_USER_AGENT = 'mcp-financex/1.0 (contact@example.com)';
const SEC_BASE_URL = 'https://www.sec.gov';
const SEC_REQUEST_TIMEOUT = 30000;

/**
 * Throttled fetch for SEC API compliance (10 req/sec)
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
 * 13F Holding (individual position)
 */
export interface InstitutionalHolding {
  nameOfIssuer: string;
  titleOfClass: string;
  cusip: string;
  value: number;              // Market value in thousands
  shares: number;
  shareType: 'SH' | 'PRN';   // SH=Shares, PRN=Principal amount
  putCall?: 'Put' | 'Call';  // For options
  investmentDiscretion: 'SOLE' | 'SHARED' | 'NONE';
  votingAuthority?: {
    sole: number;
    shared: number;
    none: number;
  };
}

/**
 * 13F Filing Summary
 */
export interface InstitutionalFiling {
  institution: {
    name: string;
    cik: string;
    fileNumber?: string;
  };
  filing: {
    periodOfReport: Date;      // Quarter end date
    filingDate: Date;
    accessionNumber: string;
    documentUrl: string;
  };
  summary: {
    totalValue: number;         // Total portfolio value
    totalHoldings: number;      // Number of positions
    topHoldings: InstitutionalHolding[];
  };
  holdings: InstitutionalHolding[];
}

/**
 * Institutional Holdings Service
 */
export class InstitutionalHoldingsService {
  private cache: CacheService;
  private xmlParser: XMLParser;

  constructor() {
    this.cache = CacheService.getInstance();
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true
    });
  }

  /**
   * Get 13F filings for an institution by CIK
   */
  async getInstitutionFilings(
    cik: string,
    limit: number = 10
  ): Promise<InstitutionalFiling[]> {
    const cacheKey = `${CachePrefix.INSTITUTIONAL}:filings:${cik}:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Fetch 13F-HR filings RSS feed for the institution
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F-HR&dateb=&owner=include&start=0&count=${limit}&output=atom`;

          const response = await withRetry(
            async () => {
              const res = await throttledFetch(rssUrl);
              if (!res.ok) {
                throw new Error(`SEC API returned ${res.status}: ${res.statusText}`);
              }
              return res;
            },
            { maxRetries: 3 }
          );

          const xmlText = await response.text();
          const feed = this.xmlParser.parse(xmlText);

          // Extract entries from feed
          const feedData = feed as { feed?: { entry?: unknown } };
          const entries = feedData.feed?.entry || [];
          const entriesArray = Array.isArray(entries) ? entries : [entries];

          // Parse each 13F filing
          const filings: InstitutionalFiling[] = [];
          for (const entry of entriesArray.slice(0, limit)) {
            try {
              const filing = await this.parse13FEntry(entry, cik);
              if (filing) {
                filings.push(filing);
              }
            } catch (error) {
              console.error('Failed to parse 13F entry:', error);
            }
          }

          return filings;
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'institutional-error';
          throw err;
        }
      },
      CacheTTL.INSTITUTIONAL_HOLDINGS
    );
  }

  /**
   * Get institutions holding a specific stock (by ticker or CUSIP)
   */
  async getInstitutionsHoldingStock(
    tickerOrCusip: string,
    minValue?: number,
    limit: number = 20
  ): Promise<Array<{
    institution: string;
    cik: string;
    shares: number;
    value: number;
    percentOfPortfolio?: number;
    filingDate: Date;
  }>> {
    const cacheKey = `${CachePrefix.INSTITUTIONAL}:holders:${tickerOrCusip}:${minValue}:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Note: This would require a database or index of 13F holdings
        // For MVP, return empty array with a note that full implementation requires
        // either scraping many 13F filings or using a commercial API
        // Full institutional holders lookup requires indexed 13F data
        return [];
      },
      CacheTTL.INSTITUTIONAL_HOLDINGS
    );
  }

  /**
   * Compare institution's holdings between two quarters
   */
  async compareInstitutionFilings(
    cik: string,
    quarters: number = 2
  ): Promise<{
    additions: InstitutionalHolding[];
    reductions: InstitutionalHolding[];
    increases: InstitutionalHolding[];
    decreases: InstitutionalHolding[];
  }> {
    const filings = await this.getInstitutionFilings(cik, quarters);

    if (filings.length < 2) {
      return { additions: [], reductions: [], increases: [], decreases: [] };
    }

    const recent = new Map(filings[0].holdings.map(h => [h.cusip, h]));
    const previous = new Map(filings[1].holdings.map(h => [h.cusip, h]));

    const additions: InstitutionalHolding[] = [];
    const increases: InstitutionalHolding[] = [];
    const decreases: InstitutionalHolding[] = [];
    const reductions: InstitutionalHolding[] = [];

    // Find additions and increases
    for (const [cusip, holding] of recent) {
      const prevHolding = previous.get(cusip);
      if (!prevHolding) {
        additions.push(holding);
      } else if (holding.shares > prevHolding.shares) {
        increases.push(holding);
      } else if (holding.shares < prevHolding.shares) {
        decreases.push(holding);
      }
    }

    // Find reductions (sold positions)
    for (const [cusip, holding] of previous) {
      if (!recent.has(cusip)) {
        reductions.push(holding);
      }
    }

    return { additions, reductions, increases, decreases };
  }

  /**
   * Parse 13F entry from RSS feed
   */
  private async parse13FEntry(entry: Record<string, unknown>, cik: string): Promise<InstitutionalFiling | null> {
    try {
      const title = (entry.title as string) || '';
      const link = typeof entry.link === 'string' ? entry.link : (entry.link as { '@_href'?: string })?.['@_href'] || '';
      const filingDate = new Date((entry.updated as string) || (entry.published as string) || new Date());

      // Extract accession number from title or link
      const accessionMatch = title.match(/13F-HR/) || link.match(/accession[_-]number=([0-9-]+)/i);
      const accessionNumber = accessionMatch ? (accessionMatch[1] || '') : '';

      // For MVP, return basic filing info without parsing full XML
      // Full implementation would fetch and parse the 13F-HR XML/HTML document
      return {
        institution: {
          name: 'Institution', // Would extract from filing
          cik: cik,
          fileNumber: undefined
        },
        filing: {
          periodOfReport: filingDate,
          filingDate: filingDate,
          accessionNumber: accessionNumber,
          documentUrl: link.startsWith('http') ? link : `${SEC_BASE_URL}${link}`
        },
        summary: {
          totalValue: 0,
          totalHoldings: 0,
          topHoldings: []
        },
        holdings: []
      };
    } catch (error) {
      console.error('Failed to parse 13F entry:', error);
      return null;
    }
  }
}

/**
 * Singleton instance
 */
export const institutionalHoldingsService = new InstitutionalHoldingsService();
