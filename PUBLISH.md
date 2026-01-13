# Quick Publish Guide

## 🚀 Make Your MCP Server Available Like Alpha Vantage

Follow these steps to publish your MCP server so users can run it with `npx` just like the Alpha Vantage example.

## Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup
2. **Git repository**: Push your code to GitHub

## Step-by-Step Publishing

### 1. Update package.json

Replace `yourusername` with your actual GitHub username in package.json:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/YOUR_ACTUAL_USERNAME/mcp-financex.git"
},
"homepage": "https://github.com/YOUR_ACTUAL_USERNAME/mcp-financex#readme",
"bugs": {
  "url": "https://github.com/YOUR_ACTUAL_USERNAME/mcp-financex/issues"
}
```

### 2. Login to npm

```bash
npm login
```

Enter your npm username, password, and email.

### 3. Test Locally (Optional but Recommended)

```bash
# Build the project
npm run build

# Create a test package
npm pack

# Test with npx
npx ./mcp-financex-1.0.0.tgz

# Should see:
# MCP Finance Server started
# Available tools: get_quote, get_quote_batch, ...
```

### 4. Publish to npm

```bash
npm publish
```

That's it! Your package is now available on npm.

## 🎉 Users Can Now Deploy Without Installation

Once published, users add this to their `claude_desktop_config.json`:

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

Just like your Alpha Vantage example:
```json
{
  "mcpServers": {
    "alphavantage": {
      "command": "uvx",
      "args": ["av-mcp", "B6WGGYLDKZ8T9MXI"]
    },
    "finance": {
      "command": "npx",
      "args": ["-y", "mcp-financex"]
    }
  }
}
```

## Updating Your Package

When you make changes:

```bash
# 1. Make your code changes
# 2. Commit to git
git add .
git commit -m "Your changes"
git push

# 3. Update version
npm version patch    # For bug fixes: 1.0.0 -> 1.0.1
# or
npm version minor    # For new features: 1.0.0 -> 1.1.0
# or
npm version major    # For breaking changes: 1.0.0 -> 2.0.0

# 4. Publish
npm publish
```

## Alternative: Use GitHub Directly (No npm publish needed)

If you don't want to publish to npm, users can still use it directly from GitHub:

```json
{
  "mcpServers": {
    "finance": {
      "command": "npx",
      "args": ["-y", "github:yourusername/mcp-financex"]
    }
  }
}
```

**Note**: This requires your GitHub repo to be public and have the built files committed (the `dist/` folder).

## Troubleshooting

### "You do not have permission to publish"
- The package name might be taken. Change the name in package.json to something unique like `mcp-financex-yourname`

### "402 Payment Required"
- Package names starting with `@` are scoped packages and require a paid npm account for private packages
- Use an unscoped name (without `@`) or make it public

### Package name already exists
- Choose a different name: `mcp-yahoo-finance`, `finance-mcp-server`, etc.
- Update the name in package.json and the bin command

## Best Practices

1. **Semantic Versioning**: Use `npm version` commands to auto-update version
2. **Test Before Publishing**: Always test with `npm pack` and `npx ./package.tgz`
3. **Keep dist/ in Git**: If using GitHub direct install, commit the built files
4. **Document Changes**: Update README.md with each release
5. **Tag Releases**: Create git tags for versions: `git tag v1.0.0 && git push --tags`

## Package Info

- **Package Name**: mcp-financex
- **Version**: 1.0.0
- **Registry**: npm (https://www.npmjs.com)
- **Files Included**: dist/, README.md, LICENSE
- **Files Excluded**: src/, tests/, config files (via .npmignore)

## Support

After publishing, users can find your package at:
- npm: https://www.npmjs.com/package/mcp-financex
- GitHub: https://github.com/yourusername/mcp-financex
