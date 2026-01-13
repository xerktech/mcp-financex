# CI/CD Setup Guide

Quick guide to set up automated workflows for mcp-financex.

## 🚀 Quick Start

### 1. Push to GitHub

```bash
git add .
git commit -m "Add GitHub Actions workflows"
git push origin main
```

### 2. Configure Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

#### Required: NPM_TOKEN

1. Login to npm: `npm login`
2. Generate token: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
3. Click "Generate New Token" → "Classic Token"
4. Select "Automation" type
5. Copy the token
6. Add to GitHub as `NPM_TOKEN`

#### Optional: SNYK_TOKEN

1. Sign up at https://snyk.io
2. Go to Account Settings → API Token
3. Copy token
4. Add to GitHub as `SNYK_TOKEN`

### 3. Enable GitHub Actions

1. Go to repository Settings → Actions → General
2. Select "Allow all actions and reusable workflows"
3. Under "Workflow permissions", select "Read and write permissions"
4. Check "Allow GitHub Actions to create and approve pull requests"
5. Save

### 4. Set Up Branch Protection (Recommended)

1. Go to Settings → Branches
2. Click "Add rule"
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - Select required checks:
     - `Security & Code Quality`
     - `Build & Package Test`
     - `CodeQL Security Analysis`
5. Save changes

## 📋 What Gets Automated

### On Pull Request

✅ Security scans (npm audit, CodeQL, Snyk, TruffleHog)
✅ Code quality (ESLint, Prettier)
✅ TypeScript compilation
✅ Tests on Node 18.x, 20.x, 22.x
✅ Build verification
✅ Dependency review

### On Merge to Main

✅ Final security audit
✅ Full test suite
✅ Version auto-bump (patch by default)
✅ npm package publish
✅ GitHub release creation
✅ Artifact upload

### Manual Workflow Dispatch

You can manually trigger a publish with custom version bump:
1. Go to Actions → "Build & Publish to NPM"
2. Click "Run workflow"
3. Choose version type: patch/minor/major
4. Run

## 🔍 Monitoring

### Check Workflow Status

- **Actions tab**: See all workflow runs
- **Pull Requests**: Status checks appear automatically
- **Security tab**: View CodeQL and Dependabot alerts

### Badges

Add these to your README (already added):

```markdown
[![PR Checks](https://github.com/yourusername/mcp-financex/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/yourusername/mcp-financex/actions/workflows/pr-checks.yml)
[![Publish](https://github.com/yourusername/mcp-financex/actions/workflows/publish.yml/badge.svg)](https://github.com/yourusername/mcp-financex/actions/workflows/publish.yml)
```

## 🐛 Troubleshooting

### "NPM_TOKEN not found"
→ Add NPM_TOKEN secret in repository settings

### "Permission denied to create release"
→ Enable "Read and write permissions" in Actions settings

### "Tests failed"
→ Fix test failures before merging to main

### "Version already exists on npm"
→ The workflow auto-bumps versions, wait for next merge or manually bump version

### "npm audit failed"
→ Run `npm audit fix` locally and commit changes

## 📦 Publishing Flow

1. **Developer creates PR**
   - All checks run automatically
   - Must pass before merge

2. **PR merged to main**
   - Auto version bump (patch)
   - Tests run
   - Package publishes to npm
   - GitHub release created
   - Users can use: `npx -y mcp-financex`

3. **Manual publish** (when needed)
   - Dispatch workflow manually
   - Choose version bump type
   - Same publish process

## 🔐 Security Features

- ✅ **npm provenance** - Supply chain security
- ✅ **Secret scanning** - TruffleHog detects committed secrets
- ✅ **Dependency review** - Blocks vulnerable dependencies
- ✅ **CodeQL analysis** - Detects security vulnerabilities
- ✅ **Snyk scanning** - Third-party vulnerability detection
- ✅ **npm audit** - Checks for known vulnerabilities

## 📚 Additional Resources

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Workflow Details](.github/workflows/README.md)

## ✅ Verification Checklist

After setup, verify:

- [ ] NPM_TOKEN secret added
- [ ] Actions enabled in repository
- [ ] Workflow permissions set to "Read and write"
- [ ] Branch protection rules configured
- [ ] Pushed code with workflows to GitHub
- [ ] First workflow run successful
- [ ] Package published to npm (after first merge)

## 🎉 You're Done!

Your repository now has:
- ✅ Automated security scanning
- ✅ Code quality checks
- ✅ Automatic npm publishing
- ✅ Version management
- ✅ Release automation

Every merge to main will automatically publish a new version to npm!
