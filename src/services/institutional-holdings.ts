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

      // Extract accession number from title, link, or id
      let accessionNumber = '';
      const accessionMatch = link.match(/(\d{10}-\d{2}-\d{6})/);
      if (accessionMatch) {
        accessionNumber = accessionMatch[1];
      } else if (entry.id) {
        const idMatch = (entry.id as string).match(/(\d{10}-\d{2}-\d{6})/);
        if (idMatch) {
          accessionNumber = idMatch[1];
        }
      }

      // Try to fetch and parse the actual 13F XML document
      let holdings: InstitutionalHolding[] = [];
      let institutionName = 'Institution';
      let periodOfReport = filingDate;

      if (accessionNumber) {
        try {
          const result = await this.fetch13FXmlDocument(cik, accessionNumber);
          holdings = result.holdings;
          institutionName = result.institutionName || institutionName;
          periodOfReport = result.periodOfReport || periodOfReport;
        } catch (error) {
          console.warn(`Failed to fetch 13F XML for ${accessionNumber}, using fallback`, error);
        }
      }

      // Calculate summary
      const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
      const totalHoldings = holdings.length;
      const topHoldings = [...holdings]
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      return {
        institution: {
          name: institutionName,
          cik: cik,
          fileNumber: undefined
        },
        filing: {
          periodOfReport: periodOfReport,
          filingDate: filingDate,
          accessionNumber: accessionNumber,
          documentUrl: link.startsWith('http') ? link : `${SEC_BASE_URL}${link}`
        },
        summary: {
          totalValue,
          totalHoldings,
          topHoldings
        },
        holdings
      };
    } catch (error) {
      console.error('Failed to parse 13F entry:', error);
      return null;
    }
  }

  /**
   * Fetch and parse 13F-HR XML document to extract holdings
   */
  private async fetch13FXmlDocument(cik: string, accessionNumber: string): Promise<{
    holdings: InstitutionalHolding[];
    institutionName?: string;
    periodOfReport?: Date;
  }> {
    // Construct URL to the primary document (informationTable.xml or form13fInfoTable.xml)
    const accessionNoDashes = accessionNumber.replace(/-/g, '');
    const paddedCik = cik.padStart(10, '0');

    // Try common 13F information table file names
    const possibleUrls = [
      `${SEC_BASE_URL}/Archives/edgar/data/${paddedCik}/${accessionNoDashes}/informationTable.xml`,
      `${SEC_BASE_URL}/Archives/edgar/data/${paddedCik}/${accessionNoDashes}/form13fInfoTable.xml`,
      `${SEC_BASE_URL}/Archives/edgar/data/${paddedCik}/${accessionNoDashes}/primary_doc.xml`
    ];

    let xmlText = '';
    for (const url of possibleUrls) {
      try {
        const response = await throttledFetch(url);
        if (response.ok) {
          xmlText = await response.text();
          break;
        }
      } catch {
        // Try next URL
      }
    }

    if (!xmlText) {
      throw new Error('Could not fetch 13F information table');
    }

    const parsed = this.xmlParser.parse(xmlText);

    // Parse the information table
    const infoTable = parsed.informationTable || parsed.edgarSubmission?.informationTable || parsed;
    const holdings: InstitutionalHolding[] = [];

    // Extract holdings from infoTable
    let entries = infoTable.infoTable || [];
    if (!Array.isArray(entries)) {
      entries = entries ? [entries] : [];
    }

    for (const entry of entries) {
      const holding: InstitutionalHolding = {
        nameOfIssuer: entry.nameOfIssuer || '',
        titleOfClass: entry.titleOfClass || '',
        cusip: entry.cusip || '',
        value: Number(entry.value || 0),
        shares: Number((entry.shrsOrPrnAmt?.sshPrnamt || entry.shrsOrPrnAmt) || 0),
        shareType: (entry.shrsOrPrnAmt?.sshPrnamtType || 'SH') as 'SH' | 'PRN',
        putCall: entry.putCall as 'Put' | 'Call' | undefined,
        investmentDiscretion: (entry.investmentDiscretion || 'SOLE') as 'SOLE' | 'SHARED' | 'NONE',
        votingAuthority: entry.votingAuthority ? {
          sole: Number(entry.votingAuthority.Sole || 0),
          shared: Number(entry.votingAuthority.Shared || 0),
          none: Number(entry.votingAuthority.None || 0)
        } : undefined
      };

      holdings.push(holding);
    }

    // Extract metadata
    const coverPage = parsed.edgarSubmission?.headerData || parsed.headerData || {};
    const institutionName = coverPage.filerInfo?.filer?.name || undefined;
    const periodOfReport = coverPage.reportingPeriodDate ? new Date(coverPage.reportingPeriodDate) : undefined;

    return {
      holdings,
      institutionName,
      periodOfReport
    };
  }
}

/**
 * Singleton instance
 */
export const institutionalHoldingsService = new InstitutionalHoldingsService();
