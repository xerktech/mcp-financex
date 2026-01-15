/**
 * Institutional Holdings Tool (13F Filings)
 */

import { institutionalHoldingsService } from '../services/institutional-holdings.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for 13F institutional holdings
 */
export const get13FFilingsTool = {
  name: 'get_13f_institutional_holdings',
  description:
    '13F Institutional Holdings | Hedge Fund Tracking | See What Warren Buffett is Buying - ' +
    'Track institutional investor holdings from SEC Form 13F filings. ' +
    '13F filings are filed quarterly by institutions managing >$100M in assets. ' +
    '\n\n**What you can track:**\n' +
    '- Hedge fund portfolio holdings (Berkshire Hathaway, Bridgewater, etc.)\n' +
    '- Mutual fund positions\n' +
    '- Pension fund investments\n' +
    '- Quarterly changes (new positions, sold positions, increases, decreases)\n' +
    '- Activist investor identification\n' +
    '\n**Use Cases:**\n' +
    '- "What is Berkshire Hathaway buying?" (use CIK: 0001067983)\n' +
    '- "Show me recent 13F filings for Bridgewater"\n' +
    '- "Track quarterly changes in institutional holdings"\n' +
    '- "Find activist investors"\n' +
    '\n**Returns:** Institution details, filing dates, holdings summaries, quarterly comparison data.',
  inputSchema: {
    type: 'object',
    properties: {
      cik: {
        type: 'string',
        description:
          'SEC CIK (Central Index Key) of the institution to track. ' +
          'Examples: Berkshire Hathaway (0001067983), Vanguard Group (0000102909), BlackRock (0001086364). ' +
          'Required for institution-specific tracking.'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of filings to return (default: 10, max: 40)',
        minimum: 1,
        maximum: 40
      },
      compareQuarters: {
        type: 'boolean',
        description:
          'When true, compares the most recent filing with the previous quarter to show: ' +
          'additions (new positions), reductions (sold positions), increases, and decreases. ' +
          'Default: false.'
      }
    },
    required: ['cik']
  }
};

/**
 * Handle 13F institutional holdings request
 */
export async function handleGet13FFilings(args: unknown) {
  try {
    const { cik, limit = 10, compareQuarters = false } = args as {
      cik: string;
      limit?: number;
      compareQuarters?: boolean;
    };

    if (!cik) {
      throw new Error('CIK is required. Provide the institution\'s SEC CIK number.');
    }

    // Get filings for the institution
    const filings = await institutionalHoldingsService.getInstitutionFilings(
      cik,
      limit
    );

    if (filings.length === 0) {
      return {
        institution: { cik },
        message: 'No 13F filings found for this institution.',
        filings: []
      };
    }

    const result: Record<string, unknown> = {
      institution: {
        name: filings[0]?.institution.name || 'Unknown',
        cik: cik
      },
      totalFilings: filings.length,
      mostRecentFiling: filings[0] ? {
        periodOfReport: filings[0].filing.periodOfReport,
        filingDate: filings[0].filing.filingDate,
        totalValue: filings[0].summary.totalValue,
        totalHoldings: filings[0].summary.totalHoldings,
        documentUrl: filings[0].filing.documentUrl
      } : null,
      filings: filings.map(filing => ({
        period: filing.filing.periodOfReport,
        filingDate: filing.filing.filingDate,
        totalValue: filing.summary.totalValue,
        totalHoldings: filing.summary.totalHoldings,
        topHoldings: filing.summary.topHoldings,
        documentUrl: filing.filing.documentUrl
      }))
    };

    // Add quarterly comparison if requested
    if (compareQuarters && filings.length >= 2) {
      const comparison = await institutionalHoldingsService.compareInstitutionFilings(cik, 2);
      result.quarterlyChanges = {
        comparison: 'Most recent quarter vs previous quarter',
        newPositions: {
          count: comparison.additions.length,
          holdings: comparison.additions.slice(0, 10)
        },
        soldPositions: {
          count: comparison.reductions.length,
          holdings: comparison.reductions.slice(0, 10)
        },
        increased: {
          count: comparison.increases.length,
          holdings: comparison.increases.slice(0, 10)
        },
        decreased: {
          count: comparison.decreases.length,
          holdings: comparison.decreases.slice(0, 10)
        }
      };
    }

    return result;
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
