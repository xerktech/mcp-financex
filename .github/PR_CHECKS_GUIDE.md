# PR Checks Guide

## What Will Block Your PR ❌

These checks **MUST PASS** before you can merge:

### 1. **Tests** ❌ BLOCKS
```bash
npm test
```
- All tests must pass
- No test failures allowed
- **Fix:** Run tests locally and fix failures

### 2. **TypeScript Compilation** ❌ BLOCKS
```bash
npm run build
```
- Code must compile without errors
- No TypeScript errors allowed
- **Fix:** Run `npm run build` locally and fix type errors

### 3. **ESLint** ❌ BLOCKS
```bash
npm run lint
```
- Code must pass linting rules
- No ESLint errors allowed
- **Fix:** Run `npm run lint` and fix issues

### 4. **Security Vulnerabilities (High/Critical)** ❌ BLOCKS
```bash
npm audit --audit-level=high
```
- No high or critical severity vulnerabilities
- **Fix:** Run `npm audit fix` or update dependencies

### 5. **CodeQL Security Analysis** ❌ BLOCKS
- No critical security vulnerabilities in code
- Checks for common security issues
- **Fix:** Review CodeQL findings and fix security issues

### 6. **Dependency Review** ❌ BLOCKS
- New dependencies must not have moderate+ vulnerabilities
- Checks for vulnerable dependencies in PRs
- **Fix:** Choose a different package or update to safe version

### 7. **Build & Package** ❌ BLOCKS
- Build must succeed
- Package must be created successfully
- **Fix:** Ensure `npm run build` works locally

### 8. **Snyk Security (High Severity)** ❌ BLOCKS
- No high severity vulnerabilities
- Only runs on public repos with SNYK_TOKEN
- **Fix:** Update vulnerable dependencies

---

## What's a Warning Only ⚠️

These checks run but **WON'T BLOCK** your PR:

### 1. **Code Formatting** ⚠️ WARNING
```bash
npm run format -- --check
```
- Prettier formatting issues
- **Why warning only:** Can be auto-fixed
- **Fix:** Run `npm run format` to auto-fix

### 2. **Outdated Dependencies** ⚠️ WARNING
```bash
npm outdated
```
- Shows packages that can be updated
- **Why warning only:** Informational, not critical
- **Fix:** Optional - update when needed

---

## Check Status Matrix

| Check | Blocks PR | Runs On | Can Skip |
|-------|-----------|---------|----------|
| Tests | ✅ Yes | All Node versions | ❌ No |
| TypeScript | ✅ Yes | All Node versions | ❌ No |
| ESLint | ✅ Yes | All Node versions | ❌ No |
| npm audit (high/critical) | ✅ Yes | All Node versions | ❌ No |
| CodeQL | ✅ Yes | Latest Node | ❌ No |
| Dependency Review | ✅ Yes | PRs only | ❌ No |
| Build & Package | ✅ Yes | Latest Node | ❌ No |
| Snyk | ✅ Yes* | PRs on public repos | ⚠️ Optional |
| Formatting | ❌ No | All Node versions | ✅ Yes |
| Outdated deps | ❌ No | All Node versions | ✅ Yes |
| Secret scanning | ⚠️ Detects | All | ✅ Info only |

*Snyk only blocks if SNYK_TOKEN is configured

---

## Pre-Flight Checklist

Before creating a PR, run these locally:

```bash
# 1. Install dependencies
npm ci

# 2. Build
npm run build

# 3. Run tests
npm test

# 4. Lint
npm run lint

# 5. Format code
npm run format

# 6. Check for vulnerabilities
npm audit --audit-level=high

# 7. Check types
npx tsc --noEmit
```

If all pass locally, your PR checks should pass! ✅

---

## Common Failures & Fixes

### ❌ "npm audit found vulnerabilities"

```bash
# Try automatic fix
npm audit fix

# If that doesn't work, check details
npm audit

# Update specific package
npm update package-name

# Last resort (may cause breaking changes)
npm audit fix --force
```

### ❌ "ESLint errors found"

```bash
# See all errors
npm run lint

# Auto-fix what's possible
npm run lint -- --fix

# If using the project, some rules can be disabled in .eslintrc
```

### ❌ "TypeScript compilation failed"

```bash
# See all errors
npm run build

# Check types without emitting
npx tsc --noEmit

# Common fixes:
# - Add missing type definitions
# - Fix type errors in your code
# - Update tsconfig.json if needed
```

### ❌ "Tests failed"

```bash
# Run tests to see failures
npm test

# Run tests in watch mode for development
npm run test:watch

# Run specific test file
npm test -- path/to/test.ts

# Update snapshots if needed (carefully!)
npm test -- -u
```

### ❌ "Build artifacts not found"

```bash
# Ensure build creates dist/ directory
npm run build
ls dist/

# Check if prepublishOnly script runs
npm pack --dry-run
```

---

## Bypassing Checks (Not Recommended)

### Admin Override

Repository admins can merge PRs even with failing checks if:
1. Branch protection allows admin override
2. The failure is a false positive
3. It's an emergency hotfix

**⚠️ Use sparingly - defeats the purpose of CI/CD**

### Temporarily Disable a Check

Edit `.github/workflows/pr-checks.yml` and add:
```yaml
if: false  # Disables the job
```

**⚠️ Commit separately and re-enable after fixing issue**

---

## Getting Help

- **Check failed but you don't understand why?**
  - Click on the failed check in the PR
  - Read the logs for specific error messages
  - Search the error message

- **Check is failing but passes locally?**
  - Different Node.js version? Check matrix in workflow
  - Different dependencies? Delete node_modules and run `npm ci`
  - Environment differences? Check if any env vars are needed

- **False positive from security scan?**
  - Review the vulnerability details
  - Check if it affects your usage
  - Consider adding to exceptions (with justification)

---

## Workflow File Location

- **PR Checks:** `.github/workflows/pr-checks.yml`
- **Publish:** `.github/workflows/publish.yml`
- **Documentation:** `.github/workflows/README.md`

---

## Summary

✅ **8 checks block PRs** - Must fix before merging
⚠️ **2 checks are warnings** - Should fix but won't block
🔒 **Security-first approach** - Multiple security scanners
🚀 **Quality gates** - Ensures high code quality

**Bottom line:** If checks fail, fix them. Don't bypass unless absolutely necessary.
