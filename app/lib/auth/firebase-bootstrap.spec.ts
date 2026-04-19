import { describe, expect, it, vi } from 'vitest';
import { SESSION_BOOTSTRAP_TIMEOUT_MESSAGE, waitForFirebaseAuthReady } from './firebase-auth';

describe('firebase bootstrap timeout copy', () => {
  it('uses actionable copy for stalled session bootstrap', () => {
    expect(SESSION_BOOTSTRAP_TIMEOUT_MESSAGE).toContain('retry sign-in');
    expect(SESSION_BOOTSTRAP_TIMEOUT_MESSAGE).toContain('Session check');
  });
});

describe('waitForFirebaseAuthReady', () => {
  it('uses Firebase authStateReady when available', async () => {
    const authStateReady = vi.fn().mockResolvedValue(undefined);
    const auth = {
      authStateReady,
      currentUser: { uid: 'firebase-user' },
    };

    await expect(waitForFirebaseAuthReady(auth as never)).resolves.toEqual({ uid: 'firebase-user' });
    expect(authStateReady).toHaveBeenCalledTimes(1);
  });
});
