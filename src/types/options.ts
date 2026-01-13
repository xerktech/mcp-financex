/**
 * Options trading type definitions
 */

/**
 * Option type
 */
export type OptionType = 'call' | 'put';

/**
 * Option contract data
 */
export interface OptionContract {
  contractSymbol: string;
  strike: number;
  currency: string;
  lastPrice: number;
  change: number;
  percentChange: number;
  volume: number;
  openInterest: number;
  bid: number;
  ask: number;
  contractSize: string;
  expiration: Date;
  lastTradeDate: Date;
  impliedVolatility: number;
  inTheMoney: boolean;
}

/**
 * Options chain data
 */
export interface OptionsChain {
  symbol: string;
  expirationDate: Date;
  calls: OptionContract[];
  puts: OptionContract[];
  underlyingPrice: number;
  timestamp: Date;
}

/**
 * Greeks for an option contract
 */
export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/**
 * Complete option data with Greeks
 */
export interface OptionWithGreeks extends OptionContract {
  greeks: OptionGreeks;
}

/**
 * Greeks calculation parameters
 */
export interface GreeksParams {
  symbol: string;
  strike: number;
  expirationDate: string | Date;
  optionType: OptionType;
  underlyingPrice?: number;
  riskFreeRate?: number;
  dividendYield?: number;
}

/**
 * Historical volatility result
 */
export interface HistoricalVolatilityResult {
  symbol: string;
  periods: Array<{
    days: number;
    volatility: number;
    annualized: number;
  }>;
  currentPrice: number;
  calculatedAt: Date;
}

/**
 * Earnings calendar entry
 */
export interface EarningsEvent {
  symbol: string;
  companyName: string;
  earningsDate: Date;
  earningsCallTime: string;
  epsEstimate?: number;
  reportedEPS?: number;
  surprise?: number;
  surprisePercent?: number;
}

/**
 * Dividend information
 */
export interface DividendInfo {
  symbol: string;
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: Date;
  payoutRatio?: number;
  fiveYearAvgDividendYield?: number;
  trailingAnnualDividendRate?: number;
  trailingAnnualDividendYield?: number;
  lastDividendValue?: number;
  lastDividendDate?: Date;
}

/**
 * Max pain calculation result
 */
export interface MaxPainResult {
  symbol: string;
  expirationDate: Date;
  maxPainPrice: number;
  currentPrice: number;
  totalOpenInterest: number;
  putCallRatio: number;
  pricePoints: Array<{
    price: number;
    totalPain: number;
    callPain: number;
    putPain: number;
  }>;
}

/**
 * Implied volatility data
 */
export interface ImpliedVolatilityData {
  symbol: string;
  currentIV: number;
  ivRank?: number;
  ivPercentile?: number;
  historicalVolatility: number;
  ivVsHV: number;
  atmCallIV?: number;
  atmPutIV?: number;
  ivByExpiration: Array<{
    expirationDate: Date;
    daysToExpiration: number;
    iv: number;
  }>;
}

/**
 * Options strategy leg
 */
export interface OptionLeg {
  strike: number;
  optionType: OptionType;
  action: 'buy' | 'sell';
  quantity: number;
  premium?: number;
}

/**
 * Options strategy types
 */
export type OptionsStrategy =
  | 'call'
  | 'put'
  | 'covered_call'
  | 'protective_put'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'bull_put_spread'
  | 'bear_call_spread'
  | 'long_straddle'
  | 'short_straddle'
  | 'long_strangle'
  | 'short_strangle'
  | 'iron_condor'
  | 'iron_butterfly'
  | 'butterfly_spread'
  | 'calendar_spread'
  | 'diagonal_spread';

/**
 * Options strategy analysis result
 */
export interface StrategyAnalysis {
  strategy: OptionsStrategy;
  symbol: string;
  expirationDate: Date;
  legs: OptionLeg[];
  underlyingPrice: number;

  // P&L metrics
  maxProfit: number;
  maxLoss: number;
  breakEvenPoints: number[];
  netPremium: number;
  netDebit: number;

  // Greeks for entire position
  greeks: OptionGreeks;

  // Probability analysis
  probabilityOfProfit?: number;
  expectedValue?: number;

  // P&L at various prices
  profitLossChart: Array<{
    price: number;
    profitLoss: number;
    profitLossPercent: number;
  }>;
}

/**
 * Options screener criteria
 */
export interface OptionsScreenerCriteria {
  minIV?: number;
  maxIV?: number;
  minVolume?: number;
  minOpenInterest?: number;
  daysToExpiration?: [number, number];
  deltaRange?: [number, number];
  strikeRange?: [number, number];
  moneyness?: 'ITM' | 'ATM' | 'OTM';
  minBidAskSpread?: number;
  maxBidAskSpread?: number;
}

/**
 * Options screener result
 */
export interface OptionsScreenerResult {
  contracts: OptionWithGreeks[];
  totalFound: number;
  criteria: OptionsScreenerCriteria;
}

/**
 * Unusual options activity
 */
export interface UnusualOptionsActivity {
  symbol: string;
  contract: OptionContract;
  volumeOIRatio: number;
  premium: number;
  unusual: boolean;
  signals: string[];
  timestamp: Date;
}
