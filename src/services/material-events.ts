/**
 * Material Events Service - SEC Form 8-K Filings
 *
 * Tracks current reports of material corporate events filed via Form 8-K
 * These are filed within 4 business days of the event
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
 * 8-K Item categories (regulatory sections)
 */
export const Item8KCategories = {
  // Section 1 - Registrant's Business and Operations
  '1.01': 'Entry into Material Definitive Agreement',
  '1.02': 'Termination of Material Definitive Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '1.04': 'Mine Safety - Reporting of Shutdowns and Patterns of Violations',
  '1.05': 'Material Cybersecurity Incidents',

  // Section 2 - Financial Information
  '2.01': 'Completion of Acquisition or Disposition of Assets',
  '2.02': 'Results of Operations and Financial Condition',
  '2.03': 'Creation of Direct Financial Obligation',
  '2.04': 'Triggering Events That Accelerate or Increase Obligation',
  '2.05': 'Cost Associated with Exit or Disposal Activities',
  '2.06': 'Material Impairments',

  // Section 3 - Securities and Trading Markets
  '3.01': 'Notice of Delisting or Failure to Satisfy Listing Rule',
  '3.02': 'Unregistered Sales of Equity Securities',
  '3.03': 'Material Modification to Rights of Security Holders',

  // Section 4 - Matters Related to Accountants
  '4.01': 'Changes in Registrant\'s Certifying Accountant',
  '4.02': 'Non-Reliance on Previously Issued Financial Statements',

  // Section 5 - Corporate Governance and Management
  '5.01': 'Changes in Control of Registrant',
  '5.02': 'Departure/Election of Directors or Officers',
  '5.03': 'Amendments to Articles of Incorporation or Bylaws',
  '5.04': 'Temporary Suspension of Trading Under Employee Benefit Plans',
  '5.05': 'Amendment to Registrant\'s Code of Ethics',
  '5.06': 'Change in Shell Company Status',
  '5.07': 'Submission of Matters to Vote of Security Holders',
  '5.08': 'Shareholder Nominations',

  // Section 7 - Regulation FD
  '7.01': 'Regulation FD Disclosure',

  // Section 8 - Other Events
  '8.01': 'Other Events',

  // Section 9 - Financial Statements and Exhibits
  '9.01': 'Financial Statements and Exhibits'
} as const;

/**
 * Material event from 8-K filing
 */
export interface MaterialEvent {
  formType: '8-K' | '8-K/A';
  filingDate: Date;
  eventDate: Date;
  company: {
    name: string;
    ticker?: string;
    cik: string;
  };
  items: Array<{
    itemNumber: string;
    itemDescription: string;
    category: 'business' | 'financial' | 'securities' | 'governance' | 'disclosure' | 'other';
  }>;
  headline?: string;
  documentUrl: string;
  accessionNumber: string;
}

/**
 * Material Events Service
 */
