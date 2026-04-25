import { afterEach, describe, expect, it, vi } from 'vitest';

const mcpState = vi.hoisted(() => ({
  createMCPClient: vi.fn(),
}));

vi.mock('@ai-sdk/mcp', () => {
  return {
    createMCPClient: mcpState.createMCPClient,
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
    mcpState.createMCPClient.mockReset();
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

  it('creates an MCP client and returns MCP tools for a signed-in user', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mcpState.createMCPClient.mockResolvedValue({
      close,
      serverInfo: { name: 'composio-tool-router', version: '1.0.0' },
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
    expect(mcpState.createMCPClient).toHaveBeenCalledWith({
      name: 'cryzo-composio-mcp',
      transport: {
        headers: {
          'x-api-key': 'test-key',
        },
        type: 'http',
        url: 'https://backend.composio.dev/tool_router/trs_3dvKvFzgd8Xr/mcp',
      },
    });
    expect(close).not.toHaveBeenCalled();

    await resolution.cleanup?.();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns a resolution failure with the real MCP tool error message', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mcpState.createMCPClient.mockResolvedValue({
      close,
      tools: vi.fn().mockRejectedValue(new Error('No connected accounts found for toolkit gmail')),
    });

    const resolution = await getComposioTools({
      env: { COMPOSIO_API_KEY: 'test-key' } as any,
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
    expect(close).toHaveBeenCalledTimes(1);
  });
});
