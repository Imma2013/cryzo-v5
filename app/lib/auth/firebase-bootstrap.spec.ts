import { describe, expect, it } from 'vitest';
import { SESSION_BOOTSTRAP_TIMEOUT_MESSAGE } from './firebase-auth';

describe('firebase bootstrap timeout copy', () => {
  it('uses actionable copy for stalled session bootstrap', () => {
    expect(SESSION_BOOTSTRAP_TIMEOUT_MESSAGE).toContain('retry sign-in');
    expect(SESSION_BOOTSTRAP_TIMEOUT_MESSAGE).toContain('Session check');
  });
});
