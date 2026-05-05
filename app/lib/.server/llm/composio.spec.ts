import { afterEach, describe, expect, it, vi } from 'vitest';

const composioState = vi.hoisted(() => ({
  createComposioSessionFromApiKey: vi.fn(),
  resolveComposioApiKeyFromEnv: vi.fn((env?: Record<string, string | undefined>) => {
    const value = env?.COMPOSIO_API_KEY ?? process.env.COMPOSIO_API_KEY ?? env?.VITE_COMPOSIO_API_KEY;

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }),
}));

vi.mock('~/lib/.server/composio', () => {
  return {
    createComposioSessionFromApiKey: composioState.createComposioSessionFromApiKey,
    resolveComposioApiKeyFromEnv: composioState.resolveComposioApiKeyFromEnv,
  };
});

import { __resetPendingComposioConfirmationsForTests, getComposioTools, shouldEnableComposioTools } from './composio';

const originalComposioApiKey = process.env.COMPOSIO_API_KEY;

describe('shouldEnableComposioTools', () => {
  it('enables Composio for signed-in identities on supported tool-capable providers with API key configured', () => {
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
    ).toBe(false);
  });

  it('respects the Composio feature flag', () => {
    expect(
      shouldEnableComposioTools({
        env: {
          COMPOSIO_API_KEY: 'test-key',
          FEATURE_COMPOSIO_TOOLS: 'false',
        } as any,
        providerName: 'Google',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(false);
  });
});

describe('getComposioTools', () => {
  afterEach(() => {
    __resetPendingComposioConfirmationsForTests();
    composioState.createComposioSessionFromApiKey.mockReset();

    if (originalComposioApiKey == null) {
      delete process.env.COMPOSIO_API_KEY;
    } else {
      process.env.COMPOSIO_API_KEY = originalComposioApiKey;
    }
  });

  it('returns no tools when Composio is disabled', async () => {
    await expect(
      getComposioTools({
        env: {
          FEATURE_COMPOSIO_TOOLS: 'false',
          COMPOSIO_API_KEY: 'test-key',
        } as any,
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

  it('reports missing Composio API key as a runtime blocker', async () => {
    delete process.env.COMPOSIO_API_KEY;

    await expect(
      getComposioTools({
        env: {} as any,
        providerName: 'Google',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).resolves.toEqual({
      configured: false,
      hasIdentity: true,
      resolvedUserId: 'user_123',
      status: 'missing_api_key',
      tools: {},
    });
  });

  it('creates a Composio Vercel-provider session and returns session tools for a signed-in user', async () => {
    composioState.createComposioSessionFromApiKey.mockResolvedValue({
      tools: vi.fn().mockResolvedValue({
        COMPOSIO_SEARCH_TOOLS: { description: 'Search Composio tools' },
      }),
    });

    const resolution = await getComposioTools({
      env: {
        COMPOSIO_API_KEY: 'test-key',
      } as any,
      providerName: 'Google',
      requestOrigin: 'https://cryzo-v5-blue.vercel.app',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: 'read my gmail account',
    });

    expect(resolution.status).toBe('available');
    expect(resolution.resolvedUserId).toBe('user_123');
    expect(resolution.tools).toEqual({
      COMPOSIO_SEARCH_TOOLS: { description: 'Search Composio tools' },
    });
    expect(composioState.createComposioSessionFromApiKey).toHaveBeenCalledWith('test-key', 'user_123');
    expect(resolution.cleanup).toBeUndefined();
  });

  it('returns a resolution failure with the real session.tools() error message', async () => {
    composioState.createComposioSessionFromApiKey.mockResolvedValue({
      tools: vi.fn().mockRejectedValue(new Error('No connected accounts found for toolkit gmail')),
    });

    const resolution = await getComposioTools({
      env: {
        COMPOSIO_API_KEY: 'test-key',
      } as any,
      providerName: 'Google',
      requestOrigin: 'https://cryzo-v5-blue.vercel.app',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: 'read my gmail account',
    });

    expect(resolution).toEqual({
      configured: true,
      errorMessage: 'No connected accounts found for toolkit gmail',
      hasIdentity: true,
      resolvedUserId: 'user_123',
      status: 'resolution_failed',
      tools: {},
    });
  });
});
