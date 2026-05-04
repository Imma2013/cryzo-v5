import { afterEach, describe, expect, it, vi } from 'vitest';

const composioState = vi.hoisted(() => ({
  createComposioToolClientFromApiKey: vi.fn(),
  resolveComposioApiKeyFromEnv: vi.fn(),
}));

vi.mock('~/lib/.server/composio', () => {
  return {
    createComposioToolClientFromApiKey: composioState.createComposioToolClientFromApiKey,
    resolveComposioApiKeyFromEnv: composioState.resolveComposioApiKeyFromEnv,
  };
});

import { __resetPendingComposioConfirmationsForTests, getComposioTools, shouldEnableComposioTools } from './composio';

const originalComposioApiKey = process.env.COMPOSIO_API_KEY;

function whenApiKeyEnv(value: string | null) {
  composioState.resolveComposioApiKeyFromEnv.mockImplementation((env?: any) => {
    const fromEnv = env?.COMPOSIO_API_KEY;
    return fromEnv ?? value ?? null;
  });
}

describe('shouldEnableComposioTools', () => {
  afterEach(() => {
    composioState.resolveComposioApiKeyFromEnv.mockReset();
  });

  it('enables Composio for signed-in identities on supported tool-capable providers when COMPOSIO_API_KEY is configured', () => {
    whenApiKeyEnv(null);

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
    whenApiKeyEnv(null);

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
    composioState.createComposioToolClientFromApiKey.mockReset();
    composioState.resolveComposioApiKeyFromEnv.mockReset();

    if (originalComposioApiKey == null) {
      delete process.env.COMPOSIO_API_KEY;
    } else {
      process.env.COMPOSIO_API_KEY = originalComposioApiKey;
    }
  });

  it('returns no tools when Composio is disabled', async () => {
    whenApiKeyEnv(null);

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
    whenApiKeyEnv(null);

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

  it('reports a missing COMPOSIO_API_KEY as a runtime blocker', async () => {
    delete process.env.COMPOSIO_API_KEY;
    whenApiKeyEnv(null);

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

  it('creates a native Composio session and returns Vercel-formatted tools for a signed-in user', async () => {
    whenApiKeyEnv(null);
    const tools = {
      GMAIL_FETCH_EMAILS: { description: 'Fetch Gmail messages' },
    };
    const session = {
      tools: vi.fn().mockResolvedValue(tools),
    };
    const create = vi.fn().mockResolvedValue(session);
    composioState.createComposioToolClientFromApiKey.mockReturnValue({ create });

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
    expect(resolution.tools).toEqual(tools);
    expect(composioState.createComposioToolClientFromApiKey).toHaveBeenCalledWith('test-key');
    expect(create).toHaveBeenCalledWith('user_123');
    expect(session.tools).toHaveBeenCalledTimes(1);
  });

  it('returns a resolution failure with the real native error message', async () => {
    whenApiKeyEnv(null);
    const create = vi.fn().mockRejectedValue(new Error('No connected accounts found for toolkit gmail'));
    composioState.createComposioToolClientFromApiKey.mockReturnValue({ create });

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
