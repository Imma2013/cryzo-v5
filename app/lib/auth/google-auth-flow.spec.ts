import { describe, expect, it } from 'vitest';
import {
  getGoogleSignInMethod,
  getGoogleSignInPendingLabel,
  shouldFallbackToRedirectFromPopupError,
} from './google-auth-flow';

describe('getGoogleSignInMethod', () => {
  it('uses popup flow on localhost', () => {
    expect(getGoogleSignInMethod('localhost')).toBe('popup');
    expect(getGoogleSignInMethod('127.0.0.1')).toBe('popup');
  });

  it('uses popup flow on deployed hosts', () => {
    expect(getGoogleSignInMethod('cryzo-v5.vercel.app')).toBe('popup');
    expect(getGoogleSignInMethod('cryzo.me')).toBe('popup');
  });
});

describe('getGoogleSignInPendingLabel', () => {
  it('returns redirect-specific pending copy', () => {
    expect(getGoogleSignInPendingLabel('redirect')).toBe('Redirecting to Google...');
  });
});

describe('shouldFallbackToRedirectFromPopupError', () => {
  it('returns true for popup and storage constraints', () => {
    expect(shouldFallbackToRedirectFromPopupError({ code: 'auth/popup-blocked' })).toBe(true);
    expect(shouldFallbackToRedirectFromPopupError({ code: 'auth/web-storage-unsupported' })).toBe(true);
  });

  it('returns false for non-fallback popup errors', () => {
    expect(shouldFallbackToRedirectFromPopupError({ code: 'auth/popup-closed-by-user' })).toBe(false);
  });
});
