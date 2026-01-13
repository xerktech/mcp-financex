# MCP FinanceX

[![PR Checks](https://github.com/xerktech/mcp-financex/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/xerktech/mcp-financex/actions/workflows/pr-checks.yml)
[![Publish](https://github.com/xerktech/mcp-financex/actions/workflows/publish.yml/badge.svg)](https://github.com/xerktech/mcp-financex/actions/workflows/publish.yml)
[![npm version](https://badge.fury.io/js/mcp-financex.svg)](https://www.npmjs.com/package/mcp-financex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive Model Context Protocol (MCP) server for real-time stock, cryptocurrency, and **options trading** analysis using Yahoo Finance data. Provides tools for price quotes, historical data, technical indicators, market news, options chains, Greeks calculation, and advanced options strategy analysis.

## Features

### Stock & Crypto Analysis
- **Real-time Price Quotes**: Get current prices, changes, volume, and market data for stocks and cryptocurrencies
- **Historical Data**: Retrieve OHLCV (Open, High, Low, Close, Volume) data with multiple time intervals
- **Technical Indicators**: Calculate RSI, MACD, SMA, EMA, Bollinger Bands, and Stochastic oscillators
- **Market News**: Fetch recent news articles for specific symbols or general market news
- **Symbol Search**: Find ticker symbols by company name or keyword
- **Batch Operations**: Fetch multiple quotes efficiently in a single request
- **Market Overview**: Access major market indices and trending stocks
- **Watchlist Management**: Track favorite symbols with notes and alerts

### Options Trading (NEW!)
- **Options Chains**: Complete options data with strikes, premiums, volume, open interest, and IV
- **Greeks Calculator**: Delta, Gamma, Theta, Vega, Rho using Black-Scholes model
- **Earnings Calendar**: Critical dates for volatility planning
- **Dividend Information**: Ex-dividend dates affecting options pricing
- **Historical Volatility**: Compare realized volatility with implied volatility
- **Implied Volatility Analysis**: IV rank, percentile, and term structure
- **Max Pain Calculator**: Find the pin price where most options expire worthless
- **Strategy Analyzer**: Analyze complex spreads, condors, butterflies with P&L charts

### Technical Features
- **Smart Caching**: Intelligent caching with market hours awareness to minimize API calls
- **Black-Scholes Pricing**: Accurate Greeks and theoretical option prices
- **No API Keys Required**: Free Yahoo Finance data (respects rate limits)

## Installation

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone https://github.com/xerktech/mcp-financex.git
cd mcp-financex
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. (Optional) Create a `.env` file for custom configuration:
```bash
cp .env.example .env
```

## Usage

### Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### Configuration with Claude Desktop

Add the server to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Option 1: Use npx (Recommended - No Installation Required)

Once published to npm, users can run it directly without installation:

```json
{
  "mcpServers": {
    "finance": {
      "command": "npx",
      "args": ["-y", "mcp-financex"]
    }
  }
}
```

#### Option 2: Use from GitHub (Before npm publish)

```json
{
  "mcpServers": {
    "finance": {
      "command": "npx",
      "args": ["-y", "github:xerktech/mcp-financex"]
    }
  }
}
```

#### Option 3: Local Installation

```json
{
  "mcpServers": {
    "finance": {
      "command": "node",
      "args": ["/path/to/mcp-financex/dist/index.js"]
    }
  }
}
```

## Available Tools

### 1. get_quote

Get real-time price quote for a stock or cryptocurrency.

**Input:**
```json
{
  "symbol": "AAPL",
  "fields": ["regularMarketPrice", "marketCap"]  // Optional
}
```

**Example:**
```
Get the current price of Apple stock (AAPL)
```

**Output:**
```json
{
  "symbol": "AAPL",
  "regularMarketPrice": 178.50,
  "regularMarketChange": 2.35,
  "regularMarketChangePercent": 1.33,
  "regularMarketVolume": 52438900,
  "marketCap": 2800000000000,
  "currency": "USD",
  "exchangeName": "NASDAQ",
  "quoteType": "EQUITY"
}
```

### 2. get_quote_batch

Get quotes for multiple symbols efficiently.

**Input:**
```json
{
  "symbols": ["AAPL", "MSFT", "BTC-USD", "GOOGL"]
}
```

**Example:**
```
Get current prices for Apple, Microsoft, Bitcoin, and Google
```

### 3. get_historical_data

Retrieve historical OHLCV data.

**Input:**
```json
{
  "symbol": "BTC-USD",
  "period1": "1mo",
  "interval": "1d"
}
```

**Example:**
```
Get the last month of daily price data for Bitcoin
```

**Supported Intervals:**
- `1m`, `5m`, `15m`, `30m` - Intraday (limited history)
- `1h` - Hourly
- `1d` - Daily
- `1wk` - Weekly
- `1mo` - Monthly

### 4. calculate_indicator

Calculate technical indicators on price data.

**Input:**
```json
{
  "symbol": "AAPL",
  "indicator": "rsi",
  "period": 14,
  "interval": "1d"
}
```

**Example:**
```
Calculate the RSI for Apple stock over the last 14 days
```

**Supported Indicators:**

- **RSI** (Relative Strength Index): Momentum oscillator, identifies overbought/oversold conditions
- **MACD** (Moving Average Convergence Divergence): Trend following indicator
- **SMA** (Simple Moving Average): Average price over period
- **EMA** (Exponential Moving Average): Weighted average giving more importance to recent prices
- **Bollinger Bands**: Volatility indicator with upper/lower bands
- **Stochastic**: Momentum indicator comparing closing price to price range

### 5. search_ticker

Search for ticker symbols by company name or keyword.

**Input:**
```json
{
  "query": "Tesla",
  "limit": 10
}
```

**Example:**
```
Search for Tesla's ticker symbol
```

### 6. get_market_news

Retrieve recent news articles.

**Input:**
```json
{
  "symbol": "AAPL",
  "limit": 10
}
```

**Example:**
```
Get the latest news about Apple
Get general market news (omit symbol)
```

## Options Trading Tools

### 7. get_options_chain

Get complete options chain data with all available strikes, calls, and puts.

**Input:**
```json
{
  "symbol": "AAPL",
  "expirationDate": "2024-06-21"  // Optional
}
```

**Example:**
```
Show me the options chain for Apple
Get options for TSLA expiring June 21, 2024
```

**Output:** Calls and puts with strikes, premiums, volume, open interest, implied volatility, bid/ask spreads.

### 8. calculate_greeks

Calculate option Greeks (Delta, Gamma, Theta, Vega, Rho) using Black-Scholes model.

**Input:**
```json
{
  "symbol": "AAPL",
  "strike": 180,
  "expirationDate": "2024-06-21",
  "optionType": "call"
}
```

**Example:**
```
Calculate Greeks for AAPL $180 call expiring June 21
What are the Greeks for a TSLA $250 put?
```

**Greeks Explained:**
- **Delta (0-1 for calls, -1-0 for puts)**: Price sensitivity - how much the option price changes per $1 move in stock
- **Gamma**: Rate of delta change - how quickly delta changes as stock moves
- **Theta**: Time decay - how much value the option loses per day
- **Vega**: Volatility sensitivity - impact of 1% change in implied volatility
- **Rho**: Interest rate sensitivity - impact of 1% change in rates

### 9. get_earnings_calendar

Get upcoming earnings dates and historical earnings data.

**Input:**
```json
{
  "symbol": "AAPL",
  "daysAhead": 30  // Optional
}
```

**Example:**
```
When is Apple's next earnings date?
Show me upcoming earnings for TSLA
```

**Why it matters:** Earnings announcements cause volatility spikes, significantly impacting options prices. Options traders often avoid holding positions through earnings or specifically trade earnings volatility.

### 10. get_dividend_info

Get comprehensive dividend information including ex-dividend dates.

**Input:**
```json
{
  "symbol": "AAPL"
}
```

**Example:**
```
What's Apple's dividend yield and ex-dividend date?
Get dividend information for MSFT
```

**Why it matters:** Ex-dividend dates affect options pricing, especially for calls. Stock price typically drops by the dividend amount on ex-div date.

### 11. calculate_historical_volatility

Calculate historical (realized) volatility for multiple periods.

**Input:**
```json
{
  "symbol": "AAPL",
  "periods": [10, 20, 30, 60, 90]  // Days
}
```

**Example:**
```
Calculate 30-day historical volatility for TSLA
Show me historical volatility trends for AAPL
```

**Why it matters:** Compare historical volatility (HV) with implied volatility (IV) to identify overpriced or underpriced options. High IV relative to HV suggests expensive options (good for selling), while low IV relative to HV suggests cheap options (good for buying).

### 12. calculate_max_pain

Calculate the max pain price where most options expire worthless.

**Input:**
```json
{
  "symbol": "AAPL",
  "expirationDate": "2024-06-21"  // Optional
}
```

**Example:**
```
What's the max pain for AAPL options?
Calculate max pain for next week's SPY expiration
```

**Theory:** Max pain theory suggests prices gravitate toward the strike where option buyers lose the most money (and option writers profit the most) as expiration approaches.

### 13. get_implied_volatility

Get implied volatility data and compare with historical volatility.

**Input:**
```json
{
  "symbol": "AAPL"
}
```

**Example:**
```
What's the current IV for Tesla options?
Show me implied volatility by expiration for AAPL
```

**Analysis provided:**
- Current ATM IV
- IV vs HV comparison
- IV by expiration (term structure)
- High/low IV environment assessment

### 14. analyze_options_strategy

Analyze complex options strategies with P&L calculations, Greeks, and risk metrics.

**Input:**
```json
{
  "symbol": "AAPL",
  "strategy": "iron_condor",
  "legs": [
    {"strike": 170, "optionType": "put", "action": "buy", "quantity": 1},
    {"strike": 175, "optionType": "put", "action": "sell", "quantity": 1},
    {"strike": 185, "optionType": "call", "action": "sell", "quantity": 1},
    {"strike": 190, "optionType": "call", "action": "buy", "quantity": 1}
  ],
  "expirationDate": "2024-06-21"
}
```

**Supported Strategies:**
- Single options: call, put
- Stock + option: covered_call, protective_put
- Vertical spreads: bull_call_spread, bear_put_spread, bull_put_spread, bear_call_spread
- Volatility: long_straddle, short_straddle, long_strangle, short_strangle
- Advanced: iron_condor, iron_butterfly, butterfly_spread, calendar_spread, diagonal_spread

**Example:**
```
Analyze an iron condor on SPY with strikes 170/175/185/190
What's the risk/reward for a bull call spread on AAPL $175/$180?
Show me P&L chart for a covered call on TSLA at $250 strike
```

**Output:**
- Max profit & max loss
- Break-even points
- Net premium/debit
- Combined Greeks for entire position
- P&L chart (profit/loss at various prices)
- Risk/reward ratio

## Available Resources

### watchlist://default

Access your default watchlist of tracked symbols.

**Example:**
```
Show me my watchlist
```

### market://summary

Get real-time summary of major market indices (S&P 500, Dow Jones, NASDAQ, VIX).

**Example:**
```
What's the market doing today?
```

### market://trending

Get trending and most active stocks.

**Example:**
```
What stocks are trending?
```

## Example Use Cases

### Investment Analysis
```
1. Get current price of Tesla (TSLA)
2. Show me the last 6 months of daily data for TSLA
3. Calculate the 50-day moving average for TSLA
4. Calculate RSI for TSLA
5. Get latest news about Tesla
```

### Crypto Tracking
```
1. Get current prices for BTC-USD, ETH-USD, and ADA-USD
2. Show me Bitcoin's price history for the last week with hourly intervals
3. Calculate MACD for Ethereum
4. What's the market summary?
```

### Technical Analysis
```
1. Calculate Bollinger Bands for Apple stock
2. Show me the RSI for MSFT
3. Calculate the 20-day and 50-day moving averages for GOOGL
4. Get stochastic oscillator for SPY
```

### Market Research
```
1. Search for companies in the electric vehicle sector
2. Get quotes for the top results
3. Compare their market caps and P/E ratios
4. Get news for each company
```

### Options Trading - Pre-Earnings Analysis
```
1. When is Apple's next earnings date?
2. Show me the options chain for AAPL
3. What's the current implied volatility for AAPL?
4. Calculate historical volatility for comparison
5. Find options with high IV to potentially sell premium
```

### Options Trading - Strategy Building
```
1. Show me TSLA options expiring next month
2. Calculate Greeks for $250 call
3. Analyze an iron condor strategy on TSLA
4. What's the max profit and max loss?
5. Show me the P&L chart
```

### Options Trading - Risk Management
```
1. Get the Greeks for my AAPL $180 call position
2. What's my delta exposure?
3. How much am I losing to time decay (theta)?
4. Calculate max pain for this expiration
5. Should I hedge with a protective put?
```

### Options Trading - Volatility Analysis
```
1. Compare IV vs HV for SPY
2. Is this a high or low volatility environment?
3. Show me IV by expiration (term structure)
4. Find opportunities where IV is elevated
5. Calculate historical volatility for the past 30 days
```

## Technical Details

### Data Source

All data is sourced from Yahoo Finance via the `yahoo-finance2` library. Yahoo Finance provides:
- Real-time quotes (with 15-minute delay for some markets)
- Historical data going back many years
- Cryptocurrency data (BTC-USD, ETH-USD, etc.)
- No API key required
- Free for personal and educational use

### Caching Strategy

The server implements intelligent caching to minimize API calls and improve performance:

- **Quotes**: 5 seconds (adjusts based on market hours)
- **Historical Data**: 1 hour during market hours, 24 hours after hours
- **News**: 5 minutes
- **Search Results**: 1 hour
- **Technical Indicators**: 5 minutes
- **Market Summary**: 1 minute

Cache TTLs automatically extend during weekends and after market hours to reduce unnecessary API calls.

### Error Handling

The server provides clear, actionable error messages:

- **Invalid Symbol** (404): Symbol not found, check ticker
- **Validation Error** (400): Invalid input parameters
- **Rate Limit** (429): Too many requests, try again later
- **Network Error** (502): Connection issues
- **Timeout** (504): Request took too long

### Technical Indicators Library

Uses the `technicalindicators` library for accurate, battle-tested calculations. Supports:
- RSI with overbought/oversold signals
- MACD with bullish/bearish crossover detection
- Multiple moving average types
- Bollinger Bands with bandwidth and %B calculations
- Stochastic oscillator

## CI/CD & Automation

This project uses GitHub Actions for continuous integration and deployment:

### Automated Workflows

1. **PR Quality Checks** - Runs on every pull request
   - Security scanning (npm audit, Trivy, TruffleHog)
   - Code quality checks (ESLint, formatting)
   - Build verification
   - Tests across multiple Node.js versions (18.x, 20.x, 22.x)
   - Dependency review

2. **Automatic Publishing** - Runs on merge to main
   - Auto version bump
   - npm registry publication with provenance
   - GitHub release creation
   - Package artifact upload

### Setup for Contributors

See [`.github/workflows/README.md`](.github/workflows/README.md) for detailed workflow documentation.

**Required Secrets (for maintainers):**
- `NPM_TOKEN` - For publishing to npm registry (requires 2FA bypass or automation token)

## Development

### Project Structure

```
mcp-financex/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server setup
│   ├── tools/                # MCP tool implementations
│   ├── resources/            # MCP resource implementations
│   ├── services/             # Core services (Yahoo Finance, cache, indicators)
│   ├── types/                # TypeScript type definitions
│   └── utils/                # Utilities (error handling, validation)
├── tests/                    # Test files
├── package.json
├── tsconfig.json
└── README.md
```

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run in development mode with auto-reload
- `npm start` - Run compiled server
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

### Environment Variables

Configuration options (optional, defaults provided):

```bash
# Server Configuration
NODE_ENV=development
LOG_LEVEL=info

# Cache Configuration (in seconds)
CACHE_DEFAULT_TTL=300
CACHE_QUOTE_TTL=5
CACHE_HISTORICAL_TTL=3600
CACHE_NEWS_TTL=300
CACHE_SEARCH_TTL=3600
CACHE_INDICATOR_TTL=300

# Yahoo Finance Configuration
YAHOO_FINANCE_TIMEOUT=10000
YAHOO_FINANCE_RETRY_ATTEMPTS=3
YAHOO_FINANCE_RETRY_DELAY=1000
```

## Limitations

- **Rate Limiting**: Yahoo Finance has rate limits. The server implements caching and retry logic to mitigate this.
- **Real-time Data**: Some quotes may have a 15-minute delay depending on the exchange.
- **Intraday Data**: Intraday intervals (1m, 5m, etc.) have limited historical data (typically 7 days).
- **Crypto Coverage**: Primarily supports major cryptocurrencies paired with USD (BTC-USD, ETH-USD, etc.).
- **No Authentication**: Yahoo Finance data is public and doesn't require authentication, but usage should comply with Yahoo's terms of service.

## Future Enhancements

Planned features for future releases:

- Portfolio tracking and P&L calculations
- Price alerts and notifications
- Backtesting capabilities
- More technical indicators (Ichimoku, Fibonacci, etc.)
- Options data and Greeks calculations
- Comparison tools for multiple stocks
- Export to CSV/JSON
- Redis caching for multi-instance deployments
- WebSocket streaming for real-time updates

## Troubleshooting

### "Symbol not found" Error
Make sure you're using the correct ticker symbol format:
- Stocks: `AAPL`, `MSFT`, `GOOGL`
- Crypto: `BTC-USD`, `ETH-USD` (not `BTC` alone)
- Indices: `^GSPC` (S&P 500), `^DJI` (Dow Jones)

### "Rate limit exceeded" Error
The server is making too many requests to Yahoo Finance. The built-in caching should prevent this, but if it occurs:
- Wait a few minutes before retrying
- Reduce the frequency of requests
- Check cache configuration

### Connection Issues
Ensure you have a stable internet connection. The server will automatically retry failed requests up to 3 times with exponential backoff.

## Publishing to npm

To make this package available for external deployment (so users can run it with `npx` without installation):

### First-time setup:

1. **Create an npm account** (if you don't have one):
   ```bash
   npm adduser
   ```

2. **Update package.json** with your GitHub repository URL:
   ```json
   "repository": {
     "type": "git",
     "url": "git+https://github.com/xerktech/mcp-financex.git"
   }
   ```

3. **Build and publish**:
   ```bash
   npm run build
   npm publish
   ```

### For updates:

1. **Update version** in package.json:
   ```bash
   npm version patch  # 1.0.0 -> 1.0.1
   npm version minor  # 1.0.0 -> 1.1.0
   npm version major  # 1.0.0 -> 2.0.0
   ```

2. **Publish**:
   ```bash
   npm publish
   ```

Once published, users can use it in their Claude Desktop config:
```json
{
  "mcpServers": {
    "finance": {
      "command": "npx",
      "args": ["-y", "mcp-financex"]
    }
  }
}
```

This is similar to how the Alpha Vantage MCP works with `uvx` - users don't need to install anything locally!

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:
- Code follows the existing style (use `npm run format`)
- Tests pass (`npm test`)
- New features include tests
- Documentation is updated

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) for Yahoo Finance API access
- [technicalindicators](https://github.com/anandanand84/technicalindicators) for technical analysis calculations

## Disclaimer

This software is provided for educational and informational purposes only. It is not intended as financial advice. Always do your own research and consult with a qualified financial advisor before making investment decisions. The authors are not responsible for any financial losses incurred through the use of this software.

Yahoo Finance data is subject to Yahoo's terms of service. This project is not affiliated with or endorsed by Yahoo.
