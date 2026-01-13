/**
 * Market data type definitions for stocks and cryptocurrencies
 */

export interface QuoteData {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap?: number;
  currency: string;
  exchangeName: string;
  quoteType: 'EQUITY' | 'CRYPTOCURRENCY' | 'ETF' | 'INDEX' | 'MUTUALFUND' | 'CURRENCY';
  regularMarketTime: Date;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  shortName?: string;
  longName?: string;
}

export interface HistoricalDataPoint {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

export interface HistoricalParams {
  symbol: string;
  period1: string | Date;
  period2?: string | Date;
  interval: '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1wk' | '1mo';
}

export interface NewsArticle {
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: Date;
  type: string;
  thumbnail?: {
    url: string;
    width?: number;
    height?: number;
  };
  relatedTickers?: string[];
  summary?: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchDisp: string;
  typeDisp: string;
  quoteType: string;
  exchange: string;
  industry?: string;
  sector?: string;
}

export interface MarketSummary {
  symbol: string;
  name: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketTime: Date;
}

export interface ChartParams {
  period1: string | Date;
  period2?: string | Date;
  interval: string;
  includeAdjClose?: boolean;
}

export interface ChartData {
  meta: {
    symbol: string;
    currency: string;
    exchangeName: string;
    instrumentType: string;
    regularMarketPrice: number;
    regularMarketTime: Date;
  };
  quotes: HistoricalDataPoint[];
}

/**
 * Watchlist entry with metadata
 */
export interface WatchlistItem {
  symbol: string;
  addedAt: Date;
  notes?: string;
  alertPrice?: number;
}

/**
 * Batch quote request/response
 */
export interface BatchQuoteRequest {
  symbols: string[];
}

export interface BatchQuoteResponse {
  quotes: Record<string, QuoteData | null>;
  errors: Record<string, string>;
}
