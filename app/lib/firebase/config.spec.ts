import { describe, expect, it } from 'vitest';
import { normalizeFirebaseAuthDomain } from './config';

describe('normalizeFirebaseAuthDomain', () => {
  it('keeps Firebase hosted domains unchanged', () => {
    expect(normalizeFirebaseAuthDomain('cryzo-v5-auth.firebaseapp.com', 'cryzo-v5-auth')).toEqual({
      authDomain: 'cryzo-v5-auth.firebaseapp.com',
      fallbackApplied: false,
    });
  });

  it('falls back to Firebase hosted domain when auth domain is a Vercel hostname', () => {
    expect(normalizeFirebaseAuthDomain('cryzo-v5.vercel.app', 'cryzo-v5-auth')).toEqual({
      authDomain: 'cryzo-v5-auth.firebaseapp.com',
      fallbackApplied: true,
    });
  });

  it('does not fallback when project id is missing', () => {
    expect(normalizeFirebaseAuthDomain('cryzo-v5.vercel.app', '')).toEqual({
      authDomain: 'cryzo-v5.vercel.app',
      fallbackApplied: false,
    });
  });

  it('trims inputs before processing', () => {
    expect(normalizeFirebaseAuthDomain('  cryzo-v5.vercel.app  ', '  Cryzo-V5-Auth  ')).toEqual({
      authDomain: 'cryzo-v5-auth.firebaseapp.com',
      fallbackApplied: true,
    });
  });
});
