/**
 * Input validation utilities and schemas
 */

import { z } from 'zod';

/**
 * Ticker symbol validation
 * - 1-10 characters
 * - Alphanumeric, dots, dashes allowed
 * - For crypto, format like BTC-USD
 */
export const symbolSchema = z
  .string()
  .min(1, 'Symbol cannot be empty')
  .max(10, 'Symbol too long')
  .regex(/^[A-Z0-9.-]+$/i, 'Invalid symbol format');

/**
 * Interval validation for historical data
 */
export const intervalSchema = z.enum([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '1d',
  '1wk',
  '1mo'
]);

/**
 * Date validation - accepts ISO strings or Date objects
 */
export const dateSchema = z.union([
  z.string().datetime(),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.date(),
  z.string().regex(/^\d+[hdwmy]$/) // Relative dates like "1d", "1mo", etc.
]);

/**
 * Indicator type validation
 */
export const indicatorTypeSchema = z.enum([
  'rsi',
  'macd',
  'sma',
  'ema',
  'bollinger_bands',
  'stochastic'
]);

/**
 * Quote tool input schema
 */
export const getQuoteInputSchema = z.object({
  symbol: symbolSchema,
  fields: z.array(z.string()).optional()
});

/**
 * Historical data tool input schema
 */
export const getHistoricalInputSchema = z.object({
  symbol: symbolSchema,
  period1: dateSchema,
  period2: dateSchema.optional(),
  interval: intervalSchema
});

/**
 * Calculate indicator tool input schema
 */
export const calculateIndicatorInputSchema = z.object({
  symbol: symbolSchema,
  indicator: indicatorTypeSchema,
  period: z.number().int().positive().optional(),
  interval: intervalSchema.optional(),
  startDate: dateSchema.optional()
});

/**
 * Search ticker tool input schema
 */
export const searchTickerInputSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty'),
  limit: z.number().int().positive().max(50).optional().default(10)
});

/**
 * Market news tool input schema
 */
export const getMarketNewsInputSchema = z.object({
  symbol: symbolSchema.optional(),
  limit: z.number().int().positive().max(50).optional(),
  comprehensive: z.boolean().optional()
});

/**
 * Transaction type validation for insider trades
 */
export const transactionTypeSchema = z.enum(['buy', 'sell', 'all']);

/**
 * Insider trades tool input schema
 */
export const getInsiderTradesInputSchema = z.object({
  symbol: symbolSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
  transactionType: transactionTypeSchema.optional(),
  startDate: dateSchema.optional(),
  includeCompanyInfo: z.boolean().optional()
});

/**
 * Batch quote tool input schema
 */
export const getBatchQuoteInputSchema = z.object({
  symbols: z
    .array(symbolSchema)
    .min(1, 'At least one symbol required')
    .max(50, 'Maximum 50 symbols allowed')
});

/**
 * Validate and parse input
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  return schema.parse(input);
}

/**
 * Parse relative date strings to Date objects
 */
export function parseRelativeDate(dateStr: string): Date {
  const now = new Date();

  // Check if it's a relative date (e.g., "1d", "1mo", "1y")
  const match = dateStr.match(/^(\d+)([hdwmy])$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'h': // hours
        return new Date(now.getTime() - value * 60 * 60 * 1000);
      case 'd': // days
        return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
      case 'w': // weeks
        return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
      case 'm': // months
        return new Date(now.setMonth(now.getMonth() - value));
      case 'y': // years
        return new Date(now.setFullYear(now.getFullYear() - value));
      default:
        throw new Error(`Invalid date unit: ${unit}`);
    }
  }

  // If it's an ISO date string or regular date string, parse it
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  return date;
}

/**
 * Validate date range
 */
export function validateDateRange(
  period1: Date,
  period2: Date = new Date()
): void {
  if (period1 > period2) {
    throw new Error('Start date must be before end date');
  }

  if (period2 > new Date()) {
    throw new Error('End date cannot be in the future');
  }

  // Check if range is reasonable (not more than 10 years)
  const diffYears =
    (period2.getTime() - period1.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (diffYears > 10) {
    throw new Error('Date range cannot exceed 10 years');
  }
}
