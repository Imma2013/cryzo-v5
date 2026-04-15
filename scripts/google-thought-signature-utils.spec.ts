import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getPatchStatus } = require('./google-thought-signature-utils.cjs');

describe('google-thought-signature-utils', () => {
  it('reports the local @ai-sdk/google install as patched', () => {
    const status = getPatchStatus();

    expect(status.length).toBeGreaterThan(0);
    expect(status.every((entry: any) => entry.exists && entry.patched)).toBe(true);
  });
});
