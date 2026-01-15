/**
 * Ownership Changes Tool (13D/G Filings)
 */

import { ownershipChangesService } from '../services/ownership-changes.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for 13D/G ownership changes
 */
export const get13DGFilingsTool = {
  name: 'get_13dg_ownership_changes',
  description:
    '13D/G Ownership Changes | Major Stakes | Activist Investors - ' +
    'Track major ownership changes (5%+ stakes) from SEC Schedule 13D and 13G filings. ' +
    '13D filings indicate activist intent, while 13G filings indicate passive ownership. ' +
    '\n\n**What you can track:**\n' +
    '- Major ownership changes (5%+ of company shares)\n' +
    '- Activist investor campaigns (Carl Icahn, Bill Ackman, etc.)\n' +
    '- Passive institutional stakes (13G)\n' +
    '- Potential takeover targets\n' +
    '- Hedge fund 13D activity\n' +
    '\n**Form Types:**\n' +
    '- **13D**: Active ownership with intent to influence (activist investors)\n' +
    '- **13G**: Passive ownership without intent to influence\n' +
    '- **Amendments**: /A suffix indicates filing updates\n' +
    '\n**Use Cases:**\n' +
    '- "Show me recent 13D filings" (activist activity)\n' +
    '- "Who filed 13D for Tesla?"\n' +
    '- "Recent activist investor campaigns"\n' +
    '- "Major ownership changes in tech sector"\n' +
    '\n**Returns:** Reporting person, ownership percentage, purpose, filing dates, direct SEC links.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to get ownership filings for (e.g., "AAPL", "TSLA"). ' +
          'Omit to get market-wide recent filings.'
      },
      formType: {
        type: 'string',
        enum: ['13D', '13G', 'both'],
        description:
          'Type of filing to retrieve: ' +
          '"13D" = Active ownership (activist investors), ' +
          '"13G" = Passive ownership, ' +
          '"both" = All ownership filings (default).'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of filings to return (default: 20, max: 50)',
        minimum: 1,
        maximum: 50
      },
      activistOnly: {
        type: 'boolean',
        description:
          'When true, only returns activist investors (those with multiple 13D filings). ' +
          'Useful for identifying activist campaigns. Default: false.'
      }
    },
    required: []
  }
};

/**
 * Handle 13D/G ownership changes request
 */
export async function handleGet13DGFilings(args: unknown) {
  try {
    const {
      symbol,
      formType = 'both',
      limit = 20,
      activistOnly = false
    } = args as {
      symbol?: string;
      formType?: '13D' | '13G' | 'both';
      limit?: number;
      activistOnly?: boolean;
    };

    if (activistOnly) {
      // Get activist investors
      const activists = await ownershipChangesService.getActivistInvestors(limit);
      return {
        mode: 'activist-tracking',
        totalActivists: activists.length,
        activists: activists.map(activist => ({
          investor: activist.investor,
          investorCik: activist.investorCik,
          totalTargets: activist.targets.length,
          targets: activist.targets.map(target => ({
            company: target.company,
            ticker: target.ticker,
            percentOwned: target.percentOwned,
            purpose: target.purpose
          }))
        }))
      };
    }

    if (symbol) {
      // Company-specific mode
      const filings = await ownershipChangesService.getCompanyOwnershipFilings(
        symbol,
        limit
      );

      return {
        mode: 'company-specific',
        symbol: symbol.toUpperCase(),
        totalFilings: filings.length,
        filings: filings.map(filing => ({
          formType: filing.formType,
          isAmendment: filing.isAmendment,
          filingDate: filing.filingDate,
          reportingPerson: {
            name: filing.reportingPerson.name,
            cik: filing.reportingPerson.cik
          },
          ownership: {
            percentOfClass: filing.ownership.percentOfClass,
            shares: filing.ownership.shares
          },
          purpose: filing.purpose,
          documentUrl: filing.documentUrl
        }))
      };
    } else {
      // Market-wide mode
      const filings = await ownershipChangesService.getRecentOwnershipFilings(
        formType,
        limit
      );

      return {
        mode: 'market-wide',
        formTypeFilter: formType,
        totalFilings: filings.length,
        filings: filings.map(filing => ({
          formType: filing.formType,
          isAmendment: filing.isAmendment,
          filingDate: filing.filingDate,
          company: {
            name: filing.issuer.name,
            ticker: filing.issuer.ticker,
            cik: filing.issuer.cik
          },
          reportingPerson: {
            name: filing.reportingPerson.name,
            cik: filing.reportingPerson.cik
          },
          ownership: {
            percentOfClass: filing.ownership.percentOfClass,
            shares: filing.ownership.shares
          },
          purpose: filing.purpose,
          documentUrl: filing.documentUrl
        }))
      };
    }
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
