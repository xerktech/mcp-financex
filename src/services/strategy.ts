/**
 * Options strategy analyzer
 */

import {
  OptionsStrategy,
  OptionLeg,
  StrategyAnalysis,
  OptionGreeks
} from '../types/options.js';
import { greeksCalculator } from './greeks.js';
import { yahooFinanceService } from './yahoo-finance.js';
import { optionsService } from './options.js';

export class StrategyAnalyzer {
  private greeksCalc = greeksCalculator;
  private yahooService = yahooFinanceService;
  private optionsService = optionsService;

  /**
   * Analyze an options strategy
   */
  async analyzeStrategy(
    symbol: string,
    strategy: OptionsStrategy,
    legs: OptionLeg[],
    expirationDate: string | Date
  ): Promise<StrategyAnalysis> {
    // Get underlying price
    const quote = await this.yahooService.getQuote(symbol);
    const underlyingPrice = quote.regularMarketPrice;

    // Calculate net premium/debit
    let netPremium = 0;
    const legsWithPrices = await Promise.all(
      legs.map(async leg => {
        // Get option price from chain or calculate
        let premium = leg.premium;

        if (!premium) {
          const expStr = typeof expirationDate === 'string'
            ? expirationDate
            : expirationDate.toISOString().split('T')[0];

          try {
            const chain = await this.optionsService.getOptionsChain(symbol, expStr);
            const contracts = leg.optionType === 'call' ? chain.calls : chain.puts;
            const contract = contracts.find(c => c.strike === leg.strike);

            if (contract) {
              premium = (contract.bid + contract.ask) / 2;
            } else {
              // Fallback to Black-Scholes pricing
              const expDate = typeof expirationDate === 'string'
                ? new Date(expirationDate)
                : expirationDate;
              const T = (expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);

              // Estimate volatility
              const hvResult = await this.optionsService.calculateHistoricalVolatility(symbol, [30]);
              const volatility = hvResult.periods[0].annualized / 100;

              premium = this.greeksCalc.calculateOptionPrice({
                underlyingPrice,
                strike: leg.strike,
                timeToExpiration: T,
                volatility,
                riskFreeRate: 0.045,
                dividendYield: 0,
                optionType: leg.optionType
              });
            }
          } catch (error) {
            console.error('Failed to get option price:', error);
            premium = 0;
          }
        }

        const multiplier = leg.action === 'buy' ? -1 : 1;
        netPremium += premium * multiplier * leg.quantity * 100;

        return { ...leg, premium };
      })
    );

    // Calculate strategy Greeks
    const greeks = await this.calculateStrategyGreeks(
      symbol,
      legsWithPrices,
      expirationDate,
      underlyingPrice
    );

    // Calculate max profit/loss and break-even
    const { maxProfit, maxLoss, breakEvenPoints } = this.calculateProfitLoss(
      strategy,
      legsWithPrices,
      underlyingPrice
    );

    // Generate P&L chart
    const profitLossChart = this.generatePLChart(
      legsWithPrices,
      underlyingPrice,
      maxProfit,
      maxLoss
    );

    return {
      strategy,
      symbol,
      expirationDate: typeof expirationDate === 'string' ? new Date(expirationDate) : expirationDate,
      legs: legsWithPrices,
      underlyingPrice,
      maxProfit,
      maxLoss,
      breakEvenPoints,
      netPremium,
      netDebit: netPremium < 0 ? Math.abs(netPremium) : 0,
      greeks,
      profitLossChart
    };
  }

