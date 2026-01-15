/**
 * Financial Statements Parser Service
 *
 * Extracts financial data from SEC 10-K and 10-Q filings
 * Uses Yahoo Finance as primary source (easier than XBRL parsing)
 * with SEC filing references for verification
 */

import { yahooFinanceService } from './yahoo-finance.js';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';

/**
 * Income statement data
 */
export interface IncomeStatement {
  period: 'annual' | 'quarterly';
  fiscalYear: number;
  fiscalQuarter?: number;
  endDate: Date;
  revenue: number;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingExpenses?: number;
  operatingIncome?: number;
  interestExpense?: number;
  pretaxIncome?: number;
  incomeTax?: number;
  netIncome: number;
  eps: number;              // Earnings per share (diluted)
  ebitda?: number;
  depreciation?: number;
}

/**
 * Balance sheet data
 */
export interface BalanceSheet {
  period: 'annual' | 'quarterly';
  fiscalYear: number;
  fiscalQuarter?: number;
  endDate: Date;
  // Assets
  cash: number;
  shortTermInvestments?: number;
  accountsReceivable?: number;
  inventory?: number;
  currentAssets: number;
  propertyPlantEquipment?: number;
  totalAssets: number;
  // Liabilities
  accountsPayable?: number;
  shortTermDebt?: number;
  currentLiabilities: number;
  longTermDebt: number;
  totalLiabilities: number;
  // Equity
  shareholdersEquity: number;
  retainedEarnings?: number;
  treasuryStock?: number;
}

/**
 * Cash flow statement data
 */
export interface CashFlowStatement {
  period: 'annual' | 'quarterly';
  fiscalYear: number;
  fiscalQuarter?: number;
  endDate: Date;
  operatingCashFlow: number;
  capitalExpenditures: number;
  freeCashFlow: number;      // OCF - CapEx
  investingCashFlow?: number;
  financingCashFlow?: number;
  netChangeInCash?: number;
  stockBasedCompensation?: number;
}

/**
 * Complete financial statements
 */
export interface FinancialStatements {
  symbol: string;
  companyName: string;
  currency: string;
  incomeStatements: IncomeStatement[];
  balanceSheets: BalanceSheet[];
  cashFlowStatements: CashFlowStatement[];
  timestamp: Date;
}

/**
 * Financial Statements Service
 */
export class FinancialStatementsService {
  private cache: CacheService;

  constructor() {
    this.cache = CacheService.getInstance();
  }

