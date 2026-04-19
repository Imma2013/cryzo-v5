import { describe, expect, it } from 'vitest';
import { getFirebaseAuthErrorMessage } from './firebase-errors';

describe('getFirebaseAuthErrorMessage', () => {
  it('returns Firebase authorized domain guidance for unauthorized-domain errors', () => {
    const message = getFirebaseAuthErrorMessage({ code: 'auth/unauthorized-domain' });

    expect(message).toContain('Firebase Auth is blocking');
    expect(message).toContain('Authorized domains');
  });

  it('falls back to the original error message for other auth failures', () => {
    expect(getFirebaseAuthErrorMessage(new Error('Popup closed by user'))).toBe('Popup closed by user');
  });

  it('formats popup-closed-by-user errors with actionable copy', () => {
    expect(getFirebaseAuthErrorMessage({ code: 'auth/popup-closed-by-user' })).toContain('interrupted');
  });

  it('formats popup-blocked errors with actionable copy', () => {
    expect(getFirebaseAuthErrorMessage({ code: 'auth/popup-blocked' })).toContain('Allow popups');
  });

  it('formats cancelled-popup-request errors with actionable copy', () => {
    expect(getFirebaseAuthErrorMessage({ code: 'auth/cancelled-popup-request' })).toContain('already in progress');
  });
});