export class MaterialEventsService {
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
   * Get recent 8-K filings (market-wide)
   */
  async getRecentMaterialEvents(
    limit: number = 20,
    itemFilter?: string[]
  ): Promise<MaterialEvent[]> {
    const filterKey = itemFilter ? itemFilter.sort().join(',') : 'all';
    const cacheKey = `${CachePrefix.MATERIAL_EVENTS}:recent:${limit}:${filterKey}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=${Math.min(limit * 2, 100)}&output=atom`;

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

          const events: MaterialEvent[] = [];
          for (const entry of entriesArray) {
            try {
              const event = await this.parse8KEntry(entry);
              if (event) {
                // Filter by item numbers if specified
                if (itemFilter && itemFilter.length > 0) {
                  const hasMatchingItem = event.items.some(item =>
                    itemFilter.includes(item.itemNumber)
                  );
                  if (!hasMatchingItem) {
                    continue;
                  }
                }
                events.push(event);
                if (events.length >= limit) {
                  break;
                }
              }
            } catch (error) {
              console.error('Failed to parse 8-K entry:', error);
            }
          }

          return events;
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'material-events-error';
          throw err;
        }
      },
      CacheTTL.MATERIAL_EVENTS
    );
  }

  /**
   * Get 8-K filings for a specific company
   */
  async getCompanyMaterialEvents(
    symbolOrCik: string,
    limit: number = 10,
    itemFilter?: string[]
  ): Promise<MaterialEvent[]> {
    const filterKey = itemFilter ? itemFilter.sort().join(',') : 'all';
    const cacheKey = `${CachePrefix.MATERIAL_EVENTS}:company:${symbolOrCik}:${limit}:${filterKey}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          const rssUrl = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcompany&CIK=${symbolOrCik}&type=8-K&dateb=&owner=exclude&start=0&count=${limit * 2}&output=atom`;

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

          const events: MaterialEvent[] = [];
          for (const entry of entriesArray) {
            try {
              const event = await this.parse8KEntry(entry);
              if (event) {
                if (itemFilter && itemFilter.length > 0) {
                  const hasMatchingItem = event.items.some(item =>
                    itemFilter.includes(item.itemNumber)
                  );
                  if (!hasMatchingItem) {
                    continue;
                  }
                }
                events.push(event);
                if (events.length >= limit) {
                  break;
                }
              }
            } catch (error) {
              console.error('Failed to parse 8-K entry:', error);
            }
          }

          return events;
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'material-events-error';
          throw err;
        }
      },
      CacheTTL.MATERIAL_EVENTS
    );
  }

  /**
   * Get events by category
   */
  async getEventsByCategory(
    category: 'business' | 'financial' | 'securities' | 'governance' | 'disclosure',
    limit: number = 20
  ): Promise<MaterialEvent[]> {
    const events = await this.getRecentMaterialEvents(limit * 2);
    return events
      .filter(event => event.items.some(item => item.category === category))
      .slice(0, limit);
  }

  /**
   * Parse 8-K entry from RSS feed
   */
  private async parse8KEntry(entry: Record<string, unknown>): Promise<MaterialEvent | null> {
    try {
      const title = (entry.title as string) || '';
      const link = typeof entry.link === 'string' ? entry.link : (entry.link as { '@_href'?: string })?.['@_href'] || '';
      const filingDate = new Date((entry.updated as string) || (entry.published as string) || new Date());

      // Determine if amendment
      const isAmendment = title.includes('8-K/A');

      // Extract company info from title
      // Title format: "8-K - Company Name (CIK) (Filer)"
      const titleMatch = title.match(/8-K(?:\/A)?\s*-\s*([^(]+)\((\d+)\)/);
      const companyName = titleMatch ? titleMatch[1].trim() : 'Unknown';
      const companyCik = titleMatch ? titleMatch[2].trim() : '';

      // Extract item numbers from summary if available
      const summary = (entry.summary as string) || '';
      const items = this.extractItemsFromText(summary || title);

      // For MVP, return basic event info
      // Full implementation would fetch and parse the actual 8-K document
      return {
        formType: isAmendment ? '8-K/A' : '8-K',
        filingDate,
        eventDate: filingDate, // Would extract from filing
        company: {
          name: companyName,
          ticker: undefined,
          cik: companyCik
        },
        items,
        headline: undefined,
        documentUrl: link.startsWith('http') ? link : `${SEC_BASE_URL}${link}`,
        accessionNumber: ''
      };
    } catch (error) {
      console.error('Failed to parse 8-K entry:', error);
      return null;
    }
  }

  /**
   * Extract item numbers from text (summary or title)
   */
  private extractItemsFromText(text: string): Array<{
    itemNumber: string;
    itemDescription: string;
    category: 'business' | 'financial' | 'securities' | 'governance' | 'disclosure' | 'other';
  }> {
    const items: Array<{
      itemNumber: string;
      itemDescription: string;
      category: 'business' | 'financial' | 'securities' | 'governance' | 'disclosure' | 'other';
    }> = [];

    // Try to find item numbers in format "Item 5.02", "Item 8.01", etc.
    const itemMatches = text.matchAll(/Item\s+(\d+\.\d+)/gi);

    for (const match of itemMatches) {
      const itemNumber = match[1];
      const description = Item8KCategories[itemNumber as keyof typeof Item8KCategories] || 'Unknown Item';
      const category = this.categorizeItem(itemNumber);

      items.push({
        itemNumber,
        itemDescription: description,
        category
      });
    }

    // If no items found, return a default "other" category
    if (items.length === 0) {
      items.push({
        itemNumber: '8.01',
        itemDescription: 'Other Events',
        category: 'other'
      });
    }

    return items;
  }

  /**
   * Categorize item by number
   */
  private categorizeItem(itemNumber: string): 'business' | 'financial' | 'securities' | 'governance' | 'disclosure' | 'other' {
    const section = itemNumber.split('.')[0];
    switch (section) {
      case '1': return 'business';
      case '2': return 'financial';
      case '3': return 'securities';
      case '4': return 'financial';
      case '5': return 'governance';
      case '7': return 'disclosure';
      case '8': return 'other';
      case '9': return 'other';
      default: return 'other';
    }
  }
}

/**
 * Singleton instance
 */
export const materialEventsService = new MaterialEventsService();