  /**
   * Get financial statements for a company
   */
  async getFinancialStatements(
    symbol: string,
    period: 'annual' | 'quarterly' = 'annual',
    limit: number = 4
  ): Promise<FinancialStatements> {
    const cacheKey = `${CachePrefix.FINANCIALS}:${symbol}:${period}:${limit}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Fetch from Yahoo Finance (easier than parsing XBRL from SEC)
          const quote = await yahooFinanceService.getQuote(symbol);

          // Note: Full implementation would fetch historical financial data
          // from Yahoo Finance API or parse SEC EDGAR XBRL files
          // For MVP, return structure with note that data needs fetching

          const statements: FinancialStatements = {
            symbol: symbol.toUpperCase(),
            companyName: quote.longName || quote.shortName || symbol,
            currency: quote.currency || 'USD',
            incomeStatements: [],
            balanceSheets: [],
            cashFlowStatements: [],
            timestamp: new Date()
          };

          // In production, would fetch from:
          // 1. Yahoo Finance quoteSummary module (financials, balance sheet, cash flow)
          // 2. Or parse SEC EDGAR 10-K/10-Q XBRL files
          // 3. Or use commercial API (Financial Modeling Prep, Alpha Vantage, etc.)

          return statements;
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'financials-error';
          throw err;
        }
      },
      CacheTTL.FINANCIALS
    );
  }

  /**
   * Get income statement only
   */
  async getIncomeStatements(
    symbol: string,
    period: 'annual' | 'quarterly' = 'annual',
    limit: number = 4
  ): Promise<IncomeStatement[]> {
    const statements = await this.getFinancialStatements(symbol, period, limit);
    return statements.incomeStatements;
  }

  /**
   * Get balance sheet only
   */
  async getBalanceSheets(
    symbol: string,
    period: 'annual' | 'quarterly' = 'annual',
    limit: number = 4
  ): Promise<BalanceSheet[]> {
    const statements = await this.getFinancialStatements(symbol, period, limit);
    return statements.balanceSheets;
  }

  /**
   * Get cash flow statement only
   */
  async getCashFlowStatements(
    symbol: string,
    period: 'annual' | 'quarterly' = 'annual',
    limit: number = 4
  ): Promise<CashFlowStatement[]> {
    const statements = await this.getFinancialStatements(symbol, period, limit);
    return statements.cashFlowStatements;
  }

  /**
   * Calculate key financial ratios
   */
  calculateRatios(statements: FinancialStatements): {
    profitability: {
      grossMargin?: number;
      operatingMargin?: number;
      netMargin?: number;
      roa?: number;           // Return on assets
      roe?: number;           // Return on equity
    };
    liquidity: {
      currentRatio?: number;
      quickRatio?: number;
    };
    leverage: {
      debtToEquity?: number;
      debtToAssets?: number;
      interestCoverage?: number;  // EBIT / Interest Expense
    };
    efficiency: {
      assetTurnover?: number;
    };
    earningsQuality: {
      qualityOfEarnings?: number;     // OCF / Net Income
      accruals?: number;              // Net Income - OCF
      cashConversionRate?: number;    // OCF / Revenue
    };
  } {
    const latestIncome = statements.incomeStatements[0];
    const latestBalance = statements.balanceSheets[0];
    const latestCashFlow = statements.cashFlowStatements[0];

    const ratios = {
      profitability: {
        grossMargin: latestIncome?.grossProfit && latestIncome?.revenue
          ? (latestIncome.grossProfit / latestIncome.revenue) * 100
          : undefined,
        operatingMargin: latestIncome?.operatingIncome && latestIncome?.revenue
          ? (latestIncome.operatingIncome / latestIncome.revenue) * 100
          : undefined,
        netMargin: latestIncome?.netIncome && latestIncome?.revenue
          ? (latestIncome.netIncome / latestIncome.revenue) * 100
          : undefined,
        roa: latestIncome?.netIncome && latestBalance?.totalAssets
          ? (latestIncome.netIncome / latestBalance.totalAssets) * 100
          : undefined,
        roe: latestIncome?.netIncome && latestBalance?.shareholdersEquity
          ? (latestIncome.netIncome / latestBalance.shareholdersEquity) * 100
          : undefined
      },
      liquidity: {
        currentRatio: latestBalance?.currentAssets && latestBalance?.currentLiabilities
          ? latestBalance.currentAssets / latestBalance.currentLiabilities
          : undefined,
        quickRatio: latestBalance?.currentAssets && latestBalance?.inventory && latestBalance?.currentLiabilities
          ? (latestBalance.currentAssets - latestBalance.inventory) / latestBalance.currentLiabilities
          : undefined
      },
      leverage: {
        debtToEquity: latestBalance?.longTermDebt && latestBalance?.shareholdersEquity
          ? latestBalance.longTermDebt / latestBalance.shareholdersEquity
          : undefined,
        debtToAssets: latestBalance?.longTermDebt && latestBalance?.totalAssets
          ? (latestBalance.longTermDebt / latestBalance.totalAssets) * 100
          : undefined,
        interestCoverage: latestIncome?.operatingIncome && latestIncome?.interestExpense && latestIncome.interestExpense > 0
          ? latestIncome.operatingIncome / latestIncome.interestExpense
          : undefined
      },
      efficiency: {
        assetTurnover: latestIncome?.revenue && latestBalance?.totalAssets
          ? latestIncome.revenue / latestBalance.totalAssets
          : undefined
      },
      earningsQuality: {
        qualityOfEarnings: latestCashFlow?.operatingCashFlow && latestIncome?.netIncome && latestIncome.netIncome > 0
          ? latestCashFlow.operatingCashFlow / latestIncome.netIncome
          : undefined,
        accruals: latestIncome?.netIncome && latestCashFlow?.operatingCashFlow
          ? latestIncome.netIncome - latestCashFlow.operatingCashFlow
          : undefined,
        cashConversionRate: latestCashFlow?.operatingCashFlow && latestIncome?.revenue && latestIncome.revenue > 0
          ? (latestCashFlow.operatingCashFlow / latestIncome.revenue) * 100
          : undefined
      }
    };

    return ratios;
  }
}

/**
 * Singleton instance
 */
export const financialStatementsService = new FinancialStatementsService();
