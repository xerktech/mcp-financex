/**
 * Financial Statements Parser Service
 *
 * Extracts financial data from SEC 10-K and 10-Q filings
 * Uses Yahoo Finance as primary source (easier than XBRL parsing)
 * with SEC filing references for verification
 */

import YahooFinance from 'yahoo-finance2';
import { yahooFinanceService } from './yahoo-finance.js';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';
import { withRetry } from '../utils/error-handler.js';

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
        return await withRetry(async () => {
          try {
            // Fetch from Yahoo Finance
            const quote = await yahooFinanceService.getQuote(symbol);

            // Fetch financial data from quoteSummary
            const modules = period === 'annual'
              ? ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory']
              : ['incomeStatementHistoryQuarterly', 'balanceSheetHistoryQuarterly', 'cashflowStatementHistoryQuarterly'];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let summary: any = null;
            try {
              summary = await YahooFinance.quoteSummary(symbol, { modules: modules as any });
            } catch (error) {
              console.warn(`Failed to fetch financial statements for ${symbol}:`, error);
            }

            const statements: FinancialStatements = {
              symbol: symbol.toUpperCase(),
              companyName: quote.longName || quote.shortName || symbol,
              currency: quote.currency || 'USD',
              incomeStatements: [],
              balanceSheets: [],
              cashFlowStatements: [],
              timestamp: new Date()
            };

            if (!summary) {
              return statements;
            }

            // Parse income statements
            const incomeHistory = period === 'annual'
              ? summary.incomeStatementHistory?.incomeStatementHistory
              : summary.incomeStatementHistoryQuarterly?.incomeStatementHistory;

            if (incomeHistory && Array.isArray(incomeHistory)) {
              statements.incomeStatements = incomeHistory.slice(0, limit).map((stmt: any) => {
                const endDate = stmt.endDate ? new Date(stmt.endDate) : new Date();
                return {
                  period,
                  fiscalYear: endDate.getFullYear(),
                  fiscalQuarter: period === 'quarterly' ? Math.floor(endDate.getMonth() / 3) + 1 : undefined,
                  endDate,
                  revenue: stmt.totalRevenue || 0,
                  costOfRevenue: stmt.costOfRevenue,
                  grossProfit: stmt.grossProfit,
                  operatingExpenses: stmt.operatingExpense || stmt.totalOperatingExpenses,
                  operatingIncome: stmt.operatingIncome,
                  interestExpense: stmt.interestExpense,
                  pretaxIncome: stmt.incomeBeforeTax,
                  incomeTax: stmt.incomeTaxExpense,
                  netIncome: stmt.netIncome || 0,
                  eps: stmt.basicEPS || 0,
                  ebitda: stmt.ebitda,
                  depreciation: stmt.depreciation
                } as IncomeStatement;
              });
            }

            // Parse balance sheets
            const balanceHistory = period === 'annual'
              ? summary.balanceSheetHistory?.balanceSheetStatements
              : summary.balanceSheetHistoryQuarterly?.balanceSheetStatements;

            if (balanceHistory && Array.isArray(balanceHistory)) {
              statements.balanceSheets = balanceHistory.slice(0, limit).map((stmt: any) => {
                const endDate = stmt.endDate ? new Date(stmt.endDate) : new Date();
                return {
                  period,
                  fiscalYear: endDate.getFullYear(),
                  fiscalQuarter: period === 'quarterly' ? Math.floor(endDate.getMonth() / 3) + 1 : undefined,
                  endDate,
                  // Assets
                  cash: stmt.cash || 0,
                  shortTermInvestments: stmt.shortTermInvestments,
                  accountsReceivable: stmt.netReceivables,
                  inventory: stmt.inventory,
                  currentAssets: stmt.totalCurrentAssets || 0,
                  propertyPlantEquipment: stmt.propertyPlantEquipment,
                  totalAssets: stmt.totalAssets || 0,
                  // Liabilities
                  accountsPayable: stmt.accountsPayable,
                  shortTermDebt: stmt.shortLongTermDebt,
                  currentLiabilities: stmt.totalCurrentLiabilities || 0,
                  longTermDebt: stmt.longTermDebt || 0,
                  totalLiabilities: stmt.totalLiab || 0,
                  // Equity
                  shareholdersEquity: stmt.totalStockholderEquity || 0,
                  retainedEarnings: stmt.retainedEarnings,
                  treasuryStock: stmt.treasuryStock
                } as BalanceSheet;
              });
            }

            // Parse cash flow statements
            const cashFlowHistory = period === 'annual'
              ? summary.cashflowStatementHistory?.cashflowStatements
              : summary.cashflowStatementHistoryQuarterly?.cashflowStatements;

            if (cashFlowHistory && Array.isArray(cashFlowHistory)) {
              statements.cashFlowStatements = cashFlowHistory.slice(0, limit).map((stmt: any) => {
                const endDate = stmt.endDate ? new Date(stmt.endDate) : new Date();
                const ocf = stmt.totalCashFromOperatingActivities || 0;
                const capex = Math.abs(stmt.capitalExpenditures || 0);
                return {
                  period,
                  fiscalYear: endDate.getFullYear(),
                  fiscalQuarter: period === 'quarterly' ? Math.floor(endDate.getMonth() / 3) + 1 : undefined,
                  endDate,
                  operatingCashFlow: ocf,
                  capitalExpenditures: capex,
                  freeCashFlow: ocf - capex,
                  investingCashFlow: stmt.totalCashflowsFromInvestingActivities,
                  financingCashFlow: stmt.totalCashFromFinancingActivities,
                  netChangeInCash: stmt.changeInCash,
                  stockBasedCompensation: stmt.stockBasedCompensation
                } as CashFlowStatement;
              });
            }

            return statements;
          } catch (error: unknown) {
            const err = error as Error & { type?: string };
            err.type = 'financials-error';
            throw err;
          }
        });
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
