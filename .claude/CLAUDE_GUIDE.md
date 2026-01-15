# Claude Code Guide for MCP FinanceX

This guide helps Claude Code work effectively with the MCP FinanceX codebase.

## Project Overview

**MCP FinanceX** is a Model Context Protocol (MCP) server that provides real-time financial market data analysis tools for Claude Desktop. It integrates Yahoo Finance data to offer stock quotes, technical indicators, options analysis, and more - all without requiring API keys.

**Tech Stack:**
- TypeScript with strict mode
- Node.js (v18+) with ESM modules
- MCP SDK (`@modelcontextprotocol/sdk`)
- Yahoo Finance 2 library
- Vitest for testing
- ESLint + Prettier for code quality

**Current Version:** 1.0.7 (actively maintained, published to npm)

## Key Directories

```
src/
├── index.ts              # CLI entry point & MCP server bootstrap
├── server.ts             # MCP server setup, tool & resource registration
├── tools/                # 16 MCP tools (get_quote, get_historical_data, etc.)
│   └── index.ts         # Tool registry & request handlers
├── services/             # Core business logic
│   ├── yahoo-finance.ts # Yahoo Finance API wrapper (765 lines)
│   ├── sec-edgar.ts     # SEC EDGAR Form 4 parser (482 lines)
│   ├── options.ts       # Options chain analysis (491 lines)
│   ├── indicators.ts    # Technical indicators (458 lines)
│   ├── strategy.ts      # Options strategy analysis (327 lines)
│   ├── greeks.ts        # Black-Scholes Greeks calculation (241 lines)
│   └── cache.ts         # Smart caching with market hours awareness (261 lines)
├── types/                # TypeScript type definitions
│   ├── market-data.ts   # Core market data types
│   ├── options.ts       # Options-specific types
│   └── black-scholes.d.ts
├── resources/            # MCP resources (watchlist, market summary)
└── utils/                # Error handling, validation, etc.
    ├── error-handler.ts
    └── validators.ts
```

## Architecture Principles

1. **MCP-First Design**: All functionality exposed as MCP tools & resources
2. **Service Layer Pattern**: Business logic in services/, tools are thin wrappers
3. **Type Safety**: Strict TypeScript, Zod validation for all inputs
4. **Smart Caching**: Market-hours-aware caching to minimize API calls
5. **Error Handling**: Centralized error handler with user-friendly messages
6. **Rate Limiting**: p-throttle for Yahoo Finance API respect

## Common Patterns

### Adding a New Tool

1. Define the tool schema in `src/tools/index.ts`:
   ```typescript
   server.tool("get_example", "Description", {
     parameter: z.string().describe("Description")
   }, async ({ parameter }) => {
     // Implementation
   });
   ```

2. Create service logic in `src/services/`:
   ```typescript
   export async function getExample(param: string): Promise<ExampleResult> {
     // Business logic with caching, error handling
   }
   ```

3. Add types to `src/types/`:
   ```typescript
   export interface ExampleResult {
     // Type definitions
   }
   ```

4. Write tests in `tests/tools/` and `tests/services/`

### Error Handling Pattern

Always use the centralized error handler:

```typescript
import { handleError } from '../utils/error-handler.js';

try {
  const result = await yahooFinance.quote(symbol);
  return result;
} catch (error) {
  throw handleError(error, { symbol, operation: 'quote' });
}
```

### Caching Pattern

Use the cache service for all external API calls:

```typescript
import cache from '../services/cache.js';

const cacheKey = `quote:${symbol}`;
const cached = cache.get<QuoteResult>(cacheKey);
if (cached) return cached;

const result = await fetchFromAPI(symbol);
cache.set(cacheKey, result);
return result;
```

## Testing Guidelines

- **Unit tests**: Test services in isolation with mocked dependencies
- **Integration tests**: Test tools end-to-end
- **Run tests**: `npm test` or `npm run test:watch`
- **Coverage**: Aim for >80% coverage (`npm run test:coverage`)

Test file naming: `{module-name}.test.ts`

## Build & Development

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Run with tsx (auto-reload)
npm start          # Run compiled version
npm test           # Run test suite
npm run lint       # Check code style
npm run format     # Format with Prettier
```

## Current Focus Areas

Based on recent commits:
- **SEC Form 4 discoverability**: Making insider trading tools more prominent
- **Branch**: `enhance/sec-form4-discoverability` (current)
- **Main branch**: `main` (for PRs)

## Important Constraints

1. **No API Keys**: All functionality must work without requiring user API keys
2. **Rate Limits**: Respect Yahoo Finance rate limits (100 req/min default)
3. **MCP Compliance**: Follow Model Context Protocol specifications
4. **TypeScript Strict**: No `any` types, all inputs validated with Zod
5. **Error Messages**: User-friendly, actionable error messages
6. **Caching**: Always cache external API calls appropriately

## File Locations to Know

- **Tool definitions**: `src/tools/index.ts` (tool registry)
- **Service implementations**: `src/services/` (business logic)
- **Type definitions**: `src/types/` (TypeScript interfaces)
- **Error handling**: `src/utils/error-handler.ts`
- **Validation**: `src/utils/validators.ts`
- **Cache logic**: `src/services/cache.ts`
- **Tests**: `tests/` (mirrors src/ structure)

## Development Workflow

1. **Make changes** to code
2. **Run tests** to ensure nothing broke
3. **Run linting** to check style
4. **Build** to verify compilation
5. **Test locally** with Claude Desktop
6. **Commit** with conventional commit messages
7. **Push** and create PR (CI/CD runs automatically)

## CI/CD

- **PR Checks**: Security scan, lint, test, build on Node 18/20/22
- **Auto Publish**: On merge to main, auto-bumps version and publishes to npm

## Need More Context?

- **Architecture**: See `.claude/ARCHITECTURE.md` (design decisions, data flow)
- **Common Tasks**: See `.claude/COMMON_TASKS.md` (step-by-step workflows)
- **Features**: See `FEATURES_SUMMARY.md` (all 93+ planned features)
- **Roadmap**: See `ROADMAP.md` (implementation phases)
- **README**: See `README.md` (user-facing documentation)

## Quick Reference

**Key Files to Read First:**
1. `src/server.ts` - Understand MCP server setup
2. `src/tools/index.ts` - See all available tools
3. `src/services/yahoo-finance.ts` - Core data fetching logic
4. `src/types/market-data.ts` - Data structures

**Most Active Code Areas:**
- SEC Form 4 insider trading (`src/tools/insider.ts`, `src/services/sec-edgar.ts`)
- Options analysis (`src/services/options.ts`, `src/services/greeks.ts`)
- Technical indicators (`src/services/indicators.ts`)

## Tips for Claude Code

1. **Always read before editing**: Use Read tool on files before making changes
2. **Use services/, not tools/**: Business logic goes in services, tools are thin wrappers
3. **Add tests**: Every new feature needs tests in tests/
4. **Check types**: Run `npm run build` to catch TypeScript errors
5. **Cache aggressively**: External API calls are expensive, cache everything
6. **User-friendly errors**: Use handleError() for all error cases
7. **Follow existing patterns**: Look at similar tools/services for consistency
