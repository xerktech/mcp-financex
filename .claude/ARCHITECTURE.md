# MCP FinanceX Architecture

This document describes the system architecture, design decisions, and data flow for the MCP FinanceX project.

## System Overview

```
┌─────────────────┐
│  Claude Desktop │
│   (MCP Client)  │
└────────┬────────┘
         │ MCP Protocol (stdio)
         │
┌────────▼────────────────────────────────────────────┐
│           MCP FinanceX Server (Node.js)              │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │         MCP Server (server.ts)               │  │
│  │  - Tool Registration                         │  │
│  │  - Resource Registration                     │  │
│  │  - Request Routing                           │  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                   │
│  ┌──────────────▼───────────────────────────────┐  │
│  │         Tools Layer (tools/*.ts)             │  │
│  │  - Input Validation (Zod schemas)            │  │
│  │  - Parameter parsing                         │  │
│  │  - Response formatting                       │  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                   │
│  ┌──────────────▼───────────────────────────────┐  │
│  │      Services Layer (services/*.ts)          │  │
│  │  - Business Logic                            │  │
│  │  - Data Transformation                       │  │
│  │  - Caching Strategy                          │  │
│  │  - Error Handling                            │  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                   │
│  ┌──────────────▼───────────────────────────────┐  │
│  │      Cache Service (cache.ts)                │  │
│  │  - In-Memory Cache (node-cache)              │  │
│  │  - Market Hours Awareness                    │  │
│  │  - Smart TTL Management                      │  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                   │
└─────────────────┼───────────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
┌────────▼──────┐  ┌───────▼──────────┐
│ Yahoo Finance │  │  SEC EDGAR       │
│   API (free)  │  │  (public data)   │
└───────────────┘  └──────────────────┘
```

## Architectural Layers

### 1. MCP Protocol Layer (`src/server.ts`)

**Responsibility**: Handle MCP protocol communication

**Key Components:**
- `Server` instance from `@modelcontextprotocol/sdk`
- Tool registration with schemas
- Resource registration (watchlist, market summary)
- stdio transport for Claude Desktop communication

**Design Decision**: Uses stdio transport (not HTTP/SSE) because Claude Desktop expects stdio-based MCP servers.

### 2. Tools Layer (`src/tools/*.ts`)

**Responsibility**: Define MCP tool interfaces and validation

**Key Components:**
- Tool definitions with Zod schemas
- Input parameter validation
- Output formatting for MCP responses
- Tool handlers that delegate to services

**Design Decision**: Tools are thin wrappers around services. All business logic lives in the service layer for easier testing and reusability.

**Tool Categories:**
- Quote tools: `get_quote`, `get_quote_batch`
- Historical: `get_historical_data`
- Technical: `calculate_indicator`
- News: `get_market_news`
- Search: `search_ticker`
- Insider: `get_sec_form4_filings`, `get_insider_trades`
- Options: `get_options_chain`, `calculate_greeks`, `calculate_max_pain`, etc.
- Dividends: `get_dividend_info`
- Earnings: `get_earnings_calendar`

### 3. Services Layer (`src/services/*.ts`)

**Responsibility**: Core business logic and data operations

**Services:**

**`yahoo-finance.ts`** (765 lines) - Primary data source
- Wraps `yahoo-finance2` library
- Rate limiting with `p-throttle`
- Retry logic with exponential backoff
- Error normalization
- Supports: quotes, historical, search, news, options, earnings

**`sec-edgar.ts`** (482 lines) - SEC EDGAR data
- Fetches and parses SEC Form 4 (insider trades)
- XML parsing with `fast-xml-parser`
- Extracts: insider names, positions, transaction details, filing dates
- Returns direct SEC links for verification

**`cache.ts`** (261 lines) - Caching strategy
- In-memory cache using `node-cache`
- Market-hours-aware TTL adjustments
- Weekend/after-hours extended caching
- Configurable via environment variables

