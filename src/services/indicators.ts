/**
 * Technical indicators service using technicalindicators library
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  RSI,
  MACD,
  SMA,
  EMA,
  BollingerBands,
  Stochastic
} from 'technicalindicators';
import {
  IndicatorResult,
  RSIResult,
  MACDResult,
  SMAResult,
  EMAResult,
  BollingerBandsResult,
  StochasticResult,
  IndicatorParams,
  MACDParams,
  BollingerBandsParams,
  StochasticParams
} from '../types/indicators.js';
import { HistoricalDataPoint } from '../types/market-data.js';
import { yahooFinanceService } from './yahoo-finance.js';
import { cacheService, CacheService, CacheTTL } from './cache.js';
import { ErrorHandler } from '../utils/error-handler.js';

export class IndicatorService {
  private yahooService = yahooFinanceService;
  private cache = cacheService;

  /**
   * Calculate indicator for a symbol
   */
  async calculateIndicator(params: IndicatorParams): Promise<IndicatorResult> {
    const {
      symbol,
      indicator,
      period = this.getDefaultPeriod(indicator),
      interval = '1d',
      startDate
    } = params;

    const cacheKey = CacheService.generateIndicatorKey(
      symbol,
      indicator,
      period,
      interval
    );

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        try {
          // Fetch historical data
          const historicalData = await this.fetchHistoricalData(
            symbol,
            interval,
            startDate,
            period
          );

          // Calculate indicator based on type
          switch (indicator) {
            case 'rsi':
              return this.calculateRSI(symbol, historicalData, period, interval);
            case 'macd':
              return this.calculateMACD(symbol, historicalData, interval);
            case 'sma':
              return this.calculateSMA(symbol, historicalData, period, interval);
            case 'ema':
              return this.calculateEMA(symbol, historicalData, period, interval);
            case 'bollinger_bands':
              return this.calculateBollingerBands(
                symbol,
                historicalData,
                period,
                interval
              );
            case 'stochastic':
              return this.calculateStochastic(
                symbol,
                historicalData,
                period,
                interval
              );
            default:
              throw new Error(`Unknown indicator: ${indicator}`);
          }
        } catch (error) {
          throw ErrorHandler.handle(error);
        }
      },
      CacheTTL.INDICATOR
    );
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  private calculateRSI(
    symbol: string,
    data: HistoricalDataPoint[],
    period: number,
    interval: string
  ): RSIResult {
    const closes = data.map(d => d.close);
    const rsiValues = RSI.calculate({
      values: closes,
      period
    });

    const values = rsiValues.map((rsi, index) => {
      const dataIndex = data.length - rsiValues.length + index;
      return {
        date: data[dataIndex].date,
        rsi,
        signal: this.getRSISignal(rsi)
      };
    });

    return {
      symbol,
      indicator: 'rsi',
      period,
      interval,
      values
    };
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  private calculateMACD(
    symbol: string,
    data: HistoricalDataPoint[],
    interval: string,
    params: MACDParams = {}
  ): MACDResult {
    const closes = data.map(d => d.close);
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: params.fastPeriod || 12,
      slowPeriod: params.slowPeriod || 26,
      signalPeriod: params.signalPeriod || 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    const values = macdValues
      .filter(m => m.MACD !== undefined)
      .map((macd, index) => {
        const dataIndex = data.length - macdValues.length + index;
        const prevMacd = index > 0 ? macdValues[index - 1] : null;

        return {
          date: data[dataIndex].date,
          macd: macd.MACD || 0,
          signal: macd.signal || 0,
          histogram: macd.histogram || 0,
          crossover: this.getMACDCrossover(macd, prevMacd)
        };
      });

    return {
      symbol,
      indicator: 'macd',
      fastPeriod: params.fastPeriod || 12,
      slowPeriod: params.slowPeriod || 26,
      signalPeriod: params.signalPeriod || 9,
      interval,
      values
    };
  }

  /**
   * Calculate SMA (Simple Moving Average)
   */
  private calculateSMA(
    symbol: string,
    data: HistoricalDataPoint[],
    period: number,
    interval: string
  ): SMAResult {
    const closes = data.map(d => d.close);
    const smaValues = SMA.calculate({
      values: closes,
      period
    });

    const values = smaValues.map((sma, index) => {
      const dataIndex = data.length - smaValues.length + index;
      return {
        date: data[dataIndex].date,
        sma,
        price: data[dataIndex].close
      };
    });

    return {
      symbol,
      indicator: 'sma',
      period,
      interval,
      values
    };
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  private calculateEMA(
    symbol: string,
    data: HistoricalDataPoint[],
    period: number,
    interval: string
  ): EMAResult {
    const closes = data.map(d => d.close);
    const emaValues = EMA.calculate({
      values: closes,
      period
    });

    const values = emaValues.map((ema, index) => {
      const dataIndex = data.length - emaValues.length + index;
      return {
        date: data[dataIndex].date,
        ema,
        price: data[dataIndex].close
      };
    });

    return {
      symbol,
      indicator: 'ema',
      period,
      interval,
      values
    };
  }

  /**
   * Calculate Bollinger Bands
   */
  private calculateBollingerBands(
    symbol: string,
    data: HistoricalDataPoint[],
    period: number,
    interval: string,
    params: BollingerBandsParams = {}
  ): BollingerBandsResult {
    const closes = data.map(d => d.close);
    const stdDev = params.stdDev || 2;

    const bbValues = BollingerBands.calculate({
      values: closes,
      period,
      stdDev
    });

    const values = bbValues.map((bb, index) => {
      const dataIndex = data.length - bbValues.length + index;
      const price = data[dataIndex].close;

      return {
        date: data[dataIndex].date,
        upper: bb.upper,
        middle: bb.middle,
        lower: bb.lower,
        price,
        bandwidth: ((bb.upper - bb.lower) / bb.middle) * 100,
        percentB: (price - bb.lower) / (bb.upper - bb.lower)
      };
    });

    return {
      symbol,
      indicator: 'bollinger_bands',
      period,
      stdDev,
      interval,
      values
    };
  }

  /**
   * Calculate Stochastic Oscillator
   */
  private calculateStochastic(
    symbol: string,
    data: HistoricalDataPoint[],
    period: number,
    interval: string,
    params: StochasticParams = {}
  ): StochasticResult {
    const stochValues = Stochastic.calculate({
      high: data.map(d => d.high),
      low: data.map(d => d.low),
      close: data.map(d => d.close),
      period,
      signalPeriod: params.signalPeriod || 3
    });

    const values = stochValues.map((stoch, index) => {
      const dataIndex = data.length - stochValues.length + index;
      return {
        date: data[dataIndex].date,
        k: stoch.k,
        d: stoch.d,
        signal: this.getStochasticSignal(stoch.k)
      };
    });

    return {
      symbol,
      indicator: 'stochastic',
      period,
      signalPeriod: params.signalPeriod || 3,
      interval,
      values
    };
  }

  /**
   * Fetch historical data with appropriate lookback period
   */
  private async fetchHistoricalData(
    symbol: string,
    interval: string,
    startDate?: string,
    indicatorPeriod?: number
  ): Promise<HistoricalDataPoint[]> {
    // Calculate how far back we need to go
    let period1: string;

    if (startDate) {
      period1 = startDate;
    } else {
      // Default lookback based on interval and period
      const lookbackDays = this.calculateLookbackDays(interval, indicatorPeriod);
      period1 = `${lookbackDays}d`;
    }

    return await this.yahooService.getHistorical({
      symbol,
      period1,
      interval: interval as any
    });
  }

  /**
   * Calculate how many days to look back based on interval and period
   */
  private calculateLookbackDays(
    interval: string,
    indicatorPeriod: number = 50
  ): number {
    // Need enough data points for indicator calculation
    const dataPoints = Math.max(indicatorPeriod * 3, 200);

    switch (interval) {
      case '1m':
      case '5m':
      case '15m':
      case '30m':
        return 7; // 1 week for intraday
      case '1h':
        return 30; // 1 month
      case '1d':
        return Math.ceil(dataPoints * 1.5); // 1.5x for weekends
      case '1wk':
        return Math.ceil(dataPoints * 7 * 1.5);
      case '1mo':
        return Math.ceil(dataPoints * 30);
      default:
        return 365; // Default 1 year
    }
  }

  /**
   * Get default period for each indicator
   */
  private getDefaultPeriod(indicator: string): number {
    switch (indicator) {
      case 'rsi':
        return 14;
      case 'macd':
        return 12; // Fast period
      case 'sma':
      case 'ema':
        return 20;
      case 'bollinger_bands':
        return 20;
      case 'stochastic':
        return 14;
      default:
        return 14;
    }
  }

  /**
   * Determine RSI signal
   */
  private getRSISignal(rsi: number): 'overbought' | 'oversold' | 'neutral' {
    if (rsi >= 70) {
return 'overbought';
}
    if (rsi <= 30) {
return 'oversold';
}
    return 'neutral';
  }

  /**
   * Determine MACD crossover
   */
  private getMACDCrossover(
    current: any,
    previous: any
  ): 'bullish' | 'bearish' | null {
    if (!previous || !current.MACD || !current.signal) {
return null;
}

    const currentDiff = current.MACD - current.signal;
    const prevDiff = (previous.MACD || 0) - (previous.signal || 0);

    if (prevDiff <= 0 && currentDiff > 0) {
return 'bullish';
}
    if (prevDiff >= 0 && currentDiff < 0) {
return 'bearish';
}

    return null;
  }

  /**
   * Determine Stochastic signal
   */
  private getStochasticSignal(k: number): 'overbought' | 'oversold' | 'neutral' {
    if (k >= 80) {
return 'overbought';
}
    if (k <= 20) {
return 'oversold';
}
    return 'neutral';
  }
}

// Export singleton instance
export const indicatorService = new IndicatorService();
