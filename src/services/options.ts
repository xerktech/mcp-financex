/**
 * Options trading service with Yahoo Finance integration
 */

import yahooFinance from 'yahoo-finance2';
import { std } from 'mathjs';
import {
  OptionsChain,
  OptionContract,
  EarningsEvent,
  DividendInfo,
  HistoricalVolatilityResult,
  MaxPainResult,
  ImpliedVolatilityData,
  OptionType
} from '../types/options.js';
import { yahooFinanceService } from './yahoo-finance.js';
import { cacheService, CacheService, CacheTTL } from './cache.js';
import { ErrorHandler, withRetry } from '../utils/error-handler.js';

export class OptionsService {
  private yahooService = yahooFinanceService;
  private cache = cacheService;

  /**
   * Get options chain for a symbol
   */
  async getOptionsChain(
    symbol: string,
    expirationDate?: string
  ): Promise<OptionsChain> {
    const cacheKey = `options:chain:${symbol}:${expirationDate || 'all'}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            const options = await yahooFinance.options(symbol, {
              date: expirationDate ? new Date(expirationDate) : undefined
            }, { validateResult: false }) as any;

            if (!options) {
              throw new Error('No options data available');
            }

            // Get current underlying price
            const quote = await this.yahooService.getQuote(symbol);

            return {
              symbol,
              expirationDate: options.expirationDate || new Date(),
              calls: options.calls?.map(this.transformOptionContract) || [],
              puts: options.puts?.map(this.transformOptionContract) || [],
              underlyingPrice: quote.regularMarketPrice,
              timestamp: new Date()
            };
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      CacheTTL.DEFAULT
    );
  }

  /**
   * Get available expiration dates for a symbol
   */
  async getExpirationDates(symbol: string): Promise<Date[]> {
    const cacheKey = `options:expirations:${symbol}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            const options = await yahooFinance.options(symbol, {}, { validateResult: false }) as any;

            if (!options || !options.expirationDates) {
              return [];
            }

            return options.expirationDates.map((ts: any) => new Date(ts));
          } catch (error) {
            console.error('Failed to fetch expiration dates:', error);
            return [];
          }
        });
      },
      3600 // Cache for 1 hour
    );
  }

  /**
   * Get earnings calendar for a symbol or upcoming earnings
   */
  async getEarningsCalendar(
    symbol?: string,
    daysAhead: number = 30
  ): Promise<EarningsEvent[]> {
    const cacheKey = symbol
      ? `earnings:${symbol}`
      : `earnings:upcoming:${daysAhead}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            if (symbol) {
              // Get earnings for specific symbol
              const quote = await yahooFinance.quoteSummary(symbol, {
                modules: ['earnings', 'earningsHistory', 'calendarEvents']
              }, { validateResult: false }) as any;

              const events: EarningsEvent[] = [];

              // From calendar events
              if (quote.calendarEvents?.earnings) {
                const earningsDate = quote.calendarEvents.earnings.earningsDate?.[0];
                if (earningsDate) {
                  events.push({
                    symbol,
                    companyName: quote.price?.shortName || symbol,
                    earningsDate: new Date(earningsDate),
                    earningsCallTime: 'TBD',
                    epsEstimate: quote.calendarEvents.earnings.earningsAverage
                  });
                }
              }

              // From earnings history
              if (quote.earningsHistory?.history) {
                quote.earningsHistory.history.forEach((earning: any) => {
                  if (earning.quarter && earning.epsActual !== undefined) {
                    events.push({
                      symbol,
                      companyName: quote.price?.shortName || symbol,
                      earningsDate: new Date(earning.quarter),
                      earningsCallTime: 'Past',
                      epsEstimate: earning.epsEstimate,
                      reportedEPS: earning.epsActual,
                      surprise: earning.surprisePercent
                        ? earning.epsActual - earning.epsEstimate
                        : undefined,
                      surprisePercent: earning.surprisePercent
                    });
                  }
                });
              }

              return events;
            } else {
              // For now, return empty array for market-wide earnings
              // This would require a different data source or API
              console.error(
                'Market-wide earnings calendar not available with Yahoo Finance'
              );
              return [];
            }
          } catch (error) {
            console.error('Failed to fetch earnings calendar:', error);
            return [];
          }
        });
      },
      3600 // Cache for 1 hour
    );
  }

  /**
   * Get dividend information for a symbol
   */
  async getDividendInfo(symbol: string): Promise<DividendInfo> {
    const cacheKey = `dividend:${symbol}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return await withRetry(async () => {
          try {
            const quote = await yahooFinance.quoteSummary(symbol, {
              modules: ['summaryDetail', 'defaultKeyStatistics']
            }, { validateResult: false }) as any;

            const summary = quote.summaryDetail;
            const keyStats = quote.defaultKeyStatistics;

            return {
              symbol,
              dividendRate: summary?.dividendRate,
              dividendYield: summary?.dividendYield
                ? summary.dividendYield * 100
                : undefined,
              exDividendDate: summary?.exDividendDate
                ? new Date(summary.exDividendDate)
                : undefined,
              payoutRatio: keyStats?.payoutRatio
                ? keyStats.payoutRatio * 100
                : undefined,
              fiveYearAvgDividendYield: keyStats?.fiveYearAvgDividendYield
                ? keyStats.fiveYearAvgDividendYield * 100
                : undefined,
              trailingAnnualDividendRate: summary?.trailingAnnualDividendRate,
              trailingAnnualDividendYield: summary?.trailingAnnualDividendYield
                ? summary.trailingAnnualDividendYield * 100
                : undefined,
              lastDividendValue: summary?.lastDividendValue,
              lastDividendDate: summary?.lastDividendDate
                ? new Date(summary.lastDividendDate)
                : undefined
            };
          } catch (error) {
            throw ErrorHandler.handle(error);
          }
        });
      },
      3600 // Cache for 1 hour
    );
  }

  /**
   * Calculate historical volatility for multiple periods
   */
  async calculateHistoricalVolatility(
    symbol: string,
    periods: number[] = [10, 20, 30, 60, 90]
  ): Promise<HistoricalVolatilityResult> {
    const cacheKey = `hv:${symbol}:${periods.join(',')}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const maxPeriod = Math.max(...periods);
        const historicalData = await this.yahooService.getHistorical({
          symbol,
          period1: `${maxPeriod * 2}d`, // Get extra data for accuracy
          interval: '1d'
        });

        const closePrices = historicalData.map(d => d.close);

        // Calculate returns
        const returns: number[] = [];
        for (let i = 1; i < closePrices.length; i++) {
          returns.push(Math.log(closePrices[i] / closePrices[i - 1]));
        }

        const results = periods.map(period => {
          // Get returns for this period
          const periodReturns = returns.slice(-period);

          if (periodReturns.length < 2) {
            return {
              days: period,
              volatility: 0,
              annualized: 0
            };
          }

          // Calculate standard deviation
          const volatility = std(periodReturns, 'uncorrected') as number;

          // Annualize (252 trading days per year)
          const annualized = volatility * Math.sqrt(252) * 100;

          return {
            days: period,
            volatility,
            annualized
          };
        });

        return {
          symbol,
          periods: results,
          currentPrice: closePrices[closePrices.length - 1],
          calculatedAt: new Date()
        };
      },
      CacheTTL.INDICATOR
    );
  }

  /**
   * Calculate max pain for an options chain
   */
  async calculateMaxPain(
    symbol: string,
    expirationDate?: string
  ): Promise<MaxPainResult> {
    const cacheKey = `maxpain:${symbol}:${expirationDate || 'nearest'}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Get options chain
        const chain = await this.getOptionsChain(symbol, expirationDate);

        // Get unique strike prices
        const strikes = new Set<number>();
        chain.calls.forEach(c => strikes.add(c.strike));
        chain.puts.forEach(p => strikes.add(p.strike));
        const strikeArray = Array.from(strikes).sort((a, b) => a - b);

        // Calculate pain at each strike
        const pricePoints = strikeArray.map(price => {
          let callPain = 0;
          let putPain = 0;

          // Calculate call pain
          chain.calls.forEach(call => {
            if (price > call.strike) {
              callPain += (price - call.strike) * call.openInterest;
            }
          });

          // Calculate put pain
          chain.puts.forEach(put => {
            if (price < put.strike) {
              putPain += (put.strike - price) * put.openInterest;
            }
          });

          return {
            price,
            totalPain: callPain + putPain,
            callPain,
            putPain
          };
        });

        // Find max pain (minimum total pain)
        const maxPainPoint = pricePoints.reduce((min, current) =>
          current.totalPain < min.totalPain ? current : min
        );

        // Calculate total open interest and put/call ratio
        const totalCallOI = chain.calls.reduce(
          (sum, c) => sum + c.openInterest,
          0
        );
        const totalPutOI = chain.puts.reduce((sum, p) => sum + p.openInterest, 0);

        return {
          symbol,
          expirationDate: chain.expirationDate,
          maxPainPrice: maxPainPoint.price,
          currentPrice: chain.underlyingPrice,
          totalOpenInterest: totalCallOI + totalPutOI,
          putCallRatio: totalCallOI > 0 ? totalPutOI / totalCallOI : 0,
          pricePoints: pricePoints.sort((a, b) => a.price - b.price)
        };
      },
      CacheTTL.DEFAULT
    );
  }

  /**
   * Get implied volatility data
   */
  async getImpliedVolatility(symbol: string): Promise<ImpliedVolatilityData> {
    const cacheKey = `iv:${symbol}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Get options chain and historical volatility
        const [chain, hvResult] = await Promise.all([
          this.getOptionsChain(symbol),
          this.calculateHistoricalVolatility(symbol, [30])
        ]);

        const currentPrice = chain.underlyingPrice;

        // Find ATM options
        const atmStrike = this.findATMStrike(chain.calls, currentPrice);
        const atmCall = chain.calls.find(c => c.strike === atmStrike);
        const atmPut = chain.puts.find(p => p.strike === atmStrike);

        // Calculate average IV
        const currentIV = atmCall?.impliedVolatility || atmPut?.impliedVolatility || 0;

        const historicalVol = hvResult.periods[0]?.annualized || 0;

        // Get all expiration dates and their IV
        const expirations = await this.getExpirationDates(symbol);
        const ivByExpiration = await Promise.all(
          expirations.slice(0, 6).map(async exp => {
            try {
              const expChain = await this.getOptionsChain(
                symbol,
                exp.toISOString().split('T')[0]
              );
              const expAtmCall = expChain.calls.find(
                c => c.strike === this.findATMStrike(expChain.calls, currentPrice)
              );

              const daysToExp = Math.ceil(
                (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );

              return {
                expirationDate: exp,
                daysToExpiration: daysToExp,
                iv: (expAtmCall?.impliedVolatility || 0) * 100
              };
            } catch {
              return {
                expirationDate: exp,
                daysToExpiration: 0,
                iv: 0
              };
            }
          })
        );

        return {
          symbol,
          currentIV: currentIV * 100,
          historicalVolatility: historicalVol,
          ivVsHV: currentIV * 100 - historicalVol,
          atmCallIV: atmCall?.impliedVolatility
            ? atmCall.impliedVolatility * 100
            : undefined,
          atmPutIV: atmPut?.impliedVolatility
            ? atmPut.impliedVolatility * 100
            : undefined,
          ivByExpiration: ivByExpiration.filter(item => item.iv > 0)
        };
      },
      CacheTTL.DEFAULT
    );
  }

  /**
   * Find ATM (at-the-money) strike price
   */
  private findATMStrike(contracts: OptionContract[], currentPrice: number): number {
    if (contracts.length === 0) return currentPrice;

    return contracts.reduce((closest, contract) => {
      return Math.abs(contract.strike - currentPrice) <
        Math.abs(closest - currentPrice)
        ? contract.strike
        : closest;
    }, contracts[0].strike);
  }

  /**
   * Transform Yahoo Finance option contract to our format
   */
  private transformOptionContract(contract: any): OptionContract {
    return {
      contractSymbol: contract.contractSymbol,
      strike: contract.strike,
      currency: contract.currency || 'USD',
      lastPrice: contract.lastPrice || 0,
      change: contract.change || 0,
      percentChange: contract.percentChange || 0,
      volume: contract.volume || 0,
      openInterest: contract.openInterest || 0,
      bid: contract.bid || 0,
      ask: contract.ask || 0,
      contractSize: contract.contractSize || 'REGULAR',
      expiration: new Date(contract.expiration),
      lastTradeDate: new Date(contract.lastTradeDate),
      impliedVolatility: contract.impliedVolatility || 0,
      inTheMoney: contract.inTheMoney || false
    };
  }
}

// Export singleton instance
export const optionsService = new OptionsService();