  /**
   * Calculate combined Greeks for a strategy
   */
  private async calculateStrategyGreeks(
    symbol: string,
    legs: OptionLeg[],
    expirationDate: string | Date,
    underlyingPrice: number
  ): Promise<OptionGreeks> {
    const greeksArray = await Promise.all(
      legs.map(async leg => {
        try {
          const greeks = await this.greeksCalc.calculateGreeks({
            symbol,
            strike: leg.strike,
            expirationDate,
            optionType: leg.optionType,
            underlyingPrice
          });

          const multiplier = leg.action === 'buy' ? 1 : -1;

          return {
            delta: greeks.delta * multiplier * leg.quantity,
            gamma: greeks.gamma * multiplier * leg.quantity,
            theta: greeks.theta * multiplier * leg.quantity,
            vega: greeks.vega * multiplier * leg.quantity,
            rho: greeks.rho * multiplier * leg.quantity
          };
        } catch (error) {
          console.error('Failed to calculate Greeks for leg:', error);
          return {
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            rho: 0
          };
        }
      })
    );

    // Sum up Greeks
    return greeksArray.reduce(
      (sum, g) => ({
        delta: Number((sum.delta + g.delta).toFixed(4)),
        gamma: Number((sum.gamma + g.gamma).toFixed(4)),
        theta: Number((sum.theta + g.theta).toFixed(4)),
        vega: Number((sum.vega + g.vega).toFixed(4)),
        rho: Number((sum.rho + g.rho).toFixed(4))
      }),
      { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
    );
  }

  /**
   * Calculate max profit, max loss, and break-even points
   */
  private calculateProfitLoss(
    strategy: OptionsStrategy,
    legs: OptionLeg[],
    underlyingPrice: number
  ): {
    maxProfit: number;
    maxLoss: number;
    breakEvenPoints: number[];
  } {
    // Get all strike prices
    const strikes = legs.map(l => l.strike).sort((a, b) => a - b);
    const minStrike = strikes[0];
    const maxStrike = strikes[strikes.length - 1];

    // Calculate initial credit/debit
    const initialCredit = legs.reduce((sum, leg) => {
      const multiplier = leg.action === 'buy' ? -1 : 1;
      return sum + (leg.premium || 0) * multiplier * leg.quantity * 100;
    }, 0);

    // Calculate P&L at various prices
    const testPrices: number[] = [];

    // Add strike prices and prices around them
    strikes.forEach(strike => {
      testPrices.push(strike - 10, strike - 5, strike, strike + 5, strike + 10);
    });

    // Add extreme prices
    testPrices.push(minStrike - 20, maxStrike + 20, 0);

    const profits = testPrices.map(price => {
      return this.calculatePLAtPrice(legs, price);
    });

    const maxProfit = Math.max(...profits);
    const maxLoss = Math.min(...profits);

    // Find break-even points
    const breakEvenPoints = this.findBreakEvenPoints(legs, strikes);

    return {
      maxProfit: Number(maxProfit.toFixed(2)),
      maxLoss: Number(maxLoss.toFixed(2)),
      breakEvenPoints: breakEvenPoints.map(p => Number(p.toFixed(2)))
    };
  }

  /**
   * Calculate P&L at a specific price
   */
  private calculatePLAtPrice(legs: OptionLeg[], price: number): number {
    let totalPL = 0;

    legs.forEach(leg => {
      const intrinsicValue = leg.optionType === 'call'
        ? Math.max(0, price - leg.strike)
        : Math.max(0, leg.strike - price);

      const premium = leg.premium || 0;
      const multiplier = leg.action === 'buy' ? 1 : -1;

      // P&L = (Intrinsic Value - Premium Paid) * Multiplier * Quantity * 100
      const legPL = (intrinsicValue - premium) * multiplier * leg.quantity * 100;
      totalPL += legPL;
    });

    return totalPL;
  }

  /**
   * Find break-even points
   */
  private findBreakEvenPoints(legs: OptionLeg[], strikes: number[]): number[] {
    const breakEvens: number[] = [];
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);

    // Test prices in small increments
    for (let price = minStrike - 50; price <= maxStrike + 50; price += 0.5) {
      const pl = this.calculatePLAtPrice(legs, price);

      if (Math.abs(pl) < 25) {
        // Close to break-even (within $0.25)
        // Check if we haven't already added a nearby break-even
        const isDuplicate = breakEvens.some(be => Math.abs(be - price) < 1);

        if (!isDuplicate) {
          breakEvens.push(price);
        }
      }
    }

    return breakEvens.sort((a, b) => a - b);
  }

  /**
   * Generate P&L chart data
   */
  private generatePLChart(
    legs: OptionLeg[],
    underlyingPrice: number,
    maxProfit: number,
    maxLoss: number
  ): Array<{ price: number; profitLoss: number; profitLossPercent: number }> {
    const strikes = legs.map(l => l.strike).sort((a, b) => a - b);
    const minStrike = strikes[0];
    const maxStrike = strikes[strikes.length - 1];

    const range = maxStrike - minStrike;
    const startPrice = Math.max(0, minStrike - range * 0.5);
    const endPrice = maxStrike + range * 0.5;

    const step = (endPrice - startPrice) / 100;

    const chart: Array<{ price: number; profitLoss: number; profitLossPercent: number }> = [];

    for (let price = startPrice; price <= endPrice; price += step) {
      const pl = this.calculatePLAtPrice(legs, price);

      // Calculate initial investment for percent calculation
      const initialInvestment = Math.abs(legs.reduce((sum, leg) => {
        if (leg.action === 'buy') {
          return sum + (leg.premium || 0) * leg.quantity * 100;
        }
        return sum;
      }, 0));

      const plPercent = initialInvestment > 0
        ? (pl / initialInvestment) * 100
        : 0;

      chart.push({
        price: Number(price.toFixed(2)),
        profitLoss: Number(pl.toFixed(2)),
        profitLossPercent: Number(plPercent.toFixed(2))
      });
    }

    return chart;
  }
}

// Export singleton instance
export const strategyAnalyzer = new StrategyAnalyzer();
