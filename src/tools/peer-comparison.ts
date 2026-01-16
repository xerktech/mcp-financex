/**
 * Peer Comparison Tool
 */

import YahooFinance from 'yahoo-finance2';
import { financialStatementsService } from '../services/financial-statements.js';
import { yahooFinanceService } from '../services/yahoo-finance.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for peer comparison
 */
export const comparePeersTool = {
  name: 'compare_peer_companies',
  description:
    'Peer Comparison | Competitive Analysis | Compare Companies Side-by-Side - ' +
    'Compare key financial metrics across multiple companies to identify relative strengths and weaknesses. ' +
    'Useful for competitive analysis, sector comparison, and investment decisions. ' +
    '\n\n**What you can compare:**\n' +
    '- **Valuation Metrics**: Market cap, P/E ratio, P/B ratio, EV/EBITDA\n' +
    '- **Profitability**: Gross margin, operating margin, net margin, ROA, ROE\n' +
    '- **Growth**: Revenue growth, earnings growth\n' +
    '- **Liquidity**: Current ratio, quick ratio\n' +
    '- **Leverage**: Debt-to-equity, debt-to-assets, interest coverage\n' +
    '- **Efficiency**: Asset turnover\n' +
    '- **Earnings Quality**: Quality of earnings, cash conversion rate\n' +
    '\n**Use Cases:**\n' +
    '- "Compare Apple, Microsoft, and Google financials"\n' +
    '- "Which tech company has better margins?"\n' +
    '- "Compare Tesla vs traditional automakers"\n' +
    '- "Analyze competitors in the semiconductor sector"\n' +
    '- "Who has the strongest balance sheet among banks?"\n' +
    '\n**Returns:** Side-by-side comparison of key metrics for up to 10 companies.',
  inputSchema: {
    type: 'object',
    properties: {
      symbols: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Array of stock ticker symbols to compare (e.g., ["AAPL", "MSFT", "GOOGL"]). ' +
          'Minimum 2 companies, maximum 10 companies.',
        minItems: 2,
        maxItems: 10
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: Specific metrics to compare. If not provided, returns all key metrics. ' +
          'Examples: ["marketCap", "peRatio", "netMargin", "debtToEquity", "roe"]'
      }
    },
    required: ['symbols']
  }
};

/**
 * Handle peer comparison request
 */
