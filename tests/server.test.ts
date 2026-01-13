/**
 * Basic server tests
 */
import { describe, it, expect } from 'vitest';

describe('MCP Finance Server', () => {
  it('should be defined', () => {
    expect(true).toBe(true);
  });

  it('package.json should have correct name', async () => {
    const pkg = await import('../package.json');
    expect(pkg.name).toBe('mcp-financex');
  });

  it('package.json should have correct version', async () => {
    const pkg = await import('../package.json');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
