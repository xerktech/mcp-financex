# GitHub Actions Workflows

This project uses GitHub Actions for automated testing, security scanning, and publishing to npm.

## Workflows

### 1. PR Quality Checks (`pr-checks.yml`)

**Triggers:** Pull requests to `main` or `develop` branches

**Important:** This workflow has **strict checks** - failing checks will **block PR merging**.

**Jobs:**

#### Security & Code Quality ❌ BLOCKS PR
Tests across Node.js versions 18.x, 20.x, 22.x

**Will FAIL the PR:**
- ❌ **Tests fail** - All tests must pass
- ❌ **TypeScript errors** - Must compile without errors
- ❌ **ESLint errors** - Code quality issues must be fixed
- ❌ **High/Critical vulnerabilities** - npm audit must pass
- ❌ **Secret leaks** - TruffleHog detects committed secrets

**Warning only (won't block):**
- ⚠️ **Formatting issues** - Can be auto-fixed with `npm run format`
- ⚠️ **Outdated dependencies** - Informational only

#### Dependency Review ⚠️ OPTIONAL
- Analyzes dependency changes in PRs
- Fails on moderate or higher severity vulnerabilities
- **Requires GitHub Advanced Security** (paid feature)
- Runs but won't block if not available

#### CodeQL Security Analysis ⚠️ OPTIONAL
- GitHub's semantic code analysis
- Detects security vulnerabilities and coding errors
- Runs security-and-quality queries
- **Requires GitHub Advanced Security** (paid feature)
- Runs but won't block if not available

#### Snyk Security Scan ⚠️ OPTIONAL
- Third-party vulnerability scanning
- Checks for high severity issues
- Only runs on public repos with SNYK_TOKEN
- Job-level continue-on-error for missing token

#### Build & Package Test ❌ BLOCKS PR
- **Full build verification must succeed**
- **Package creation must work**
- Artifact upload for review
- Ensures publishable package

#### PR Summary
- Aggregates all check results
- **Fails if any required check fails**
- Shows clear pass/fail status
- Provides actionable error messages

### 2. Build & Publish (`publish.yml`)

**Triggers:**
- Push to `main` branch (auto patch bump)
- Manual workflow dispatch (choose version bump)

**Jobs:**
- **Final Tests**
  - Runs all tests
  - Security audit
  - Build verification
  - Package validation

- **Publish to NPM**
  - Auto version bump (if needed)
  - Creates GitHub release
  - Publishes to npm registry with provenance
  - Pushes version tag back to repository
  - Uploads package artifacts

## Setup Instructions

### Required Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

1. **NPM_TOKEN** (Required for publishing)
   ```bash
   # Generate an npm access token
   npm login
   npm token create
   ```
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token and add as GitHub secret

2. **SNYK_TOKEN** (Optional, for Snyk scanning)
   - Sign up at https://snyk.io
   - Go to Account Settings → API Token
   - Copy token and add as GitHub secret

### Repository Settings

1. **Enable GitHub Actions**
   - Go to Settings → Actions → General
   - Select "Allow all actions and reusable workflows"

2. **Branch Protection Rules** (Recommended)
   - Go to Settings → Branches
   - Add rule for `main` branch:
     - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date before merging
     - Select required checks:
       - `Security & Code Quality`
       - `Build & Package Test`
       - `CodeQL Security Analysis`

3. **Enable Dependency Graph**
   - Go to Settings → Security → Code security and analysis
   - Enable "Dependency graph"
   - Enable "Dependabot alerts"
   - Enable "Dependabot security updates"

### Workflow Permissions

The workflows automatically have these permissions:
- `contents: write` - For creating releases and pushing version tags
- `id-token: write` - For npm provenance
- `security-events: write` - For CodeQL scanning

## Manual Publishing

To manually trigger a publish with a specific version bump:

1. Go to Actions → Build & Publish to NPM
2. Click "Run workflow"
3. Select branch: `main`
4. Choose version bump type:
   - `patch` - Bug fixes (1.0.0 → 1.0.1)
   - `minor` - New features (1.0.0 → 1.1.0)
   - `major` - Breaking changes (1.0.0 → 2.0.0)
5. Click "Run workflow"

## Workflow Badges

Add these badges to your README.md:

```markdown
[![PR Checks](https://github.com/yourusername/mcp-financex/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/yourusername/mcp-financex/actions/workflows/pr-checks.yml)
[![Publish](https://github.com/yourusername/mcp-financex/actions/workflows/publish.yml/badge.svg)](https://github.com/yourusername/mcp-financex/actions/workflows/publish.yml)
[![npm version](https://badge.fury.io/js/mcp-financex.svg)](https://www.npmjs.com/package/mcp-financex)
```

## Troubleshooting

### "Error: NPM_TOKEN not found"
- Add NPM_TOKEN secret to repository settings
- Generate token at https://www.npmjs.com with "Automation" type

### "Version X.Y.Z already exists"
- The workflow auto-bumps versions, but if manual version was set, it may conflict
- Update version in package.json manually or let workflow handle it

### "npm audit failed"
- Fix vulnerabilities: `npm audit fix`
- For breaking changes: `npm audit fix --force`
- Update dependencies: `npm update`

### "Tests failed"
- PR checks will fail if tests don't pass
- Fix test failures before merging

### "CodeQL analysis failed"
- Check for JavaScript/TypeScript security issues
- Review CodeQL results in Security tab

### "Permission denied to create release"
- Ensure GitHub Actions has write permissions
- Check Settings → Actions → General → Workflow permissions
- Select "Read and write permissions"

## Security Best Practices

1. **Never commit secrets** - Use GitHub Secrets for sensitive data
2. **Review dependency updates** - Check Dependabot PRs carefully
3. **Enable 2FA on npm** - Protect your npm account
4. **Use provenance** - Package published with `--provenance` for supply chain security
5. **Monitor security alerts** - Check Security tab regularly

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
