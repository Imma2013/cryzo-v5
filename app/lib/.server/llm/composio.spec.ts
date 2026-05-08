import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const composioState = vi.hoisted(() => ({
  createComposioSessionFromApiKey: vi.fn(),
  resolveComposioApiKeyFromEnv: vi.fn((env?: Record<string, string | undefined>) => {
    const value = env?.COMPOSIO_API_KEY ?? process.env.COMPOSIO_API_KEY ?? env?.VITE_COMPOSIO_API_KEY;

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }),
}));

const mcpState = vi.hoisted(() => ({
  createMCPClient: vi.fn(),
}));

vi.mock('~/lib/.server/composio', () => {
  return {
    createComposioSessionFromApiKey: composioState.createComposioSessionFromApiKey,
    resolveComposioApiKeyFromEnv: composioState.resolveComposioApiKeyFromEnv,
  };
});

vi.mock('@ai-sdk/mcp', () => {
  return {
    createMCPClient: mcpState.createMCPClient,
  };
});

if (!globalThis.crypto) {
  vi.stubGlobal('crypto', webcrypto);
}

import {
  __resetPendingComposioConfirmationsForTests,
  createComposioConfirmationToken,
  getComposioTools,
  isLikelyMutatingComposioTool,
  normalizeComposioToolForAiSdkV4,
  shouldEnableComposioTools,
} from './composio';

const originalComposioApiKey = process.env.COMPOSIO_API_KEY;

