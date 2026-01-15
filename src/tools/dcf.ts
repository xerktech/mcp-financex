/**
 * DCF Valuation Tool (Discounted Cash Flow)
 */

import { dcfValuationService } from '../services/dcf-valuation.js';
import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Tool definition for DCF valuation
 */
export const calculateDCFValuationTool = {
  name: 'calculate_dcf_valuation',
  description:
    'DCF Valuation | Intrinsic Value | Investment Analysis - ' +
    'Calculate intrinsic value using Discounted Cash Flow (DCF) analysis. ' +
    'Get 5-year cash flow projections, terminal value, and investment recommendations. ' +
    '\n\n**What DCF Analysis Provides:**\n' +
    '- **Intrinsic Value**: Fair value per share based on future cash flows\n' +
    '- **Investment Recommendation**: Strong Buy, Buy, Hold, Sell, Strong Sell\n' +
    '- **Upside/Downside**: Percentage difference vs current market price\n' +
    '- **5-Year Projections**: Revenue and free cash flow forecasts\n' +
    '- **Sensitivity Analysis**: How valuation changes with different assumptions\n' +
    '\n**Key Inputs (customizable):**\n' +
    '- Revenue growth rates (5-year projection)\n' +
    '- Free cash flow margin\n' +
    '- WACC (Weighted Average Cost of Capital)\n' +
    '- Terminal growth rate\n' +
    '- Shares outstanding, debt, cash\n' +
    '\n**Investment Recommendations:**\n' +
    '- **Strong Buy**: >30% upside\n' +
    '- **Buy**: 15-30% upside\n' +
    '- **Hold**: -10% to 15%\n' +
    '- **Sell**: -25% to -10%\n' +
    '- **Strong Sell**: <-25% downside\n' +
    '\n**Sensitivity Analysis:**\n' +
    'Tests valuation sensitivity to:\n' +
    '- WACC changes (+/- 2%)\n' +
    '- Terminal growth rate changes (+/- 1%)\n' +
    '- Free cash flow margin changes (+/- 5%)\n' +
    '\n**Use Cases:**\n' +
    '- "Calculate intrinsic value for Apple"\n' +
    '- "Is Tesla overvalued or undervalued?"\n' +
    '- "DCF analysis for NVDA with sensitivity"\n' +
    '- "What is Microsoft worth based on DCF?"\n' +
    '- "Should I buy this stock?" (based on DCF)\n' +
    '\n**Returns:** Intrinsic value, current price comparison, recommendation, projections, optional sensitivity analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Stock ticker symbol to value (e.g., "AAPL", "TSLA"). Required.'
      },
      customInputs: {
        type: 'object',
        description:
          'Optional custom inputs to override default assumptions. ' +
          'If not provided, defaults are calculated from historical data and market conditions.',
        properties: {
          revenueGrowthRates: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Array of 5 growth rates (as decimals, e.g., [0.15, 0.12, 0.10, 0.08, 0.06] for 15%, 12%, etc.). ' +
              'Represents year-over-year revenue growth for the next 5 years.'
          },
          fcfMargin: {
            type: 'number',
            description:
              'Free cash flow margin as a decimal (e.g., 0.25 for 25%). ' +
              'Percentage of revenue that becomes free cash flow.'
          },
          wacc: {
            type: 'number',
            description:
              'Weighted Average Cost of Capital as a decimal (e.g., 0.10 for 10%). ' +
              'Discount rate used to calculate present value.'
          },
          terminalGrowthRate: {
            type: 'number',
            description:
              'Perpetual growth rate as a decimal (e.g., 0.03 for 3%). ' +
              'Long-term growth rate used for terminal value calculation.'
          },
          sharesOutstanding: {
            type: 'number',
            description: 'Number of shares outstanding (in millions).'
          },
          netDebt: {
            type: 'number',
            description:
              'Net debt (total debt minus cash, in millions). ' +
              'Can be negative if cash exceeds debt.'
          }
        }
      },
      includeSensitivity: {
        type: 'boolean',
        description:
          'When true, includes sensitivity analysis showing how valuation changes with: ' +
          'WACC (+/- 2%), terminal growth rate (+/- 1%), and FCF margin (+/- 5%). ' +
          'Useful for understanding valuation robustness. Default: false.'
      }
    },
    required: ['symbol']
  }
};

/**
 * Handle DCF valuation request
 */
