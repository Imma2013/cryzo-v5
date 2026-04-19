import { describe, expect, it } from 'vitest';
import { getGoogleSignInMethod, getGoogleSignInPendingLabel } from './google-auth-flow';

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
