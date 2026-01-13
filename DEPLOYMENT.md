# MCP Finance Deployment Guide

## For End Users (No Installation Required!)

Just like the Alpha Vantage MCP example, users can run this MCP server without any local installation.

### Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

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

That's it! The first time Claude Desktop starts, it will automatically download and run the MCP Finance server.

### Alternative: Run from GitHub (before npm publish)

If the package isn't published to npm yet, you can run it directly from GitHub:

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

### With Environment Variables (Optional)

If you want to configure caching or other settings:

```json
{
  "mcpServers": {
    "finance": {
      "command": "npx",
      "args": ["-y", "mcp-financex"],
      "env": {
        "CACHE_QUOTE_TTL": "10",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

## For Developers: Publishing to npm

### Prerequisites
1. Have an npm account: `npm adduser`
2. Update repository URL in package.json
3. Ensure code is built: `npm run build`

### Publish Process

```bash
# First time
npm publish

# For updates
npm version patch   # Bug fixes (1.0.0 -> 1.0.1)
npm version minor   # New features (1.0.0 -> 1.1.0)
npm version major   # Breaking changes (1.0.0 -> 2.0.0)
npm publish
```

### Publish to GitHub Packages (Alternative)

If you want to use GitHub's npm registry instead:

1. Update package name to scoped format:
   ```json
   "name": "@yourusername/mcp-financex"
   ```

2. Add `.npmrc`:
   ```
   @yourusername:registry=https://npm.pkg.github.com
   ```

3. Publish:
   ```bash
   npm publish
   ```

Users would then use:
```json
{
  "mcpServers": {
    "finance": {
      "command": "npx",
      "args": ["-y", "@yourusername/mcp-financex"]
    }
  }
}
```

## Comparison with Other MCP Servers

### Alpha Vantage (Python/uvx)
```json
"alphavantage": {
  "command": "uvx",
  "args": ["av-mcp", "API_KEY_HERE"]
}
```

### MCP Finance (Node.js/npx)
```json
"finance": {
  "command": "npx",
  "args": ["-y", "mcp-financex"]
}
```

Both approaches allow users to run MCP servers without local installation!

## Testing the Package Locally

Before publishing, test the package locally:

```bash
# Create a test tarball
npm pack

# Install globally from tarball
npm install -g mcp-financex-1.0.0.tgz

# Test running
mcp-financex

# Or test with npx
npx ./mcp-financex-1.0.0.tgz

# Uninstall when done
npm uninstall -g mcp-financex
```

## Troubleshooting

### "command not found: npx"
- Ensure Node.js is installed (comes with npm/npx)
- Update npm: `npm install -g npm@latest`

### Package doesn't update
- Clear npx cache: `npx clear-npx-cache`
- Or force reinstall: `npx -y --force mcp-financex`

### Permission errors on Windows
- Run as Administrator, or
- Configure npm to use a user directory for global packages