export async function handleCalculateDCFValuation(args: unknown) {
  try {
    const {
      symbol,
      customInputs,
      includeSensitivity = false
    } = args as {
      symbol: string;
      customInputs?: {
        revenueGrowthRates?: number[];
        fcfMargin?: number;
        wacc?: number;
        terminalGrowthRate?: number;
        sharesOutstanding?: number;
        netDebt?: number;
      };
      includeSensitivity?: boolean;
    };

    if (!symbol) {
      throw new Error('Symbol is required. Provide a stock ticker symbol.');
    }

    // Calculate DCF valuation
    const valuation = await dcfValuationService.calculateDCF(symbol, customInputs);

    const result: Record<string, unknown> = {
      symbol: symbol.toUpperCase(),
      valuation: {
        intrinsicValuePerShare: valuation.valuePerShare,
        currentPrice: valuation.currentPrice,
        upside: valuation.upside,
        recommendation: valuation.recommendation
      },
      enterpriseValue: valuation.enterpriseValue,
      equityValue: valuation.equityValue,
      projections: {
        currentRevenue: valuation.inputs.revenue,
        projectedCashFlows: valuation.projectedCashFlows.map(cf => ({
          year: cf.year,
          revenue: cf.revenue,
          freeCashFlow: cf.fcf,
          presentValue: cf.presentValue
        })),
        terminalValue: valuation.terminalValue
      },
      inputs: {
        revenueGrowthRates: valuation.inputs.revenueGrowthRates.map(r => `${(r * 100).toFixed(1)}%`),
        fcfMargin: `${(valuation.inputs.fcfMargin * 100).toFixed(1)}%`,
        wacc: `${(valuation.inputs.wacc * 100).toFixed(1)}%`,
        terminalGrowthRate: `${(valuation.inputs.terminalGrowthRate * 100).toFixed(1)}%`,
        sharesOutstanding: valuation.inputs.sharesOutstanding,
        netDebt: valuation.inputs.netDebt
      },
      analysis: {
        description:
          valuation.upside > 0
            ? `The stock is currently trading at $${valuation.currentPrice.toFixed(2)}, ` +
              `which is ${Math.abs(valuation.upside).toFixed(1)}% below the intrinsic value of $${valuation.valuePerShare.toFixed(2)}. ` +
              `This suggests the stock may be undervalued.`
            : `The stock is currently trading at $${valuation.currentPrice.toFixed(2)}, ` +
              `which is ${Math.abs(valuation.upside).toFixed(1)}% above the intrinsic value of $${valuation.valuePerShare.toFixed(2)}. ` +
              `This suggests the stock may be overvalued.`,
        recommendation: valuation.recommendation,
        confidenceNote:
          'DCF valuation is highly sensitive to input assumptions. ' +
          'Consider running sensitivity analysis to understand the range of possible values.'
      }
    };

    // Add sensitivity analysis if requested
    if (includeSensitivity) {
      const sensitivity = await dcfValuationService.sensitivityAnalysis(symbol, customInputs || {});
      result.sensitivityAnalysis = {
        waccSensitivity: {
          description: 'How valuation changes with different WACC assumptions',
          scenarios: sensitivity.waccSensitivity.map(s => ({
            wacc: `${(s.wacc * 100).toFixed(1)}%`,
            valuePerShare: s.valuePerShare,
            change: s.wacc === valuation.inputs.wacc ? 'Base Case' : undefined
          }))
        },
        terminalGrowthSensitivity: {
          description: 'How valuation changes with different terminal growth rates',
          scenarios: sensitivity.terminalGrowthSensitivity.map(s => ({
            terminalGrowthRate: `${(s.terminalGrowth * 100).toFixed(1)}%`,
            valuePerShare: s.valuePerShare,
            change: s.terminalGrowth === valuation.inputs.terminalGrowthRate ? 'Base Case' : undefined
          }))
        },
        fcfMarginSensitivity: {
          description: 'How valuation changes with different FCF margin assumptions',
          scenarios: sensitivity.fcfMarginSensitivity.map(s => ({
            fcfMargin: `${(s.fcfMargin * 100).toFixed(1)}%`,
            valuePerShare: s.valuePerShare,
            change: s.fcfMargin === valuation.inputs.fcfMargin ? 'Base Case' : undefined
          }))
        },
        insights: {
          valuationRange: {
            min: Math.min(
              ...sensitivity.waccSensitivity.map(s => s.valuePerShare),
              ...sensitivity.terminalGrowthSensitivity.map(s => s.valuePerShare),
              ...sensitivity.fcfMarginSensitivity.map(s => s.valuePerShare)
            ),
            max: Math.max(
              ...sensitivity.waccSensitivity.map(s => s.valuePerShare),
              ...sensitivity.terminalGrowthSensitivity.map(s => s.valuePerShare),
              ...sensitivity.fcfMarginSensitivity.map(s => s.valuePerShare)
            )
          },
          note:
            'The valuation range represents possible outcomes under different assumptions. ' +
            'A wider range indicates higher uncertainty in the valuation.'
        }
      };
    }

    return result;
  } catch (error) {
    throw ErrorHandler.handle(error);
  }
}
