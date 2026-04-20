import { describe, expect, it } from 'vitest';
import { shouldIgnoreRedirectResolutionError } from './firebase-bootstrap-errors';

describe('shouldIgnoreRedirectResolutionError', () => {
  it('ignores known non-actionable Firebase redirect resolution auth codes', () => {
    expect(shouldIgnoreRedirectResolutionError({ code: 'auth/network-request-failed' })).toBe(true);
    expect(shouldIgnoreRedirectResolutionError({ code: 'auth/web-storage-unsupported' })).toBe(true);
    expect(shouldIgnoreRedirectResolutionError({ code: 'auth/operation-not-supported-in-this-environment' })).toBe(true);
  });

  it('ignores iframe resolution failures surfaced via error message', () => {
    expect(shouldIgnoreRedirectResolutionError(new Error('Failed loading /__/auth/iframe on bootstrap'))).toBe(true);
    expect(shouldIgnoreRedirectResolutionError(new Error('Blocked from chrome-error://chromewebdata/ frame'))).toBe(true);
  });

  it('does not ignore unrelated auth errors', () => {
    expect(shouldIgnoreRedirectResolutionError({ code: 'auth/invalid-credential' })).toBe(false);
  });
});
