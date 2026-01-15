# Common Development Tasks

Step-by-step workflows for common development tasks in MCP FinanceX. These are optimized for Claude Code to follow when working on this project.

## Table of Contents
1. [Adding a New MCP Tool](#adding-a-new-mcp-tool)
2. [Adding a Technical Indicator](#adding-a-technical-indicator)
3. [Fixing a Bug](#fixing-a-bug)
4. [Running Tests](#running-tests)
5. [Building and Testing Locally](#building-and-testing-locally)
6. [Creating a Pull Request](#creating-a-pull-request)
7. [Publishing to npm](#publishing-to-npm)
8. [Adding a New Service](#adding-a-new-service)
9. [Updating Dependencies](#updating-dependencies)
10. [Debugging Issues](#debugging-issues)

---

## Adding a New MCP Tool

**When**: You need to expose new functionality to Claude Desktop users

**Steps**:

1. **Define types** in `src/types/`:
   ```typescript
   // src/types/market-data.ts (or create new file)
   export interface NewFeatureResult {
     field1: string;
     field2: number;
     // ... other fields
   }
   ```

2. **Create service logic** in `src/services/`:
   ```typescript
   // src/services/new-feature.ts
   import cache from './cache.js';
   import { handleError } from '../utils/error-handler.js';
   import type { NewFeatureResult } from '../types/market-data.js';

   export async function getNewFeature(param: string): Promise<NewFeatureResult> {
     const cacheKey = `new-feature:${param}`;

     // Check cache
     const cached = cache.get<NewFeatureResult>(cacheKey);
     if (cached) return cached;

     try {
       // Fetch from external API
       const result = await externalAPI.fetch(param);

       // Cache result (adjust TTL as needed)
       cache.set(cacheKey, result, 300); // 5 minutes

       return result;
     } catch (error) {
       throw handleError(error, { param, operation: 'get_new_feature' });
     }
   }
   ```

3. **Register tool** in `src/tools/index.ts`:
   ```typescript
   import { z } from 'zod';
   import { getNewFeature } from '../services/new-feature.js';

   server.tool(
     "get_new_feature",
     "Clear description of what this tool does",
     {
       param: z.string().describe("Description of parameter")
     },
     async ({ param }) => {
       const result = await getNewFeature(param);
       return {
         content: [{
           type: "text",
           text: JSON.stringify(result, null, 2)
         }]
       };
     }
   );
   ```

4. **Add tests**:
   ```bash
   # Create tests/services/new-feature.test.ts
   # Create tests/tools/new-feature.test.ts
   ```

5. **Update documentation**:
   - Add tool description to `README.md`
   - Add to `FEATURES_SUMMARY.md` if it's a new category
   - Update `ROADMAP.md` to mark as implemented

6. **Test locally**:
   ```bash
   npm run build
   npm test
   npm run lint
   ```

7. **Test with Claude Desktop**:
   - Update `claude_desktop_config.json` to point to local build
   - Restart Claude Desktop
   - Test the new tool with queries

---

## Adding a Technical Indicator

**When**: You want to add a new technical analysis indicator (e.g., ATR, ADX)

**Steps**:

1. **Check if `technicalindicators` library supports it**:
   - Visit: https://github.com/anandanand84/technicalindicators
   - If supported, proceed. If not, consider manual implementation.

2. **Add type definitions** in `src/types/market-data.ts`:
   ```typescript
   export interface ATRResult {
     indicator: 'atr';
     symbol: string;
     period: number;
     values: number[];
     current: number;
     signal?: string;
   }
   ```

3. **Implement in service** (`src/services/indicators.ts`):
   ```typescript
   import { ATR } from 'technicalindicators';

   case 'atr':
     const atrInput = {
       high: data.map(d => d.high),
       low: data.map(d => d.low),
       close: data.map(d => d.close),
       period: options.period || 14
     };
     const atrValues = ATR.calculate(atrInput);
     return {
       indicator: 'atr',
       symbol,
       period: options.period || 14,
       values: atrValues,
       current: atrValues[atrValues.length - 1]
     };
   ```

4. **Update tool schema** in `src/tools/index.ts`:
   ```typescript
   indicator: z.enum(['rsi', 'macd', 'sma', 'ema', 'bbands', 'stoch', 'atr'])
     .describe("Technical indicator to calculate")
   ```

5. **Add documentation** to `README.md`:
   - Add to "Supported Indicators" section
   - Explain what it measures
   - Provide example usage

6. **Write tests** in `tests/services/indicators.test.ts`:
   ```typescript
   it('should calculate ATR', async () => {
     const result = await calculateIndicator('AAPL', 'atr', { period: 14 });
     expect(result.indicator).toBe('atr');
     expect(result.values).toBeInstanceOf(Array);
   });
   ```

---

## Fixing a Bug

**When**: You discover a bug or receive a bug report

**Steps**:

1. **Reproduce the bug**:
   - Write a failing test that reproduces the issue
   - Document exact steps to trigger the bug

2. **Identify root cause**:
   - Check error logs
   - Add console.log or debugger statements
   - Review relevant code in services/

3. **Fix the bug**:
   - Make minimal changes to fix the issue
   - Ensure fix doesn't break existing functionality

4. **Verify fix**:
   ```bash
   npm test              # Run all tests
   npm run build         # Ensure it compiles
   npm run lint          # Check code style
   ```

5. **Update tests**:
   - Ensure your reproduction test now passes
   - Add edge case tests if needed

6. **Document the fix**:
   - Add comments explaining the fix if it's non-obvious
   - Update CHANGELOG.md (if you maintain one)

7. **Create PR**:
   ```bash
   git checkout -b fix/descriptive-bug-name
   git add .
   git commit -m "fix: descriptive bug description"
   git push origin fix/descriptive-bug-name
   gh pr create --title "Fix: Descriptive bug description"
   ```

---

## Running Tests

**When**: Before committing code, after making changes

**All tests**:
```bash
npm test
```

**Watch mode** (runs tests on file changes):
```bash
npm run test:watch
```

**Coverage report**:
```bash
npm run test:coverage
# Opens HTML report in coverage/index.html
```

**Specific test file**:
```bash
npx vitest run tests/services/yahoo-finance.test.ts
```

**Test with debugging**:
```bash
node --inspect-brk node_modules/.bin/vitest run tests/services/cache.test.ts
```

**Expected outcomes**:
- All tests should pass
- Coverage should be >80% (ideally)
- No console errors or warnings

---

## Building and Testing Locally

**When**: You want to test changes with Claude Desktop before pushing

**Steps**:

1. **Build the project**:
   ```bash
   npm run build
   ```
   - Compiles TypeScript to `dist/`
   - Generates `.d.ts` type definitions
   - Creates source maps

2. **Test the CLI directly**:
   ```bash
   node dist/index.js
   ```
   - Should start MCP server on stdio
   - Wait for connection from MCP client
   - Press Ctrl+C to stop

3. **Update Claude Desktop config**:

   **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "finance-dev": {
         "command": "node",
         "args": ["C:/full/path/to/mcp-financex/dist/index.js"]
       }
     }
   }
   ```

4. **Restart Claude Desktop**:
   - Completely quit Claude Desktop
   - Relaunch
   - Check MCP server is connected (look for tools in slash commands)

5. **Test your changes**:
   - Try queries that use your new/modified tool
   - Check error handling
   - Verify caching works

6. **Check logs** (if issues occur):
   - Look for errors in Claude Desktop logs
   - Add console.error() in your code for debugging
   - Check `dist/` files to ensure changes are compiled

---

## Creating a Pull Request

**When**: You've completed a feature or fix and want to merge to main

**Steps**:

1. **Ensure you're on a feature branch**:
   ```bash
   git status
   # If on main, create a branch:
   git checkout -b feature/my-feature
   ```

2. **Run pre-PR checks**:
   ```bash
   npm run lint          # Fix any linting errors
   npm run format        # Auto-format code
   npm test              # Ensure all tests pass
   npm run build         # Verify build succeeds
   ```

3. **Commit your changes** (if not already committed):
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

   **Commit message format**:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation only
   - `chore:` - Build/tooling changes
   - `refactor:` - Code refactoring
   - `test:` - Test updates

4. **Push to GitHub**:
   ```bash
   git push origin feature/my-feature
   ```

5. **Create PR**:
   ```bash
   gh pr create \
     --title "Feat: Add new feature description" \
     --body "## Summary
   - Added feature X
   - Fixed bug Y
   - Updated tests

   ## Test Plan
   - Tested locally with Claude Desktop
   - All tests pass
   - Verified caching works

   ## Screenshots (if applicable)
   "
   ```

6. **Wait for CI/CD checks**:
   - GitHub Actions will run:
     - Security scans (npm audit, Trivy, TruffleHog)
     - Linting and formatting checks
     - Tests on Node 18, 20, 22
     - Build verification
   - Fix any failures

7. **Merge** (after approval and checks pass):
   ```bash
   gh pr merge --squash
   ```

---

## Publishing to npm

**When**: Ready to release a new version (usually automated via CI/CD)

**Manual publish** (if needed):

1. **Ensure you're on main and up-to-date**:
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Run full checks**:
   ```bash
   npm run lint
   npm test
   npm run build
   ```

3. **Bump version**:
   ```bash
   npm version patch    # 1.0.7 -> 1.0.8
   # or
   npm version minor    # 1.0.7 -> 1.1.0
   # or
   npm version major    # 1.0.7 -> 2.0.0
   ```

4. **Publish to npm**:
   ```bash
   npm publish
   ```

5. **Push tags**:
   ```bash
   git push origin main --tags
   ```

6. **Create GitHub release**:
   ```bash
   gh release create v1.0.8 \
     --title "Release 1.0.8" \
     --notes "## Changes
   - Feature X
   - Bug fix Y
   "
   ```

**Automated publish** (recommended):
- Merge PR to main
- CI/CD automatically:
  - Bumps version (patch)
  - Publishes to npm
  - Creates GitHub release

---

## Adding a New Service

**When**: You need to integrate a new data source or add complex business logic

**Steps**:

1. **Create service file** in `src/services/`:
   ```typescript
   // src/services/new-service.ts
   import cache from './cache.js';
   import { handleError } from '../utils/error-handler.js';

   export class NewService {
     private baseUrl = 'https://api.example.com';

     async fetchData(param: string): Promise<any> {
       const cacheKey = `new-service:${param}`;
       const cached = cache.get(cacheKey);
       if (cached) return cached;

       try {
         const response = await fetch(`${this.baseUrl}/endpoint?param=${param}`);
         const data = await response.json();

         cache.set(cacheKey, data, 300);
         return data;
       } catch (error) {
         throw handleError(error, { param, operation: 'fetch_data' });
       }
     }
   }

   export const newService = new NewService();
   ```

2. **Add types** in `src/types/`:
   ```typescript
   export interface NewServiceData {
     // Define structure
   }
   ```

3. **Add rate limiting** (if needed):
   ```typescript
   import pThrottle from 'p-throttle';

   const throttle = pThrottle({
     limit: 10,        // 10 requests
     interval: 1000    // per second
   });

   async fetchData(param: string) {
     return throttle(async () => {
       // API call here
     })();
   }
   ```

4. **Write comprehensive tests**:
   ```typescript
   // tests/services/new-service.test.ts
   describe('NewService', () => {
     it('should fetch data successfully', async () => {
       // Test implementation
     });

     it('should use cache on second call', async () => {
       // Test caching
     });

     it('should handle errors gracefully', async () => {
       // Test error handling
     });
   });
   ```

5. **Document** in `.claude/ARCHITECTURE.md`:
   - Add to Services Layer section
   - Explain purpose and key responsibilities

---

## Updating Dependencies

**When**: Security vulnerabilities, new features, or regular maintenance

**Check for updates**:
```bash
npm outdated
```

**Update specific package**:
```bash
npm update yahoo-finance2
```

**Update all dependencies** (careful!):
```bash
npm update
```

**Major version updates**:
```bash
npm install yahoo-finance2@latest
```

**After updating**:
1. **Run tests**: `npm test`
2. **Run build**: `npm run build`
3. **Test locally** with Claude Desktop
4. **Check for breaking changes** in package changelogs
5. **Update code** if APIs changed
6. **Commit**: `git commit -m "chore: update dependencies"`

**Security updates**:
```bash
npm audit
npm audit fix
```

---

## Debugging Issues

**Problem: Tool not showing up in Claude Desktop**

1. Check MCP server is registered in `claude_desktop_config.json`
2. Restart Claude Desktop completely
3. Check server logs for startup errors
4. Verify tool is registered in `src/tools/index.ts`

**Problem: Tool returns error**

1. Check error message in Claude Desktop
2. Add logging in service layer:
   ```typescript
   console.error('Debug info:', { param, result });
   ```
3. Rebuild: `npm run build`
4. Restart Claude Desktop
5. Try again and check logs

**Problem: Data is stale**

1. Check cache TTL in `src/services/cache.ts`
2. Clear cache (restart server)
3. Verify external API is returning fresh data

**Problem: Tests failing**

1. Run specific test: `npx vitest run tests/path/to/test.test.ts`
2. Check for:
   - API changes (Yahoo Finance)
   - Network issues
   - Cache interference (use separate cache in tests)
3. Update test expectations if API changed
4. Mock external dependencies

**Problem: Build errors**

1. Check TypeScript errors: `npm run build`
2. Common issues:
   - Missing type definitions
   - Incorrect imports (missing `.js` extension)
   - Type mismatches
3. Fix errors and rebuild

**Problem: Rate limiting**

1. Check `p-throttle` configuration in services
2. Reduce request frequency
3. Increase cache TTLs
4. Add delays between requests in tests

---

## Quick Reference Commands

```bash
# Development
npm run dev              # Run in dev mode with auto-reload
npm run build            # Compile TypeScript
npm start                # Run compiled version

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format with Prettier

# Git
git status               # Check current status
git checkout -b feat/X   # Create feature branch
git add .                # Stage all changes
git commit -m "msg"      # Commit changes
git push origin feat/X   # Push branch

# GitHub CLI
gh pr create             # Create pull request
gh pr view               # View current PR
gh pr list               # List all PRs
gh pr merge              # Merge PR

# Package Management
npm install              # Install dependencies
npm outdated             # Check for updates
npm audit                # Check security issues
npm pack                 # Create tarball for testing

# Local Testing
node dist/index.js       # Run server directly
```

---

## Common Patterns

### Error Handling
```typescript
try {
  const result = await externalAPI.call();
  return result;
} catch (error) {
  throw handleError(error, { context: 'info' });
}
```

### Caching
```typescript
const cacheKey = `operation:${param}`;
const cached = cache.get<ResultType>(cacheKey);
if (cached) return cached;

const result = await fetchData();
cache.set(cacheKey, result, TTL_SECONDS);
return result;
```

### Validation
```typescript
import { z } from 'zod';

const schema = z.object({
  symbol: z.string().min(1).max(10),
  period: z.number().min(1).max(365).optional()
});

const validated = schema.parse(input);
```

### Rate Limiting
```typescript
import pThrottle from 'p-throttle';

const throttle = pThrottle({ limit: 100, interval: 60000 });

const fetchThrottled = throttle(async (symbol: string) => {
  return await api.fetch(symbol);
});
```

---

For more context, see:
- `.claude/CLAUDE_GUIDE.md` - Quick reference for working with codebase
- `.claude/ARCHITECTURE.md` - System design and architecture
- `README.md` - User-facing documentation