**`indicators.ts`** (458 lines) - Technical analysis
- Wraps `technicalindicators` library
- RSI, MACD, SMA, EMA, Bollinger Bands, Stochastic
- Signal generation (overbought/oversold, crossovers)

**`options.ts`** (491 lines) - Options data processing
- Options chain fetching from Yahoo Finance
- Strike filtering and sorting
- Implied volatility extraction
- Historical volatility calculation

**`greeks.ts`** (241 lines) - Options Greeks
- Black-Scholes model implementation
- Delta, Gamma, Theta, Vega, Rho calculation
- Risk-free rate and dividend yield handling

**`strategy.ts`** (327 lines) - Options strategies
- Multi-leg strategy analysis
- P&L calculation across price ranges
- Break-even point calculation
- Combined Greeks for positions
- Supports: spreads, straddles, strangles, condors, butterflies

**Design Decision**: Services are stateless and pure functions where possible. All state (cache) is centralized in `cache.ts`.

### 4. Utilities Layer (`src/utils/*.ts`)

**Responsibility**: Cross-cutting concerns

**`error-handler.ts`**
- Centralizes error handling
- Maps errors to user-friendly messages
- Adds context (symbol, operation) to errors
- HTTP status code mapping

**`validators.ts`**
- Input validation helpers
- Symbol format validation
- Date validation
- Parameter range checks

**Design Decision**: Centralized error handling ensures consistent error messages across all tools.

### 5. Types Layer (`src/types/*.ts`)

**Responsibility**: TypeScript type definitions

**`market-data.ts`**
- Core types: `Quote`, `HistoricalData`, `NewsItem`, `SearchResult`
- Enums for intervals, periods, quote types

**`options.ts`**
- Options-specific types: `OptionsChain`, `OptionContract`, `GreeksResult`
- Strategy types and enums

**`black-scholes.d.ts`**
- Type declarations for `black-scholes` library

**Design Decision**: All types are explicitly defined. No implicit `any` types allowed (strict TypeScript).

## Data Flow

### Example: `get_quote` Tool

```
1. Claude Desktop sends MCP request
   └─> {"method": "tools/call", "params": {"name": "get_quote", "arguments": {"symbol": "AAPL"}}}

2. MCP Server routes to tool handler (tools/index.ts)
   └─> Validates input with Zod schema
   └─> Extracts symbol: "AAPL"

3. Tool handler calls service (services/yahoo-finance.ts)
   └─> Check cache for key "quote:AAPL"

4a. Cache HIT
   └─> Return cached data immediately

4b. Cache MISS
   └─> Fetch from Yahoo Finance API
   └─> Apply rate limiting (p-throttle)
   └─> Retry on failure (3 attempts)
   └─> Store in cache (TTL: 5 seconds)
   └─> Return fresh data

5. Service returns data to tool handler
   └─> Format as MCP response
   └─> Add metadata (timestamp, cache status)

6. MCP Server sends response to Claude Desktop
   └─> {"content": [{"type": "text", "text": "...formatted quote..."}]}
```

### Caching Strategy Details

**Cache Keys**: `{operation}:{symbol}:{params}`
- Example: `quote:AAPL`, `historical:BTC-USD:1mo:1d`, `indicator:TSLA:rsi:14`

**TTL by Operation**:
- Quotes: 5 seconds (most volatile)
- Historical: 1 hour (daily data changes once per day)
- News: 5 minutes
- Search: 1 hour (tickers rarely change)
- Indicators: 5 minutes

**Market Hours Awareness**:
- During market hours (9:30 AM - 4:00 PM ET): Use configured TTLs
- After hours / weekends: Extend TTLs by 5x
- Check: If current time is outside market hours, multiply TTL

**Design Decision**: Aggressive caching reduces Yahoo Finance API load and improves response times. Market hours awareness prevents unnecessary API calls when data isn't changing.

## Error Handling Strategy

### Error Types

1. **Validation Errors** (400)
   - Invalid symbol format
   - Missing required parameters
   - Out-of-range values

