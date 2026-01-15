/**
 * DCF (Discounted Cash Flow) Valuation Service
 *
 * Calculates intrinsic value of a company using DCF methodology
 */

import { financialStatementsService } from './financial-statements.js';
import { yahooFinanceService } from './yahoo-finance.js';
import { CacheService, CacheTTL, CachePrefix } from './cache.js';

/**
 * DCF valuation inputs
 */
export interface DCFInputs {
  // Current financials
  freeCashFlow: number;        // Most recent FCF
  revenue: number;             // Most recent revenue

  // Growth assumptions
  revenueGrowthRates: number[]; // Year-by-year growth rates (e.g., [0.15, 0.12, 0.10, 0.08, 0.05])
  terminalGrowthRate: number;  // Perpetual growth rate (typically 2-3%)

  // Margin assumptions
  fcfMargin: number;           // Free cash flow as % of revenue

  // Discount rate
  wacc: number;                // Weighted Average Cost of Capital

  // Company info
  sharesOutstanding: number;
  netDebt?: number;            // Total debt - cash (can be negative)
}

/**
 * DCF valuation result
 */
export interface DCFValuation {
  symbol: string;
  companyName: string;
  timestamp: Date;

  // Inputs used
  inputs: DCFInputs;

  // Projections
  projectedCashFlows: Array<{
    year: number;
    revenue: number;
    fcf: number;
    discountFactor: number;
    presentValue: number;
  }>;

  // Valuation results
  sumPVCashFlows: number;      // Sum of projected PV cash flows
  terminalValue: number;       // Terminal value
  pvTerminalValue: number;     // Present value of terminal value
  enterpriseValue: number;     // Total EV
  equityValue: number;         // EV - Net Debt
  valuePerShare: number;       // Equity value / shares

  // Current price comparison
  currentPrice: number;
  upside: number;              // % upside (or downside if negative)
  recommendation: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
}

/**
 * DCF Valuation Service
 */
export class DCFValuationService {
  private cache: CacheService;

  constructor() {
    this.cache = CacheService.getInstance();
  }

