import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  __resetPendingComposioConfirmationsForTests,
  getComposioTools,
  shouldEnableComposioTools,
} from './composio';

describe('shouldEnableComposioTools', () => {
  it('enables Composio for signed-in or guest identities on supported tool-capable providers with an API key', () => {
    expect(
      shouldEnableComposioTools({
        env: { COMPOSIO_API_KEY: 'test-key' } as any,
        providerName: 'Google',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(true);

    expect(
      shouldEnableComposioTools({
        env: { COMPOSIO_API_KEY: 'test-key' } as any,
        providerName: 'OpenAI',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(true);

    expect(
      shouldEnableComposioTools({
        env: { COMPOSIO_API_KEY: 'test-key' } as any,
        providerName: 'Ollama',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(false);

    expect(
      shouldEnableComposioTools({
        env: { COMPOSIO_API_KEY: 'test-key' } as any,
        providerName: 'Google',
        user: { isAuthenticated: false, composioUserId: 'guest_123', hasComposioIdentity: true },
      }),
    ).toBe(true);

    expect(
      shouldEnableComposioTools({
        env: { COMPOSIO_API_KEY: 'test-key' } as any,
        providerName: 'Google',
        user: { isAuthenticated: false },
      }),
    ).toBe(false);
  });

  it('respects the Composio feature flag', () => {
    expect(
      shouldEnableComposioTools({
        env: { COMPOSIO_API_KEY: 'test-key', FEATURE_COMPOSIO_TOOLS: 'false' } as any,
        providerName: 'Google',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(false);
  });
});

describe('Composio wrappers', () => {
  const originalComposioApiKey = process.env.COMPOSIO_API_KEY;

  beforeEach(() => {
    __resetPendingComposioConfirmationsForTests();
  });

  afterEach(() => {
    process.env.COMPOSIO_API_KEY = originalComposioApiKey;
  });

  it('returns no tools when Composio is disabled', async () => {
    await expect(
      getComposioTools({
        env: { FEATURE_COMPOSIO_TOOLS: 'false', COMPOSIO_API_KEY: 'test-key' } as any,
        providerName: 'Google',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).resolves.toEqual({
      configured: false,
      hasIdentity: true,
      resolvedUserId: 'user_123',
      status: 'disabled',
      tools: {},
    });
  });

  it('reports missing identity separately from configuration issues', async () => {
    await expect(
      getComposioTools({
        env: { COMPOSIO_API_KEY: 'test-key' } as any,
        providerName: 'Google',
        user: { isAuthenticated: false },
      }),
    ).resolves.toEqual({
      configured: true,
      hasIdentity: false,
      resolvedUserId: undefined,
      status: 'missing_identity',
      tools: {},
    });
  });

  it('reports missing API key as a runtime blocker', async () => {
    delete process.env.COMPOSIO_API_KEY;

    await expect(
      getComposioTools({
        env: {} as any,
        providerName: 'Google',
        user: { isAuthenticated: false, composioUserId: 'guest_123' },
      }),
    ).resolves.toEqual({
      configured: false,
      hasIdentity: true,
      resolvedUserId: 'guest_123',
      status: 'missing_api_key',
      tools: {},
    });
  });
});