2. **Not Found Errors** (404)
   - Symbol doesn't exist
   - No data available for period

3. **Rate Limit Errors** (429)
   - Too many requests to Yahoo Finance
   - Exceeded API quota

4. **Network Errors** (502)
   - Yahoo Finance API unreachable
   - Connection timeout

5. **Timeout Errors** (504)
   - Request took too long
   - Default timeout: 10 seconds

### Error Flow

```
Service Layer
  └─> try { yahooFinance.quote() }
  └─> catch (error)
      └─> handleError(error, context)
          └─> Normalize error type
          └─> Add context (symbol, operation)
          └─> Map to user-friendly message
          └─> Throw McpError with proper code

MCP Server
  └─> Catches McpError
  └─> Returns error response to Claude
  └─> {"error": {"code": -32000, "message": "..."}}
```

**Design Decision**: All errors go through `handleError()` to ensure consistency. User-facing error messages are actionable (e.g., "Symbol 'AAPL123' not found. Check the ticker symbol.").

## Performance Optimizations

### 1. Batch Operations
- `get_quote_batch`: Fetch multiple quotes in one request
- Reduces network overhead
- Shared cache for individual symbols

### 2. Caching
- In-memory cache (node-cache)
- No external dependencies (Redis not required)
- Suitable for single-instance deployment

### 3. Rate Limiting
- `p-throttle`: Max 100 requests per 60 seconds to Yahoo Finance
- Prevents API bans
- Queues excess requests

### 4. Lazy Loading
- Services loaded on-demand
- No upfront initialization cost

### 5. Streaming (Future)
- Currently: Request-response
- Future: WebSocket streaming for real-time quotes

## Security Considerations

### 1. No Secrets Required
- Yahoo Finance: No API key needed (public data)
- SEC EDGAR: Public data, no authentication

### 2. Input Validation
- All inputs validated with Zod schemas
- Prevents injection attacks
- Type-safe throughout

### 3. Rate Limiting
- Respects Yahoo Finance rate limits
- Prevents abuse
- Protects against DoS (self-inflicted)

### 4. Error Messages
- No stack traces exposed to users
- No internal paths revealed
- Actionable messages only

### 5. Dependencies
- Regular security audits (npm audit)
- Trivy scanning in CI/CD
- TruffleHog for secret scanning

## Scalability Considerations

### Current Limitations (Single Instance)
- In-memory cache (not shared across instances)
- stdio transport (one client at a time)
- No horizontal scaling

### Future Scaling Options
1. **Redis Cache**: Share cache across multiple instances
2. **HTTP Transport**: Support multiple concurrent clients
3. **Load Balancer**: Distribute requests across instances
4. **Database**: Persist historical data locally
5. **Message Queue**: Background jobs for heavy computations

**Design Decision**: Current architecture optimized for single-user desktop use (Claude Desktop). Future versions may support server deployment.

## Technology Choices

### Why Yahoo Finance?
- **Free**: No API key required
- **Comprehensive**: Stocks, crypto, options, news
- **Reliable**: Battle-tested library (`yahoo-finance2`)
- **Real-time**: Good enough for most use cases (15-min delay acceptable)

### Why TypeScript?
- **Type Safety**: Catch errors at compile time
- **Maintainability**: Better refactoring support
- **Documentation**: Types serve as inline docs
- **MCP SDK**: Official SDK is TypeScript

### Why Node.js?
- **MCP SDK**: Official support for Node.js
- **npm Ecosystem**: Rich library availability
- **Claude Desktop**: Expects Node.js-based MCP servers
- **Performance**: Good enough for I/O-bound tasks

### Why stdio Transport?
- **Claude Desktop**: Expected transport method
- **Simplicity**: No HTTP server needed
- **Security**: No network exposure

### Why Vitest?
- **Fast**: Faster than Jest
- **ESM Support**: Native ES modules
- **Watch Mode**: Great developer experience
- **Coverage**: Built-in coverage with v8