export async function handleComparePeers(args: unknown) {
  try {
    const {
      symbols,
      metrics
    } = args as {
      symbols: string[];
      metrics?: string[];
    };

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      throw new Error('At least 2 symbols are required for comparison.');
    }

    if (symbols.length > 10) {
      throw new Error('Maximum 10 symbols allowed for comparison.');
    }

    // Fetch data for all companies in parallel
    const companyDataPromises = symbols.map(async (symbol) => {
      try {
        const [quote, statements] = await Promise.all([
          yahooFinanceService.getQuote(symbol),
          financialStatementsService.getFinancialStatements(symbol, 'annual', 1)
        ]);

        // Fetch additional metrics from quoteSummary
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let summary: any = null;
        try {
          summary = await YahooFinance.quoteSummary(symbol, {
            modules: ['defaultKeyStatistics', 'summaryDetail', 'financialData']
          });
        } catch {
          // Summary data not available, continue without it
        }

        const ratios = financialStatementsService.calculateRatios(statements);
        const latestIncome = statements.incomeStatements[0];
        const latestBalance = statements.balanceSheets[0];
        const latestCashFlow = statements.cashFlowStatements[0];

        // Extract additional metrics from summary
        const stats = summary?.defaultKeyStatistics;
        const detail = summary?.summaryDetail;
        const financial = summary?.financialData;

        return {
          symbol: symbol.toUpperCase(),
          companyName: quote.longName || quote.shortName || symbol,
          data: {
            // Market data
            marketCap: quote.marketCap,
            currentPrice: quote.regularMarketPrice,
            beta: stats?.beta,
            dividendYield: detail?.dividendYield ? detail.dividendYield * 100 : undefined,

            // Valuation metrics
            peRatio: quote.trailingPE,
            forwardPE: quote.forwardPE,
            priceToBook: stats?.priceToBook || detail?.priceToBook,
            priceToSales: stats?.priceToSalesTrailing12Months,
            evToEbitda: stats?.enterpriseToEbitda,
            evToRevenue: stats?.enterpriseToRevenue,
            pegRatio: stats?.pegRatio,

            // Profitability
            grossMargin: ratios.profitability.grossMargin,
            operatingMargin: ratios.profitability.operatingMargin,
            netMargin: ratios.profitability.netMargin,
            roa: ratios.profitability.roa,
            roe: ratios.profitability.roe,

            // Growth (year-over-year if available)
            revenue: latestIncome?.revenue,
            revenueGrowth: financial?.revenueGrowth ? financial.revenueGrowth * 100 : undefined,
            earningsGrowth: financial?.earningsGrowth ? financial.earningsGrowth * 100 : undefined,
            netIncome: latestIncome?.netIncome,
            eps: latestIncome?.eps,

            // Liquidity
            currentRatio: ratios.liquidity.currentRatio,
            quickRatio: ratios.liquidity.quickRatio,

            // Leverage
            debtToEquity: ratios.leverage.debtToEquity,
            debtToAssets: ratios.leverage.debtToAssets,
            interestCoverage: ratios.leverage.interestCoverage,

            // Efficiency
            assetTurnover: ratios.efficiency.assetTurnover,
            returnOnAssets: financial?.returnOnAssets ? financial.returnOnAssets * 100 : undefined,
            returnOnEquity: financial?.returnOnEquity ? financial.returnOnEquity * 100 : undefined,

            // Earnings Quality
            qualityOfEarnings: ratios.earningsQuality.qualityOfEarnings,
            cashConversionRate: ratios.earningsQuality.cashConversionRate,

            // Balance sheet strength
            totalAssets: latestBalance?.totalAssets,
            totalLiabilities: latestBalance?.totalLiabilities,
            shareholdersEquity: latestBalance?.shareholdersEquity,
            cash: latestBalance?.cash,
            totalDebt: stats?.totalDebt,

            // Cash flow
            operatingCashFlow: latestCashFlow?.operatingCashFlow,
            freeCashFlow: latestCashFlow?.freeCashFlow,
            freeCashFlowPerShare: stats?.freeCashflow ?
              (stats.freeCashflow / (stats.sharesOutstanding || 1)) : undefined
          }
        };
      } catch (error) {
        return {
          symbol: symbol.toUpperCase(),
          companyName: symbol,
          error: `Failed to fetch data: ${(error as Error).message}`,
          data: null
        };
      }
    });

    const companyData = await Promise.all(companyDataPromises);

    // Separate successful and failed companies
    const successful = companyData.filter(c => c.data !== null);
    const failed = companyData.filter(c => c.data === null);

    // If specific metrics requested, filter the data
    let comparisonData;
    if (metrics && metrics.length > 0) {
      comparisonData = successful.map(company => ({
        symbol: company.symbol,
        companyName: company.companyName,
        data: Object.fromEntries(
          Object.entries(company.data || {}).filter(([key]) => metrics.includes(key))
        )
      }));
    } else {
      comparisonData = successful;
    }

    // Calculate rankings for key metrics (higher is better)
    const rankings: Record<string, Array<{ symbol: string; rank: number; value: unknown }>> = {};

    if (successful.length > 1) {
      const metricsToRank = [
        'marketCap',
        'grossMargin',
        'operatingMargin',
        'netMargin',
        'roe',
        'roa',
        'returnOnAssets',
        'returnOnEquity',
        'currentRatio',
        'interestCoverage',
        'qualityOfEarnings',
        'cashConversionRate',
        'revenueGrowth',
        'earningsGrowth',
        'freeCashFlow',
        'dividendYield'
      ];

      metricsToRank.forEach(metric => {
        const values = successful
          .map(c => ({
            symbol: c.symbol,
            value: (c.data as Record<string, unknown>)?.[metric]
          }))
          .filter(v => v.value !== undefined && v.value !== null && typeof v.value === 'number');

        if (values.length > 0) {
          const sorted = values.sort((a, b) => (b.value as number) - (a.value as number));
          rankings[metric] = sorted.map((v, idx) => ({
            symbol: v.symbol,
            rank: idx + 1,
            value: v.value
          }));
        }
      });
    }

    return {
      comparisonType: 'peer-analysis',
      totalCompanies: symbols.length,
      successfulComparisons: successful.length,
      failedComparisons: failed.length,
      companies: comparisonData,
      rankings: Object.keys(rankings).length > 0 ? rankings : undefined,
      failedCompanies: failed.length > 0 ? failed.map(f => ({
        symbol: f.symbol,
        error: f.error
      })) : undefined,
      insights: {
        description:
          `Comparing ${successful.length} companies across key financial metrics. ` +
          `Rankings show relative performance (rank 1 = best).`,
        note:
          'Use this comparison to identify investment opportunities, competitive advantages, ' +
          'and relative valuation. Consider industry norms when interpreting ratios.'
      }
    };
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
