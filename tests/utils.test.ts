/**
 * Utility function tests
 */
import { describe, it, expect } from 'vitest';

describe('Error Handler', () => {
  it('should import without errors', async () => {
    const module = await import('../src/utils/error-handler.js');
    expect(module).toBeDefined();
    expect(module.ErrorHandler).toBeDefined();
  });
});

describe('Validators', () => {
  it('should import without errors', async () => {
    const module = await import('../src/utils/validators.js');
    expect(module).toBeDefined();
    expect(module.validateInput).toBeDefined();
  });
});
