/**
 * Financial Statements Tool (10-K/10-Q Data)
 */

import { financialStatementsService } from '../services/financial-statements.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for financial statements
 */
export const getFinancialStatementsTool = {
  name: 'get_financial_statements',
  description:
    'Financial Statements | Income Statement | Balance Sheet | Cash Flow - ' +
    'Access comprehensive financial data from SEC 10-K (annual) and 10-Q (quarterly) filings. ' +
    'Get income statements, balance sheets, cash flow statements, and calculated financial ratios. ' +
    '\n\n**Available Data:**\n' +
    '- **Income Statement**: Revenue, gross profit, operating income, net income, EPS, EBITDA\n' +
    '- **Balance Sheet**: Assets, liabilities, equity, cash, debt, working capital\n' +
    '- **Cash Flow**: Operating cash flow, capital expenditures, free cash flow\n' +
    '- **Financial Ratios**: Profitability, liquidity, leverage, and efficiency metrics\n' +
    '\n**Financial Ratios Calculated:**\n' +
    '- **Profitability**: Gross margin, operating margin, net margin, ROA, ROE\n' +
    '- **Liquidity**: Current ratio, quick ratio\n' +
    '- **Leverage**: Debt-to-equity, debt-to-assets\n' +
    '- **Efficiency**: Asset turnover\n' +
    '\n**Use Cases:**\n' +
    '- "Get Apple\'s annual financial statements"\n' +
    '- "Show me quarterly financials for Tesla"\n' +
    '- "What is Microsoft\'s profit margin?"\n' +
    '- "Compare balance sheets over 4 quarters"\n' +
    '- "Calculate financial ratios for NVDA"\n' +
    '\n**Returns:** Complete financial statements, calculated ratios, period information, SEC filing links.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to get financial statements for (e.g., "AAPL", "TSLA"). Required.'
      },
      periodType: {
        type: 'string',
        enum: ['annual', 'quarterly'],
        description:
          'Type of financial period: ' +
          '"annual" = Annual reports (10-K), ' +
          '"quarterly" = Quarterly reports (10-Q). ' +
          'Default: "annual".'
      },
      limit: {
        type: 'number',
        description:
          'Number of periods to retrieve (default: 4 for quarterly, 3 for annual). ' +
          'Useful for trend analysis over time. Max: 10.',
        minimum: 1,
        maximum: 10
      },
      includeRatios: {
        type: 'boolean',
        description:
          'When true, calculates and includes financial ratios: ' +
          'profitability (margins, ROA, ROE), ' +
          'liquidity (current, quick), ' +
          'leverage (debt ratios), ' +
          'efficiency (asset turnover). ' +
          'Default: true.'
      }
    },
    required: ['symbol']
  }
};

/**
 * Handle financial statements request
 */
export async function handleGetFinancialStatements(args: unknown) {
  try {
    const {
      symbol,
      periodType = 'annual',
      limit,
      includeRatios = true
    } = args as {
      symbol: string;
      periodType?: 'annual' | 'quarterly';
      limit?: number;
      includeRatios?: boolean;
    };

    if (!symbol) {
      throw new Error('Symbol is required. Provide a stock ticker symbol.');
    }

    // Set default limit based on period type
    const defaultLimit = periodType === 'quarterly' ? 4 : 3;
    const periodsToFetch = limit || defaultLimit;

    // Get financial statements
    const statements = await financialStatementsService.getFinancialStatements(
      symbol,
      periodType,
      periodsToFetch
    );

    if (!statements || statements.incomeStatements.length === 0) {
      return {
        symbol: symbol.toUpperCase(),
        periodType,
        message: 'No financial statements found for this symbol and period type.',
        incomeStatements: [],
        balanceSheets: [],
        cashFlowStatements: []
      };
    }

    const result: Record<string, unknown> = {
      symbol: symbol.toUpperCase(),
      periodType,
      totalPeriods: statements.incomeStatements.length,
      currency: statements.currency || 'USD',
      incomeStatements: statements.incomeStatements.map(stmt => ({
        period: stmt.period,
        fiscalYear: stmt.fiscalYear,
        fiscalQuarter: stmt.fiscalQuarter,
        endDate: stmt.endDate,
        revenue: stmt.revenue,
        costOfRevenue: stmt.costOfRevenue,
        grossProfit: stmt.grossProfit,
        operatingExpenses: stmt.operatingExpenses,
        operatingIncome: stmt.operatingIncome,
        interestExpense: stmt.interestExpense,
        pretaxIncome: stmt.pretaxIncome,
        incomeTax: stmt.incomeTax,
        netIncome: stmt.netIncome,
        eps: stmt.eps,
        ebitda: stmt.ebitda,
        depreciation: stmt.depreciation
      })),
      balanceSheets: statements.balanceSheets.map(stmt => ({
        period: stmt.period,
        fiscalYear: stmt.fiscalYear,
        fiscalQuarter: stmt.fiscalQuarter,
        endDate: stmt.endDate,
        cash: stmt.cash,
        shortTermInvestments: stmt.shortTermInvestments,
        accountsReceivable: stmt.accountsReceivable,
        inventory: stmt.inventory,
        currentAssets: stmt.currentAssets,
        propertyPlantEquipment: stmt.propertyPlantEquipment,
        totalAssets: stmt.totalAssets,
        currentLiabilities: stmt.currentLiabilities,
        longTermDebt: stmt.longTermDebt,
        totalLiabilities: stmt.totalLiabilities,
        shareholdersEquity: stmt.shareholdersEquity
      })),
      cashFlowStatements: statements.cashFlowStatements.map(stmt => ({
        period: stmt.period,
        fiscalYear: stmt.fiscalYear,
        fiscalQuarter: stmt.fiscalQuarter,
        endDate: stmt.endDate,
        operatingCashFlow: stmt.operatingCashFlow,
        capitalExpenditures: stmt.capitalExpenditures,
        freeCashFlow: stmt.freeCashFlow,
        investingCashFlow: stmt.investingCashFlow,
        financingCashFlow: stmt.financingCashFlow
      }))
    };

    // Add financial ratios if requested
    if (includeRatios) {
      const ratios = financialStatementsService.calculateRatios(statements);
      result.financialRatios = {
        profitability: {
          grossMargin: ratios.profitability.grossMargin,
          operatingMargin: ratios.profitability.operatingMargin,
          netMargin: ratios.profitability.netMargin,
          returnOnAssets: ratios.profitability.roa,
          returnOnEquity: ratios.profitability.roe
        },
        liquidity: {
          currentRatio: ratios.liquidity.currentRatio,
          quickRatio: ratios.liquidity.quickRatio
        },
        leverage: {
          debtToEquity: ratios.leverage.debtToEquity,
          debtToAssets: ratios.leverage.debtToAssets,
          interestCoverage: ratios.leverage.interestCoverage
        },
        efficiency: {
          assetTurnover: ratios.efficiency.assetTurnover
        },
        earningsQuality: {
          qualityOfEarnings: ratios.earningsQuality.qualityOfEarnings,
          accruals: ratios.earningsQuality.accruals,
          cashConversionRate: ratios.earningsQuality.cashConversionRate
        }
      };
    }

    return result;
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
