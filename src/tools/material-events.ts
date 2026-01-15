/**
 * Material Events Tool (8-K Filings)
 */

import { materialEventsService } from '../services/material-events.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for 8-K material events
 */
export const get8KEventsTool = {
  name: 'get_8k_material_events',
  description:
    '8-K Material Events | Corporate News | SEC Current Reports - ' +
    'Get SEC Form 8-K current reports of material corporate events. ' +
    '8-K filings are filed within 4 business days of significant events. ' +
    '\n\n**Event Categories Tracked:**\n' +
    '- **Business Events**: Material agreements, bankruptcy, cybersecurity incidents\n' +
    '- **Financial Events**: M&A completion, earnings releases, impairments, debt changes\n' +
    '- **Securities Events**: Delisting notices, unregistered sales, rights modifications\n' +
    '- **Governance Events**: Director/officer changes, control changes, voting results\n' +
    '- **Disclosure Events**: Regulation FD disclosures\n' +
    '\n**Key Item Numbers:**\n' +
    '- Item 1.01: Material agreements\n' +
    '- Item 1.05: Cybersecurity incidents\n' +
    '- Item 2.01: M&A completion\n' +
    '- Item 2.02: Earnings releases\n' +
    '- Item 5.02: Director/officer changes\n' +
    '- Item 8.01: Other material events\n' +
    '\n**Use Cases:**\n' +
    '- "Show me recent 8-K filings for Apple"\n' +
    '- "What are the latest material events?"\n' +
    '- "Show me earnings-related 8-Ks" (Item 2.02)\n' +
    '- "Recent management changes" (Item 5.02)\n' +
    '\n**Returns:** Event details, item categories, filing dates, company info, direct SEC links.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to get material events for (e.g., "AAPL", "TSLA"). ' +
          'Omit to get market-wide recent events.'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of events to return (default: 20, max: 50)',
        minimum: 1,
        maximum: 50
      },
      category: {
        type: 'string',
        enum: ['business', 'financial', 'securities', 'governance', 'disclosure', 'all'],
        description:
          'Filter by event category: ' +
          '"business" = Material agreements, bankruptcy, cybersecurity; ' +
          '"financial" = M&A, earnings, impairments; ' +
          '"securities" = Delisting, stock sales; ' +
          '"governance" = Management changes, voting; ' +
          '"disclosure" = Regulation FD; ' +
          '"all" = All events (default).'
      },
      itemNumbers: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Filter by specific 8-K item numbers (e.g., ["2.02", "5.02"]). ' +
          'Useful for tracking specific event types like earnings (2.02) or management changes (5.02).'
      }
    },
    required: []
  }
};

/**
 * Handle 8-K material events request
 */
export async function handleGet8KEvents(args: unknown) {
  try {
    const {
      symbol,
      limit = 20,
      category,
      itemNumbers
    } = args as {
      symbol?: string;
      limit?: number;
      category?: 'business' | 'financial' | 'securities' | 'governance' | 'disclosure' | 'all';
      itemNumbers?: string[];
    };

    let events;

    if (symbol) {
      // Company-specific mode
      events = await materialEventsService.getCompanyMaterialEvents(
        symbol,
        limit,
        itemNumbers
      );

      return {
        mode: 'company-specific',
        symbol: symbol.toUpperCase(),
        totalEvents: events.length,
        events: events.map(event => ({
          formType: event.formType,
          eventDate: event.eventDate,
          filingDate: event.filingDate,
          items: event.items.map(item => ({
            number: item.itemNumber,
            description: item.itemDescription,
            category: item.category
          })),
          headline: event.headline,
          documentUrl: event.documentUrl
        }))
      };
    } else if (category && category !== 'all') {
      // Category-specific mode
      events = await materialEventsService.getEventsByCategory(category, limit);

      return {
        mode: 'category-filtered',
        category: category,
        totalEvents: events.length,
        events: events.map(event => ({
          formType: event.formType,
          eventDate: event.eventDate,
          filingDate: event.filingDate,
          company: {
            name: event.company.name,
            ticker: event.company.ticker,
            cik: event.company.cik
          },
          items: event.items.map(item => ({
            number: item.itemNumber,
            description: item.itemDescription,
            category: item.category
          })),
          headline: event.headline,
          documentUrl: event.documentUrl
        }))
      };
    } else {
      // Market-wide mode
      events = await materialEventsService.getRecentMaterialEvents(
        limit,
        itemNumbers
      );

      return {
        mode: 'market-wide',
        totalEvents: events.length,
        itemFilter: itemNumbers || 'all',
        events: events.map(event => ({
          formType: event.formType,
          eventDate: event.eventDate,
          filingDate: event.filingDate,
          company: {
            name: event.company.name,
            ticker: event.company.ticker,
            cik: event.company.cik
          },
          items: event.items.map(item => ({
            number: item.itemNumber,
            description: item.itemDescription,
            category: item.category
          })),
          headline: event.headline,
          documentUrl: event.documentUrl
        }))
      };
    }
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
