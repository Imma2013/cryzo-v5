import { afterEach, describe, expect, it, vi } from 'vitest';

const composioState = vi.hoisted(() => ({
  createComposioSessionFromApiKey: vi.fn(),
}));

vi.mock('~/lib/.server/composio', async () => {
  const actual = await vi.importActual<typeof import('~/lib/.server/composio')>('~/lib/.server/composio');

  return {
    ...actual,
    createComposioSessionFromApiKey: composioState.createComposioSessionFromApiKey,
  };
});

import { __resetPendingComposioConfirmationsForTests, getComposioTools, shouldEnableComposioTools } from './composio';

describe('shouldEnableComposioTools', () => {
  it('enables Composio for signed-in identities on supported tool-capable providers with an API key', () => {
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
        env: { COMPOSIO_API_KEY: 'test-key', FEATURE_COMPOSIO_TOOLS: 'false' } as any,
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
    const previousApiKey = process.env.COMPOSIO_API_KEY;
    const previousViteApiKey = process.env.VITE_COMPOSIO_API_KEY;

    delete process.env.COMPOSIO_API_KEY;
    delete process.env.VITE_COMPOSIO_API_KEY;

    try {
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
    } finally {
      if (previousApiKey != null) {
        process.env.COMPOSIO_API_KEY = previousApiKey;
      }

      if (previousViteApiKey != null) {
        process.env.VITE_COMPOSIO_API_KEY = previousViteApiKey;
      }
    }
  });

  it('creates a session and returns docs-level session tools for a signed-in user', async () => {
    composioState.createComposioSessionFromApiKey.mockResolvedValue({
      tools: vi.fn().mockResolvedValue({
        COMPOSIO_SEARCH_TOOLS: { description: 'Search Composio tools' },
      }),
    });

    const resolution = await getComposioTools({
      env: { COMPOSIO_API_KEY: 'test-key' } as any,
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
    expect(composioState.createComposioSessionFromApiKey).toHaveBeenCalledWith('test-key', 'user_123', {
      manageConnections: true,
      toolkits: ['gmail'],
    });
  });
});
