/**
 * Error handling utilities for the MCP Finance server
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ZodError } from 'zod';

export class FinanceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'FinanceError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ErrorHandler {
  /**
   * Handle and transform errors into FinanceError instances
   */
  static handle(error: unknown): FinanceError {
    // Already a FinanceError, return as-is
    if (error instanceof FinanceError) {
      return error;
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return this.handleZodError(error);
    }

    // Handle Yahoo Finance errors
    if (this.isYahooFinanceError(error)) {
      return this.handleYahooError(error);
    }

    // Handle SEC EDGAR errors
    if (this.isSECError(error)) {
      return this.handleSECError(error);
    }

    // Handle standard Error instances
    if (error instanceof Error) {
      return this.handleGenericError(error);
    }

    // Handle unknown errors
    return new FinanceError(
      'An unexpected error occurred',
      'INTERNAL_ERROR',
      500,
      { originalError: String(error) }
    );
  }

  /**
   * Handle Zod validation errors
   */
  private static handleZodError(error: ZodError): FinanceError {
    const issues = error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
      code: err.code
    }));

    return new FinanceError(
      'Invalid input parameters',
      'VALIDATION_ERROR',
      400,
      { issues }
    );
  }

  /**
   * Handle Yahoo Finance API errors
   */
  private static handleYahooError(error: any): FinanceError {
    const message = error.message || String(error);

    // Symbol not found (404)
    if (
      message.includes('404') ||
      message.includes('not found') ||
      message.includes('No data found') ||
      message.includes('Unknown symbol')
    ) {
      return new FinanceError(
        'Symbol not found. Please check the ticker symbol and try again.',
        'INVALID_SYMBOL',
        404,
        { symbol: error.symbol }
      );
    }

    // Rate limiting (429)
    if (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('Too Many Requests')
    ) {
      return new FinanceError(
        'Rate limit exceeded. Please try again in a few moments.',
        'RATE_LIMIT',
        429
      );
    }

    // Timeout errors
    if (
      message.includes('timeout') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNABORTED')
    ) {
      return new FinanceError(
        'Request timeout. The service took too long to respond.',
        'TIMEOUT',
        504
      );
    }

    // Network errors
    if (
      message.includes('ENOTFOUND') ||
      message.includes('ECONNREFUSED') ||
      message.includes('network')
    ) {
      return new FinanceError(
        'Network error. Please check your internet connection.',
        'NETWORK_ERROR',
        502
      );
    }

    // Invalid date range
    if (
      message.includes('invalid') &&
      (message.includes('date') || message.includes('period'))
    ) {
      return new FinanceError(
        'Invalid date range. Please check your start and end dates.',
        'INVALID_DATE_RANGE',
        400
      );
    }

    // Generic API error
    return new FinanceError(
      'Failed to fetch data from Yahoo Finance. Please try again later.',
      'API_ERROR',
      502,
      { originalMessage: message }
    );
  }

  /**
   * Handle SEC EDGAR API errors
   */
  private static handleSECError(error: any): FinanceError {
    const message = error.message || String(error);

    // SEC rate limiting (403 or explicit rate limit message)
    if (
      message.includes('403') ||
      message.includes('rate limit') ||
      message.includes('Forbidden')
    ) {
      return new FinanceError(
        'SEC.gov rate limit exceeded. Please wait 10 seconds and try again.',
        'SEC_RATE_LIMIT',
        429,
        { hint: 'SEC limits requests to 10 per second' }
      );
    }

    // CIK not found
    if (
      message.includes('CIK not found') ||
      message.includes('No matching Ticker Symbol')
    ) {
      return new FinanceError(
        'Company not found in SEC database. Symbol may be incorrect or not publicly traded.',
        'CIK_NOT_FOUND',
        404
      );
    }

    // No Form 4 filings
    if (
      message.includes('No filings found') ||
      message.includes('No results found')
    ) {
      return new FinanceError(
        'No insider trading filings found for this company.',
        'NO_FILINGS',
        404
      );
    }

    // XML parsing error
    if (
      message.includes('XML parse') ||
      message.includes('Invalid XML') ||
      message.includes('parse error')
    ) {
      return new FinanceError(
        'Failed to parse SEC filing data. The filing may be malformed.',
        'XML_PARSE_ERROR',
        500
      );
    }

    // SEC service unavailable
    if (
      message.includes('503') ||
      message.includes('Service Unavailable')
    ) {
      return new FinanceError(
        'SEC.gov service is temporarily unavailable. Please try again later.',
        'SEC_UNAVAILABLE',
        503
      );
    }

    // Generic SEC error
    return new FinanceError(
      'Failed to fetch data from SEC EDGAR. Please try again later.',
      'SEC_ERROR',
      502,
      { originalMessage: message }
    );
  }

  /**
   * Handle generic Error instances
   */
  private static handleGenericError(error: Error): FinanceError {
    const message = error.message;

    // Check for specific error patterns
    if (message.includes('cache')) {
      return new FinanceError(
        'Cache operation failed',
        'CACHE_ERROR',
        500,
        { originalMessage: message }
      );
    }

    if (message.includes('indicator') || message.includes('calculation')) {
      return new FinanceError(
        'Failed to calculate technical indicator',
        'INDICATOR_ERROR',
        500,
        { originalMessage: message }
      );
    }

    // Generic server error
    return new FinanceError(
      'An internal server error occurred',
      'INTERNAL_ERROR',
      500,
      { originalMessage: message }
    );
  }

  /**
   * Check if an error is from Yahoo Finance
   */
  private static isYahooFinanceError(error: any): boolean {
    if (!error) {
return false;
}

    const message = error.message || String(error);
    const errorString = message.toLowerCase();

    return (
      errorString.includes('yahoo') ||
      errorString.includes('quote') ||
      errorString.includes('chart') ||
      errorString.includes('search') ||
      error.type === 'yf-error' ||
      error.name === 'FailedYahooValidationError' ||
      error.name === 'InvalidOptionsError'
    );
  }

  /**
   * Check if an error is from SEC EDGAR
   */
  private static isSECError(error: any): boolean {
    if (!error) {
      return false;
    }

    const message = error.message || String(error);
    const errorString = message.toLowerCase();

    return (
      errorString.includes('sec') ||
      errorString.includes('edgar') ||
      errorString.includes('cik') ||
      errorString.includes('form 4') ||
      error.type === 'sec-error'
    );
  }

  /**
   * Format error for MCP response
   */
  static toMCPError(error: FinanceError): {
    error: string;
    code: string;
    details?: any;
  } {
    return {
      error: error.message,
      code: error.code,
      ...(error.details && { details: error.details })
    };
  }
}

/**
 * Retry utility with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = defaultShouldRetry
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we shouldn't
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay;
      const totalDelay = delay + jitter;

      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  throw lastError;
}

/**
 * Default retry logic: retry on network/timeout errors, not on validation errors
 */
function defaultShouldRetry(error: any): boolean {
  if (error instanceof FinanceError) {
    // Don't retry validation errors (4xx)
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return false;
    }

    // Retry on server errors (5xx) and rate limits
    return true;
  }

  // Retry on network/timeout errors
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  );
}
