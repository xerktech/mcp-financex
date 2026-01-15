/**
 * Ownership Changes Service - 13D/G Filings
 *
 * Tracks major ownership changes (5%+ stakes) and activist investor activity
 * from SEC Schedule 13D and 13G filings
 */

import { XMLParser } from 'fast-xml-parser';
import pThrottle from 'p-throttle';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';
import { withRetry } from '../utils/error-handler.js';

const SEC_USER_AGENT = 'mcp-financex/1.0 (contact@example.com)';
const SEC_BASE_URL = 'https://www.sec.gov';
const SEC_REQUEST_TIMEOUT = 30000;

/**
 * Throttled fetch for SEC API compliance
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
 * Ownership change filing (13D or 13G)
 */
export interface OwnershipChangeFiling {
  formType: '13D' | '13D/A' | '13G' | '13G/A';
  filingDate: Date;
  reportingPerson: {
    name: string;
    cik: string;
    address?: string;
  };
  issuer: {
    name: string;
    ticker?: string;
    cik: string;
  };
  ownership: {
    percentOfClass: number;
    shares: number;
    votingPower?: number;
    dispositivePower?: number;
  };
  purpose?: string;           // Purpose of transaction (for 13D)
  isAmendment: boolean;
  documentUrl: string;
  accessionNumber: string;
}

/**
 * Ownership Changes Service
 */
