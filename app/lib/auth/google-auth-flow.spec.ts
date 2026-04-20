import { describe, expect, it } from 'vitest';
import {
  FIREBASE_PRODUCTION_AUTH_HOSTNAME,
  getFirebaseAuthHostSupport,
  getGoogleSignInMethod,
  getGoogleSignInPendingLabel,
  shouldFallbackToRedirectFromPopupError,
} from './google-auth-flow';

describe('getGoogleSignInMethod', () => {
  it('uses popup flow on localhost', () => {
    expect(getGoogleSignInMethod('localhost')).toBe('popup');
    expect(getGoogleSignInMethod('127.0.0.1')).toBe('popup');
    expect(getGoogleSignInMethod('0.0.0.0')).toBe('popup');
    expect(getGoogleSignInMethod('[::1]')).toBe('popup');
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

describe('getFirebaseAuthHostSupport', () => {
  it('supports localhost and production host', () => {
    expect(getFirebaseAuthHostSupport('localhost').isSupported).toBe(true);
    expect(getFirebaseAuthHostSupport(FIREBASE_PRODUCTION_AUTH_HOSTNAME).isSupported).toBe(true);
  });

  it('disables auth on Vercel preview hostnames', () => {
    const support = getFirebaseAuthHostSupport('cryzo-v5-git-fix-auth-lloydebone-2777s-projects.vercel.app');
    expect(support.isSupported).toBe(false);
    expect(support.message).toContain('preview URLs');
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
