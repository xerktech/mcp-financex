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
  // Enhanced fields for better context
  uuid?: string;
  categories?: string[];
  relatedSymbolsContext?: {
    symbol: string;
    relationship: string; // e.g., "competitor", "supplier", "partner"
  }[];
}

export interface CompanyFundamentals {
  // Valuation metrics
  marketCap?: number;
  enterpriseValue?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToBook?: number;
  priceToSales?: number;

  // Profitability metrics
  profitMargins?: number;
  operatingMargins?: number;
  returnOnAssets?: number;
  returnOnEquity?: number;

  // Growth metrics
  revenueGrowth?: number;
  earningsGrowth?: number;

  // Financial health
  totalDebt?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;

  // Dividend info
  dividendYield?: number;
  dividendRate?: number;
  payoutRatio?: number;
  exDividendDate?: Date;

  // Analyst data
  targetMeanPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  numberOfAnalystOpinions?: number;
  recommendationMean?: number; // 1.0=Strong Buy, 5.0=Sell
  recommendationKey?: string;
}

export interface UpcomingEvent {
  type: 'earnings' | 'dividend' | 'split' | 'conference' | 'other';
  date: Date;
  description?: string;
  estimatedEPS?: number;
}

export interface InsiderTransaction {
  filingDate: Date;
  transactionDate: Date;
  insiderName: string;
  position?: string;
  transactionType: 'Buy' | 'Sell' | 'Option Exercise' | 'Gift' | 'Other';
  shares: number;
  value: number;
  sharesOwned?: number;

  // SEC-specific fields for Form 4 filings
  pricePerShare?: number;
  securityType?: string;
  transactionCode?: string;      // SEC codes (P=Purchase, S=Sale, M=Exercise, etc.)
  formType?: 'Form 4' | 'Form 3' | 'Form 5';
  filingUrl?: string;
  issuerCik?: string;
  issuerName?: string;
  issuerTicker?: string;
  directOrIndirect?: 'D' | 'I';  // D=Direct ownership, I=Indirect
}

export interface InsiderTradingAnalysis {
  symbol?: string;
  companyName?: string;
  cik?: string;
  timestamp: Date;

  // Summary statistics
  totalTransactions: number;
  netShares: number;           // Positive = net buying, negative = net selling
  netValue: number;

  // Breakdown by transaction type
  buyTransactions: number;
  sellTransactions: number;
  exerciseTransactions: number;
  otherTransactions: number;

  // Recent transactions
  recentTransactions: InsiderTransaction[];

  // Top insiders (by transaction value)
  topInsiders?: {
    name: string;
    position: string;
    totalValue: number;
    netShares: number;
  }[];

  // Company context (when symbol provided)
  profile?: CompanyProfile;
  fundamentals?: CompanyFundamentals;
}

export interface InstitutionalHolder {
  organization: string;
  shares: number;
  value: number;
  percentHeld: number;
  reportDate: Date;
}

export interface CompanyProfile {
  symbol: string;
  longName?: string;
  industry?: string;
  sector?: string;
  website?: string;
  fullTimeEmployees?: number;
  longBusinessSummary?: string;

  // Key personnel
  officers?: {
    name: string;
    title: string;
    age?: number;
    totalPay?: number;
  }[];
}

export interface MarketContext {
  symbol: string;
  timestamp: Date;

  // Company basics
  profile?: CompanyProfile;

  // Financial fundamentals
  fundamentals?: CompanyFundamentals;

  // News and sentiment
  recentNews: NewsArticle[];
  newsCount: number;

  // Upcoming catalysts
  upcomingEvents?: UpcomingEvent[];

  // Institutional activity
  institutionalOwnership?: {
    percentHeld: number;
    institutionsCount: number;
    topHolders?: InstitutionalHolder[];
  };

  // Insider activity
  insiderTransactions?: {
    netInsiderActivity: number; // Net buying/selling last 6 months
    recentTransactions?: InsiderTransaction[];
  };

  // Short interest (volatility indicator)
  shortInterest?: {
    shortRatio?: number;
    shortPercentOfFloat?: number;
    sharesShort?: number;
    dateShortInterest?: Date;
  };

  // Options activity (implied volatility)
  optionsActivity?: {
    impliedVolatility?: number;
    putCallRatio?: number;
    optionsVolume?: number;
  };

  // Analyst sentiment
  analystRatings?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    consensusRating: string;
  };

  // Sector/industry context
  sectorPerformance?: {
    sector: string;
    sectorChange: number;
    sectorChangePercent: number;
  };

  // Related companies (competitors, partners)
  relatedCompanies?: {
    symbol: string;
    name: string;
    relationship: string;
    correlation?: number;
  }[];
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