export class OwnershipChangesService {
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
   * Get recent 13D/G filings (market-wide)
   */
  async getRecentOwnershipFilings(
    formType: '13D' | '13G' | 'both' = 'both',
    limit: number = 20
  ): Promise<OwnershipChangeFiling[]> {
    const cacheKey = `${CachePrefix.OWNERSHIP}:recent:${formType}:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          const filings: OwnershipChangeFiling[] = [];

          if (formType === '13D' || formType === 'both') {
            const sc13dFilings = await this.fetchFilingsByType('SC 13D', limit);
            filings.push(...sc13dFilings);
          }

          if (formType === '13G' || formType === 'both') {
            const sc13gFilings = await this.fetchFilingsByType('SC 13G', limit);
            filings.push(...sc13gFilings);
          }

          // Sort by filing date (most recent first)
          filings.sort((a, b) => b.filingDate.getTime() - a.filingDate.getTime());

          return filings.slice(0, limit);
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'ownership-error';
          throw err;
        }
      },
      CacheTTL.OWNERSHIP_CHANGES
    );
  }

  /**
   * Get 13D/G filings for a specific company (by ticker or CIK)
   */
  async getCompanyOwnershipFilings(
    symbolOrCik: string,
    limit: number = 10
  ): Promise<OwnershipChangeFiling[]> {
    const cacheKey = `${CachePrefix.OWNERSHIP}:company:${symbolOrCik}:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Try to fetch both 13D and 13G filings for the company
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcompany&CIK=${symbolOrCik}&type=SC+13&dateb=&owner=exclude&start=0&count=${limit}&output=atom`;

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

          const feedData = feed as { feed?: { entry?: unknown } };
          const entries = feedData.feed?.entry || [];
          const entriesArray = Array.isArray(entries) ? entries : [entries];

          const filings: OwnershipChangeFiling[] = [];
          for (const entry of entriesArray.slice(0, limit)) {
            try {
              const filing = await this.parseOwnershipEntry(entry);
              if (filing) {
                filings.push(filing);
              }
            } catch (error) {
              console.error('Failed to parse ownership entry:', error);
            }
          }

          return filings;
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'ownership-error';
          throw err;
        }
      },
      CacheTTL.OWNERSHIP_CHANGES
    );
  }

  /**
   * Get activist investors (those filing 13D with acquisition purpose)
   */
  async getActivistInvestors(
    limit: number = 20
  ): Promise<Array<{
    investor: string;
    investorCik: string;
    targets: Array<{
      company: string;
      ticker?: string;
      percentOwned: number;
      purpose: string;
    }>;
  }>> {
    const cacheKey = `${CachePrefix.OWNERSHIP}:activists:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Get recent 13D filings (13D typically indicates activist intent)
        const filings = await this.getRecentOwnershipFilings('13D', limit * 2);

        // Group by investor
        const investorMap = new Map<string, {
          investor: string;
          investorCik: string;
          targets: Array<{
            company: string;
            ticker?: string;
            percentOwned: number;
            purpose: string;
          }>;
        }>();

        for (const filing of filings) {
          const key = filing.reportingPerson.cik;
          let investor = investorMap.get(key);

          if (!investor) {
            investor = {
              investor: filing.reportingPerson.name,
              investorCik: filing.reportingPerson.cik,
              targets: []
            };
            investorMap.set(key, investor);
          }

          investor.targets.push({
            company: filing.issuer.name,
            ticker: filing.issuer.ticker,
            percentOwned: filing.ownership.percentOfClass,
            purpose: filing.purpose || 'Not specified'
          });
        }

        return Array.from(investorMap.values()).slice(0, limit);
      },
      CacheTTL.OWNERSHIP_CHANGES
    );
  }

  /**
   * Fetch filings by type from SEC RSS feed
   */
  private async fetchFilingsByType(
    type: string,
    limit: number
  ): Promise<OwnershipChangeFiling[]> {
    const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(type)}&count=${limit}&output=atom`;

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

    const feedData = feed as { feed?: { entry?: unknown } };
    const entries = feedData.feed?.entry || [];
    const entriesArray = Array.isArray(entries) ? entries : [entries];

    const filings: OwnershipChangeFiling[] = [];
    for (const entry of entriesArray) {
      try {
        const filing = await this.parseOwnershipEntry(entry);
        if (filing) {
          filings.push(filing);
        }
      } catch (error) {
        console.error('Failed to parse ownership entry:', error);
      }
    }

    return filings;
  }

  /**
   * Parse ownership filing entry from RSS feed
   */
  private async parseOwnershipEntry(entry: Record<string, unknown>): Promise<OwnershipChangeFiling | null> {
    try {
      const title = (entry.title as string) || '';
      const link = typeof entry.link === 'string' ? entry.link : (entry.link as { '@_href'?: string })?.['@_href'] || '';
      const filingDate = new Date((entry.updated as string) || (entry.published as string) || new Date());

      // Determine form type from title
      // Title format: "SC 13D - Company Name (CIK) (Filer)"
      let formType: '13D' | '13D/A' | '13G' | '13G/A' = '13D';
      const isAmendment = title.includes('/A');

      if (title.includes('SC 13D')) {
        formType = isAmendment ? '13D/A' : '13D';
      } else if (title.includes('SC 13G')) {
        formType = isAmendment ? '13G/A' : '13G';
      }

      // Extract company and filer info from title
      const titleMatch = title.match(/SC 13[DG](?:\/A)?\s*-\s*([^(]+)\((\d+)\)/);
      const issuerName = titleMatch ? titleMatch[1].trim() : 'Unknown';
      const issuerCik = titleMatch ? titleMatch[2].trim() : '';

      // For MVP, return basic filing info
      // Full implementation would fetch and parse the actual 13D/G document
      return {
        formType,
        filingDate,
        reportingPerson: {
          name: 'Reporting Person', // Would extract from filing
          cik: '',
          address: undefined
        },
        issuer: {
          name: issuerName,
          ticker: undefined,
          cik: issuerCik
        },
        ownership: {
          percentOfClass: 0, // Would extract from filing
          shares: 0,
          votingPower: undefined,
          dispositivePower: undefined
        },
        purpose: undefined,
        isAmendment,
        documentUrl: link.startsWith('http') ? link : `${SEC_BASE_URL}${link}`,
        accessionNumber: ''
      };
    } catch (error) {
      console.error('Failed to parse ownership entry:', error);
      return null;
    }
  }
}

/**
 * Singleton instance
 */
export const ownershipChangesService = new OwnershipChangesService();