## Testing Strategy

### Unit Tests (`tests/services/`)
- Test services in isolation
- Mock external dependencies (Yahoo Finance, SEC)
- Fast execution (<1 second)

### Integration Tests (`tests/tools/`)
- Test tools end-to-end
- May use real APIs (with caching)
- Slower execution (few seconds)

### Test Structure
```
tests/
├── services/
│   ├── yahoo-finance.test.ts
│   ├── sec-edgar.test.ts
│   ├── cache.test.ts
│   └── indicators.test.ts
├── tools/
│   ├── quote.test.ts
│   ├── historical.test.ts
│   └── insider.test.ts
└── integration/
    └── server.test.ts
```

**Design Decision**: Services are heavily tested. Tools have lighter tests (mostly validation). Integration tests ensure MCP protocol compliance.

## Build & Deployment

### Build Process
1. TypeScript compilation (`tsc`)
2. Output to `dist/` directory
3. Type declarations (`.d.ts`) generated
4. Source maps for debugging

### Deployment Methods
1. **npx** (recommended): `npx -y mcp-financex`
2. **GitHub**: `npx -y github:xerktech/mcp-financex`
3. **Local**: `node /path/to/dist/index.js`

### CI/CD Pipeline
1. **PR Checks** (`.github/workflows/pr-checks.yml`)
   - Security: npm audit, Trivy, TruffleHog
   - Quality: ESLint, Prettier
   - Tests: Vitest on Node 18/20/22
   - Build: TypeScript compilation

2. **Auto Publish** (`.github/workflows/publish.yml`)
   - Trigger: Merge to main
   - Bump version (patch)
   - npm publish with provenance
   - GitHub release creation

**Design Decision**: Automated CI/CD reduces human error. Version bumps are automatic (semantic versioning).

## Future Architecture Considerations

### 1. Plugin System
- Allow third-party data sources
- Extensible tool registry
- Dynamic tool loading

### 2. Multi-Transport Support
- stdio (current)
- HTTP (future)
- SSE (real-time updates)

### 3. Database Layer
- Persist historical data
- Reduce API calls
- Enable backtesting

### 4. Microservices
- Split services into separate processes
- Independent scaling
- Polyglot architecture

### 5. Real-time Streaming
- WebSocket connections to data providers
- Push-based updates
- Lower latency

**Design Decision**: Keep it simple for now. Add complexity only when needed (YAGNI principle).

## Code Conventions

### File Naming
- `kebab-case.ts` for files
- `PascalCase` for classes and types
- `camelCase` for functions and variables

### Module Structure
```typescript
// Imports (external first, then internal)
import { z } from 'zod';
import { handleError } from '../utils/error-handler.js';

// Types and interfaces
export interface Result { ... }

// Constants
const DEFAULT_TIMEOUT = 10000;

// Main logic
export async function fetchData() { ... }

// Helpers (if needed)
function helper() { ... }
```

### Error Handling
```typescript
try {
  const result = await externalCall();
  return result;
} catch (error) {
  throw handleError(error, { context: 'info' });
}
```

### Async/Await
- Always use async/await (no callbacks)
- No `.then()` chains
- Proper error handling in async functions

**Design Decision**: Consistent code style improves readability and maintainability. ESLint and Prettier enforce conventions.

## Conclusion

MCP FinanceX follows a layered architecture with clear separation of concerns. The design prioritizes:
1. **Simplicity**: Easy to understand and modify
2. **Type Safety**: Strict TypeScript throughout
3. **Performance**: Smart caching and rate limiting
4. **Reliability**: Comprehensive error handling
5. **Testability**: Services are easily testable
6. **Maintainability**: Clear patterns and conventions

For more details, see:
- `.claude/CLAUDE_GUIDE.md` - Quick reference for working with the codebase
- `.claude/COMMON_TASKS.md` - Step-by-step development workflows
- `README.md` - User-facing documentation