  /**
   * Calculate DCF valuation for a company
   */
  async calculateDCF(
    symbol: string,
    customInputs?: Partial<DCFInputs>
  ): Promise<DCFValuation> {
    const cacheKey = `${CachePrefix.DCF}:${symbol}:${JSON.stringify(customInputs || {})}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Get current quote
          const quote = await yahooFinanceService.getQuote(symbol);

          // Get financial statements
          const statements = await financialStatementsService.getFinancialStatements(symbol);

          // Build default inputs from financial data
          const defaultInputs = await this.buildDefaultInputs(symbol, statements);

          // Merge with custom inputs
          const inputs: DCFInputs = { ...defaultInputs, ...customInputs };

          // Project cash flows
          const projections = this.projectCashFlows(inputs);

          // Calculate terminal value
          const lastProjection = projections[projections.length - 1];
          const terminalFCF = lastProjection.fcf * (1 + inputs.terminalGrowthRate);
          const terminalValue = terminalFCF / (inputs.wacc - inputs.terminalGrowthRate);
          const pvTerminalValue = terminalValue * lastProjection.discountFactor;

          // Calculate enterprise value
          const sumPVCashFlows = projections.reduce((sum, proj) => sum + proj.presentValue, 0);
          const enterpriseValue = sumPVCashFlows + pvTerminalValue;

          // Calculate equity value
          const netDebt = inputs.netDebt || 0;
          const equityValue = enterpriseValue - netDebt;
          const valuePerShare = equityValue / inputs.sharesOutstanding;

          // Calculate upside and recommendation
          const currentPrice = quote.regularMarketPrice;
          const upside = ((valuePerShare - currentPrice) / currentPrice) * 100;
          const recommendation = this.getRecommendation(upside);

          return {
            symbol: symbol.toUpperCase(),
            companyName: quote.longName || quote.shortName || symbol,
            timestamp: new Date(),
            inputs,
            projectedCashFlows: projections,
            sumPVCashFlows,
            terminalValue,
            pvTerminalValue,
            enterpriseValue,
            equityValue,
            valuePerShare,
            currentPrice,
            upside,
            recommendation
          };
        } catch (error: unknown) {
          const err = error as Error & { type?: string };
          err.type = 'dcf-error';
          throw err;
        }
      },
      CacheTTL.DCF
    );
  }

  /**
   * Build default DCF inputs from financial data
   */
  private async buildDefaultInputs(
    symbol: string,
    _statements: unknown
  ): Promise<DCFInputs> {
    // Get market data for shares outstanding
    const quote = await yahooFinanceService.getQuote(symbol);

    // Default growth rates (conservative assumption)
    const revenueGrowthRates = [0.10, 0.08, 0.07, 0.06, 0.05]; // 10%, 8%, 7%, 6%, 5%

    // Default WACC (Weighted Average Cost of Capital)
    // Simplified: use risk-free rate + equity risk premium
    const riskFreeRate = 0.04; // 4% (approximate 10-year treasury)
    const equityRiskPremium = 0.06; // 6% (market risk premium)
    const beta = 1.0; // Default beta (would get from fundamentals if available)
    const wacc = riskFreeRate + (beta * equityRiskPremium);

    // Estimate FCF and FCF margin
    // In production, would calculate from actual cash flow statements
    const revenue = 1000000000; // Would get from statements
    const fcfMargin = 0.15; // Assume 15% FCF margin
    const freeCashFlow = revenue * fcfMargin;

    // Shares outstanding
    const sharesOutstanding = quote.regularMarketVolume || 1000000000; // Would get actual shares

    // Net debt (total debt - cash)
    const netDebt = 0; // Would calculate from balance sheet

    return {
      freeCashFlow,
      revenue,
      revenueGrowthRates,
      terminalGrowthRate: 0.025, // 2.5% perpetual growth
      fcfMargin,
      wacc,
      sharesOutstanding,
      netDebt
    };
  }

  /**
   * Project cash flows for 5 years
   */
  private projectCashFlows(inputs: DCFInputs): Array<{
    year: number;
    revenue: number;
    fcf: number;
    discountFactor: number;
    presentValue: number;
  }> {
    const projections: Array<{
      year: number;
      revenue: number;
      fcf: number;
      discountFactor: number;
      presentValue: number;
    }> = [];

    let currentRevenue = inputs.revenue;

    for (let year = 1; year <= inputs.revenueGrowthRates.length; year++) {
      // Project revenue
      const growthRate = inputs.revenueGrowthRates[year - 1];
      currentRevenue = currentRevenue * (1 + growthRate);

      // Project FCF based on FCF margin
      const fcf = currentRevenue * inputs.fcfMargin;

      // Calculate discount factor
      const discountFactor = 1 / Math.pow(1 + inputs.wacc, year);

      // Calculate present value
      const presentValue = fcf * discountFactor;

      projections.push({
        year,
        revenue: currentRevenue,
        fcf,
        discountFactor,
        presentValue
      });
    }

    return projections;
  }

  /**
   * Get recommendation based on upside percentage
   */
  private getRecommendation(upside: number): 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell' {
    if (upside > 30) {
      return 'Strong Buy';
    }
    if (upside > 15) {
      return 'Buy';
    }
    if (upside > -10) {
      return 'Hold';
    }
    if (upside > -25) {
      return 'Sell';
    }
    return 'Strong Sell';
  }

  /**
   * Perform sensitivity analysis on key assumptions
   */
  async sensitivityAnalysis(
    symbol: string,
    baseInputs: Partial<DCFInputs>
  ): Promise<{
    waccSensitivity: Array<{ wacc: number; valuePerShare: number }>;
    terminalGrowthSensitivity: Array<{ terminalGrowth: number; valuePerShare: number }>;
    fcfMarginSensitivity: Array<{ fcfMargin: number; valuePerShare: number }>;
  }> {
    const waccRange = [-0.02, -0.01, 0, 0.01, 0.02]; // +/- 2%
    const terminalGrowthRange = [-0.01, -0.005, 0, 0.005, 0.01]; // +/- 1%
    const fcfMarginRange = [-0.05, -0.025, 0, 0.025, 0.05]; // +/- 5%

    const baseValuation = await this.calculateDCF(symbol, baseInputs);

    // WACC sensitivity
    const waccSensitivity = await Promise.all(
      waccRange.map(async (delta) => {
        const inputs = { ...baseInputs, wacc: baseValuation.inputs.wacc + delta };
        const valuation = await this.calculateDCF(symbol, inputs);
        return { wacc: inputs.wacc || 0, valuePerShare: valuation.valuePerShare };
      })
    );

    // Terminal growth sensitivity
    const terminalGrowthSensitivity = await Promise.all(
      terminalGrowthRange.map(async (delta) => {
        const inputs = { ...baseInputs, terminalGrowthRate: baseValuation.inputs.terminalGrowthRate + delta };
        const valuation = await this.calculateDCF(symbol, inputs);
        return { terminalGrowth: inputs.terminalGrowthRate || 0, valuePerShare: valuation.valuePerShare };
      })
    );

    // FCF margin sensitivity
    const fcfMarginSensitivity = await Promise.all(
      fcfMarginRange.map(async (delta) => {
        const inputs = { ...baseInputs, fcfMargin: baseValuation.inputs.fcfMargin + delta };
        const valuation = await this.calculateDCF(symbol, inputs);
        return { fcfMargin: inputs.fcfMargin || 0, valuePerShare: valuation.valuePerShare };
      })
    );

    return {
      waccSensitivity,
      terminalGrowthSensitivity,
      fcfMarginSensitivity
    };
  }
}

/**
 * Singleton instance
 */
export const dcfValuationService = new DCFValuationService();
