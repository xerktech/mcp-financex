/**
 * Options Greeks calculator using Black-Scholes model
 */

import blackScholes from 'black-scholes';
import { OptionGreeks, GreeksParams, OptionType } from '../types/options.js';
import { yahooFinanceService } from './yahoo-finance.js';
import { optionsService } from './options.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Default risk-free rate (10-year Treasury yield approximation)
 */
const DEFAULT_RISK_FREE_RATE = 0.045; // 4.5%

export class GreeksCalculator {
  private yahooService = yahooFinanceService;
  private optionsService = optionsService;

  /**
   * Calculate Greeks for an option
   */
  async calculateGreeks(params: GreeksParams): Promise<OptionGreeks & { impliedVolatility?: number }> {
    try {
      const {
        symbol,
        strike,
        expirationDate,
        optionType,
        riskFreeRate = DEFAULT_RISK_FREE_RATE,
        dividendYield = 0
      } = params;

      // Get underlying price if not provided
      let underlyingPrice = params.underlyingPrice;
      if (!underlyingPrice) {
        const quote = await this.yahooService.getQuote(symbol);
        underlyingPrice = quote.regularMarketPrice;
      }

      // Calculate time to expiration in years
      const expDate = typeof expirationDate === 'string'
        ? new Date(expirationDate)
        : expirationDate;
      const now = new Date();
      const timeToExpiration = (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365);

      if (timeToExpiration <= 0) {
        throw new Error('Option has already expired');
      }

      // Get implied volatility from options chain
      let impliedVolatility: number;
      try {
        const expirationStr = expDate.toISOString().split('T')[0];
        const chain = await this.optionsService.getOptionsChain(symbol, expirationStr);

        const contracts = optionType === 'call' ? chain.calls : chain.puts;
        const contract = contracts.find(c => c.strike === strike);

        if (contract && contract.impliedVolatility > 0) {
          impliedVolatility = contract.impliedVolatility;
        } else {
          // Fallback: estimate IV using historical volatility
          const hvResult = await this.optionsService.calculateHistoricalVolatility(symbol, [30]);
          impliedVolatility = hvResult.periods[0].annualized / 100;
        }
      } catch {
        // Fallback to historical volatility
        const hvResult = await this.optionsService.calculateHistoricalVolatility(symbol, [30]);
        impliedVolatility = hvResult.periods[0].annualized / 100;
      }

      // Calculate Greeks using Black-Scholes
      const greeks = this.calculateBlackScholesGreeks({
        underlyingPrice,
        strike,
        timeToExpiration,
        volatility: impliedVolatility,
        riskFreeRate,
        dividendYield,
        optionType
      });

      return {
        ...greeks,
        impliedVolatility: impliedVolatility * 100 // Return as percentage
      };
    } catch (error) {
      throw ErrorHandler.handle(error);
    }
  }

  /**
   * Calculate Black-Scholes Greeks
   */
  private calculateBlackScholesGreeks(params: {
    underlyingPrice: number;
    strike: number;
    timeToExpiration: number;
    volatility: number;
    riskFreeRate: number;
    dividendYield: number;
    optionType: OptionType;
  }): OptionGreeks {
    const {
      underlyingPrice: S,
      strike: K,
      timeToExpiration: T,
      volatility: sigma,
      riskFreeRate: r,
      dividendYield: q,
      optionType
    } = params;

    // Adjust stock price for dividends
    const adjustedS = S * Math.exp(-q * T);

    // Calculate d1 and d2
    const d1 = (Math.log(adjustedS / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    // Standard normal distribution functions
    const N = (x: number) => this.cumulativeNormalDistribution(x);
    const n = (x: number) => this.normalDistribution(x);

    // Calculate Greeks
    let delta: number;
    if (optionType === 'call') {
      delta = Math.exp(-q * T) * N(d1);
    } else {
      delta = Math.exp(-q * T) * (N(d1) - 1);
    }

    // Gamma is same for calls and puts
    const gamma = (Math.exp(-q * T) * n(d1)) / (S * sigma * Math.sqrt(T));

    // Theta (daily time decay)
    let theta: number;
    if (optionType === 'call') {
      theta =
        (-(S * n(d1) * sigma * Math.exp(-q * T)) / (2 * Math.sqrt(T)) -
          r * K * Math.exp(-r * T) * N(d2) +
          q * S * Math.exp(-q * T) * N(d1)) /
        365;
    } else {
      theta =
        (-(S * n(d1) * sigma * Math.exp(-q * T)) / (2 * Math.sqrt(T)) +
          r * K * Math.exp(-r * T) * N(-d2) -
          q * S * Math.exp(-q * T) * N(-d1)) /
        365;
    }

    // Vega (sensitivity to 1% change in volatility)
    const vega = (S * Math.exp(-q * T) * n(d1) * Math.sqrt(T)) / 100;

    // Rho (sensitivity to 1% change in interest rate)
    let rho: number;
    if (optionType === 'call') {
      rho = (K * T * Math.exp(-r * T) * N(d2)) / 100;
    } else {
      rho = (-K * T * Math.exp(-r * T) * N(-d2)) / 100;
    }

    return {
      delta: Number(delta.toFixed(4)),
      gamma: Number(gamma.toFixed(4)),
      theta: Number(theta.toFixed(4)),
      vega: Number(vega.toFixed(4)),
      rho: Number(rho.toFixed(4))
    };
  }

  /**
   * Standard normal distribution (PDF)
   */
  private normalDistribution(x: number): number {
    return Math.exp(-(x ** 2) / 2) / Math.sqrt(2 * Math.PI);
  }

  /**
   * Cumulative normal distribution (CDF)
   */
  private cumulativeNormalDistribution(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-(x ** 2) / 2);
    const p =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  /**
   * Calculate option price using Black-Scholes
   */
  calculateOptionPrice(params: {
    underlyingPrice: number;
    strike: number;
    timeToExpiration: number;
    volatility: number;
    riskFreeRate: number;
    dividendYield: number;
    optionType: OptionType;
  }): number {
    const {
      underlyingPrice: S,
      strike: K,
      timeToExpiration: T,
      volatility: sigma,
      riskFreeRate: r,
      dividendYield: q,
      optionType
    } = params;

    try {
      if (optionType === 'call') {
        return blackScholes.blackScholes(S, K, T, sigma, r, 'call');
      } else {
        return blackScholes.blackScholes(S, K, T, sigma, r, 'put');
      }
    } catch {
      // Fallback to manual calculation if library fails
      const adjustedS = S * Math.exp(-q * T);
      const d1 = (Math.log(adjustedS / K) + (r + sigma ** 2 / 2) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);

      const N = (x: number) => this.cumulativeNormalDistribution(x);

      if (optionType === 'call') {
        return adjustedS * N(d1) - K * Math.exp(-r * T) * N(d2);
      } else {
        return K * Math.exp(-r * T) * N(-d2) - adjustedS * N(-d1);
      }
    }
  }
}

// Export singleton instance
export const greeksCalculator = new GreeksCalculator();
