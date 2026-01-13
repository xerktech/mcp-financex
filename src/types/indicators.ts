/**
 * Technical indicator type definitions
 */

export type IndicatorType = 'rsi' | 'macd' | 'sma' | 'ema' | 'bollinger_bands' | 'stochastic';

export interface IndicatorParams {
  symbol: string;
  indicator: IndicatorType;
  period?: number;
  interval?: string;
  startDate?: string;
}

/**
 * RSI (Relative Strength Index) Result
 */
export interface RSIResult {
  symbol: string;
  indicator: 'rsi';
  period: number;
  interval: string;
  values: Array<{
    date: Date;
    rsi: number;
    signal?: 'overbought' | 'oversold' | 'neutral';
  }>;
}

/**
 * MACD (Moving Average Convergence Divergence) Result
 */
export interface MACDResult {
  symbol: string;
  indicator: 'macd';
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  interval: string;
  values: Array<{
    date: Date;
    macd: number;
    signal: number;
    histogram: number;
    crossover?: 'bullish' | 'bearish' | null;
  }>;
}

/**
 * SMA (Simple Moving Average) Result
 */
export interface SMAResult {
  symbol: string;
  indicator: 'sma';
  period: number;
  interval: string;
  values: Array<{
    date: Date;
    sma: number;
    price: number;
  }>;
}

/**
 * EMA (Exponential Moving Average) Result
 */
export interface EMAResult {
  symbol: string;
  indicator: 'ema';
  period: number;
  interval: string;
  values: Array<{
    date: Date;
    ema: number;
    price: number;
  }>;
}

/**
 * Bollinger Bands Result
 */
export interface BollingerBandsResult {
  symbol: string;
  indicator: 'bollinger_bands';
  period: number;
  stdDev: number;
  interval: string;
  values: Array<{
    date: Date;
    upper: number;
    middle: number;
    lower: number;
    price: number;
    bandwidth?: number;
    percentB?: number;
  }>;
}

/**
 * Stochastic Oscillator Result
 */
export interface StochasticResult {
  symbol: string;
  indicator: 'stochastic';
  period: number;
  signalPeriod: number;
  interval: string;
  values: Array<{
    date: Date;
    k: number;
    d: number;
    signal?: 'overbought' | 'oversold' | 'neutral';
  }>;
}

/**
 * Union type for all indicator results
 */
export type IndicatorResult =
  | RSIResult
  | MACDResult
  | SMAResult
  | EMAResult
  | BollingerBandsResult
  | StochasticResult;

/**
 * Price data format for indicator calculations
 */
export interface PriceData {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * MACD specific parameters
 */
export interface MACDParams {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
}

/**
 * Bollinger Bands specific parameters
 */
export interface BollingerBandsParams {
  period?: number;
  stdDev?: number;
}

/**
 * Stochastic specific parameters
 */
export interface StochasticParams {
  period?: number;
  signalPeriod?: number;
}