describe('shouldEnableComposioTools', () => {
  it('enables Composio for signed-in identities on supported tool-capable providers with MCP configured', () => {
    const mcpEnv = {
      COMPOSIO_MCP_API_KEY: 'mcp-key',
      COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
    } as any;

    expect(
      shouldEnableComposioTools({
        env: mcpEnv,
        providerName: 'Google',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(true);

    expect(
      shouldEnableComposioTools({
        env: mcpEnv,
        providerName: 'OpenAI',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(true);

    expect(
      shouldEnableComposioTools({
        env: mcpEnv,
        providerName: 'Ollama',
        user: { isAuthenticated: true, uid: 'user_123' },
      }),
    ).toBe(false);

    expect(
      shouldEnableComposioTools({
        env: mcpEnv,
        providerName: 'Google',
        user: { isAuthenticated: false, composioUserId: 'guest_123', hasComposioIdentity: true },
      }),
    ).toBe(false);
  });

  it('respects the Composio feature flag', () => {
    expect(
      shouldEnableComposioTools({
        env: {
          COMPOSIO_MCP_API_KEY: 'mcp-key',
          COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
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
    mcpState.createMCPClient.mockReset();

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
          COMPOSIO_MCP_API_KEY: 'mcp-key',
          COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
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
        env: {
          COMPOSIO_MCP_API_KEY: 'mcp-key',
          COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
        } as any,
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

  it('reports missing Composio MCP configuration as a runtime blocker', async () => {
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

  it('does not fall back to a native Composio session when only the legacy API key is configured', async () => {
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
      configured: false,
      hasIdentity: true,
      resolvedUserId: 'user_123',
      status: 'missing_api_key',
      tools: {},
    });
    expect(composioState.createComposioSessionFromApiKey).not.toHaveBeenCalled();
    expect(mcpState.createMCPClient).not.toHaveBeenCalled();
  });

  it('prefers the remote MCP tool router when MCP env is configured', async () => {
    const execute = vi.fn().mockResolvedValue({ items: [] });
    const close = vi.fn().mockResolvedValue(undefined);
    const tools = vi.fn().mockResolvedValue({
      COMPOSIO_SEARCH_TOOLS: {
        description: 'Search Composio tools',
        execute,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      },
    });

    mcpState.createMCPClient.mockResolvedValue({
      close,
      tools,
    });

    const resolution = await getComposioTools({
      env: {
        COMPOSIO_MCP_API_KEY: 'mcp-key',
        COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
      } as any,
      providerName: 'OpenAI',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: 'use composio to check github',
    });

    expect(mcpState.createMCPClient).toHaveBeenCalledWith({
      transport: {
        type: 'http',
        url: 'https://backend.composio.dev/tool_router/trs_test/mcp',
        headers: {
          'x-api-key': 'mcp-key',
        },
      },
    });
    expect(composioState.createComposioSessionFromApiKey).not.toHaveBeenCalled();
    expect(resolution.status).toBe('available');
    expect(resolution.tools.COMPOSIO_SEARCH_TOOLS.parameters).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    });

    await resolution.cleanup?.();
    expect(close).toHaveBeenCalled();
  });

  it('returns a resolution failure with the real MCP tools error message', async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    mcpState.createMCPClient.mockResolvedValue({
      close,
      tools: vi.fn().mockRejectedValue(new Error('No connected accounts found for toolkit gmail')),
    });

    const resolution = await getComposioTools({
      env: {
        COMPOSIO_MCP_API_KEY: 'mcp-key',
        COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
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
    expect(close).toHaveBeenCalled();
  });
});

describe('Composio tool normalization and confirmation safety', () => {
  afterEach(() => {
    composioState.createComposioSessionFromApiKey.mockReset();
    mcpState.createMCPClient.mockReset();
  });

  const mcpEnv = {
    COMPOSIO_MCP_API_KEY: 'mcp-key',
    COMPOSIO_MCP_SERVER_URL: 'https://backend.composio.dev/tool_router/trs_test/mcp',
  } as any;

  it('normalizes Composio Vercel inputSchema to AI SDK v4 parameters while preserving execute', () => {
    const execute = vi.fn();
    const tool = {
      description: 'Search tools',
      execute,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      },
    };

    expect(normalizeComposioToolForAiSdkV4(tool)).toEqual({
      ...tool,
      parameters: tool.inputSchema,
    });
  });

  it('classifies write-style Composio tool names conservatively', () => {
    expect(isLikelyMutatingComposioTool('GITHUB_CREATE_ISSUE')).toBe(true);
    expect(isLikelyMutatingComposioTool('GITHUB_STAR_REPO')).toBe(true);
    expect(isLikelyMutatingComposioTool('GMAIL_SEND_EMAIL')).toBe(true);
    expect(isLikelyMutatingComposioTool('GMAIL_FETCH_EMAILS', 'Fetch email messages')).toBe(false);
    expect(isLikelyMutatingComposioTool('COMPOSIO_SEARCH_TOOLS')).toBe(false);
  });

  it('lets read tools execute immediately', async () => {
    const execute = vi.fn().mockResolvedValue({ items: [] });

    mcpState.createMCPClient.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      tools: vi.fn().mockResolvedValue({
        COMPOSIO_SEARCH_TOOLS: {
          description: 'Search Composio tools',
          execute,
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      }),
    });

    const resolution = await getComposioTools({
      env: mcpEnv,
      providerName: 'Google',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: 'summarize my emails from today',
    });

    await expect(resolution.tools.COMPOSIO_SEARCH_TOOLS.execute({ query: 'gmail' })).resolves.toEqual({ items: [] });
    expect(execute).toHaveBeenCalledWith({ query: 'gmail' });
    expect(resolution.tools.COMPOSIO_SEARCH_TOOLS.parameters).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    });
  });

  it('requires confirmation before executing write tools', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });

    mcpState.createMCPClient.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      tools: vi.fn().mockResolvedValue({
        GITHUB_CREATE_ISSUE: {
          description: 'Create an issue',
          execute,
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
            },
          },
        },
      }),
    });

    const resolution = await getComposioTools({
      env: {
        ...mcpEnv,
        COMPOSIO_CONFIRMATION_SECRET: 'test-confirmation-secret',
      } as any,
      providerName: 'Google',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: 'create a GitHub issue in my repo',
    });

    const result = await resolution.tools.GITHUB_CREATE_ISSUE.execute({ title: 'Bug' });

    expect(result).toMatchObject({
      message: 'Confirm this external action before I run GITHUB_CREATE_ISSUE.',
      status: 'confirmation_required',
      toolName: 'GITHUB_CREATE_ISSUE',
    });
    expect(result.confirmationToken).toEqual(expect.any(String));
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes a write tool when the latest prompt includes a valid matching confirmation token', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const token = await createComposioConfirmationToken({
      args: { title: 'Bug' },
      secret: 'test-confirmation-secret',
      toolName: 'GITHUB_CREATE_ISSUE',
      userId: 'user_123',
    });

    mcpState.createMCPClient.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      tools: vi.fn().mockResolvedValue({
        GITHUB_CREATE_ISSUE: {
          description: 'Create an issue',
          execute,
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
            },
          },
        },
      }),
    });

    const resolution = await getComposioTools({
      env: {
        ...mcpEnv,
        COMPOSIO_CONFIRMATION_SECRET: 'test-confirmation-secret',
      } as any,
      providerName: 'Google',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: `I confirm the external action. Use confirmation token ${token}.`,
    });

    await expect(
      resolution.tools.GITHUB_CREATE_ISSUE.execute({
        confirmed: true,
        confirmationToken: token,
        title: 'Bug',
      }),
    ).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith({ title: 'Bug' }, undefined);
  });

  it('rejects invalid, expired, or mismatched confirmation tokens without calling Composio', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const mismatchedToken = await createComposioConfirmationToken({
      args: { title: 'Different bug' },
      secret: 'test-confirmation-secret',
      toolName: 'GITHUB_CREATE_ISSUE',
      userId: 'user_123',
    });

    mcpState.createMCPClient.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      tools: vi.fn().mockResolvedValue({
        GITHUB_CREATE_ISSUE: {
          description: 'Create an issue',
          execute,
        },
      }),
    });

    const resolution = await getComposioTools({
      env: {
        ...mcpEnv,
        COMPOSIO_CONFIRMATION_SECRET: 'test-confirmation-secret',
      } as any,
      providerName: 'Google',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: `Use confirmation token ${mismatchedToken}.`,
    });

    await expect(resolution.tools.GITHUB_CREATE_ISSUE.execute({ title: 'Bug' })).resolves.toMatchObject({
      status: 'confirmation_required',
    });

    const expiredToken = await createComposioConfirmationToken({
      args: { title: 'Bug' },
      expiresAt: new Date(Date.now() - 60_000),
      secret: 'test-confirmation-secret',
      toolName: 'GITHUB_CREATE_ISSUE',
      userId: 'user_123',
    });

    const expiredResolution = await getComposioTools({
      env: {
        ...mcpEnv,
        COMPOSIO_CONFIRMATION_SECRET: 'test-confirmation-secret',
      } as any,
      providerName: 'Google',
      user: { isAuthenticated: true, uid: 'user_123' },
      userPrompt: `Use confirmation token ${expiredToken}.`,
    });

    await expect(expiredResolution.tools.GITHUB_CREATE_ISSUE.execute({ title: 'Bug' })).resolves.toMatchObject({
      status: 'confirmation_required',
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
