/**
 * Service module tests
 */
import { describe, it, expect } from 'vitest';

describe('Cache Service', () => {
  it('should import without errors', async () => {
    const module = await import('../src/services/cache.js');
    expect(module).toBeDefined();
    expect(module.cacheService).toBeDefined();
  });
});

describe('Yahoo Finance Service', () => {
  it('should import without errors', async () => {
    const module = await import('../src/services/yahoo-finance.js');
    expect(module).toBeDefined();
    expect(module.yahooFinanceService).toBeDefined();
  });
});

describe('Indicators Service', () => {
  it('should import without errors', async () => {
    const module = await import('../src/services/indicators.js');
    expect(module).toBeDefined();
    expect(module.indicatorService).toBeDefined();
  });
});

describe('Options Service', () => {
  it('should import without errors', async () => {
    const module = await import('../src/services/options.js');
    expect(module).toBeDefined();
    expect(module.OptionsService).toBeDefined();
  });
});

describe('Greeks Service', () => {
  it('should import without errors', async () => {
    const module = await import('../src/services/greeks.js');
    expect(module).toBeDefined();
    expect(module.GreeksCalculator).toBeDefined();
  });
});
