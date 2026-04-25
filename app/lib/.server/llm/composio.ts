import { createMCPClient } from '@ai-sdk/mcp';
import { normalizeServerEnvValue } from '~/lib/server-env';

type ComposioUserContext = {
  composioUserId?: string;
  email?: string;
  hasComposioIdentity?: boolean;
  isAuthenticated: boolean;
  isSignedIn?: boolean;
  uid?: string;
};

type ComposioToolRuntimeOptions = {
  env?: Record<string, string | undefined> | Env;
  providerName: string;
  requestOrigin?: string;
  user?: ComposioUserContext;
  userPrompt?: string;
};

export type ComposioToolResolution = {
  cleanup?: () => Promise<void>;
  configured: boolean;
  errorMessage?: string;
  hasIdentity: boolean;
  resolvedUserId?: string;
  status:
    | 'available'
    | 'disabled'
    | 'missing_mcp_url'
    | 'missing_mcp_api_key'
    | 'unsupported_provider'
    | 'missing_identity'
    | 'resolution_failed';
  tools: Record<string, any>;
};

const TOOL_CAPABLE_PROVIDERS = new Set([
  'Anthropic',
  'Fireworks',
  'Google',
  'Groq',
  'Mistral',
  'OpenAI',
  'OpenAILike',
  'OpenRouter',
  'Together',
  'XAI',
]);

function getComposioEnabled(env: ComposioToolRuntimeOptions['env']) {
  const raw =
    (env as Record<string, string | undefined> | undefined)?.FEATURE_COMPOSIO_TOOLS ??
    process.env.FEATURE_COMPOSIO_TOOLS;

  if (raw == null || raw === '') {
    return true;
  }

  return raw !== '0' && raw.toLowerCase() !== 'false';
}

function normalizeRuntimeEnvValue(value: unknown) {
  return normalizeServerEnvValue(typeof value === 'string' ? value : undefined);
}

function getComposioMcpApiKey(env: ComposioToolRuntimeOptions['env']) {
  return (
    normalizeRuntimeEnvValue((env as Record<string, string | undefined> | undefined)?.COMPOSIO_MCP_API_KEY) ??
    normalizeRuntimeEnvValue(process.env.COMPOSIO_MCP_API_KEY) ??
    null
  );
}

function getComposioMcpUrl(env: ComposioToolRuntimeOptions['env']) {
  return (
    normalizeRuntimeEnvValue((env as Record<string, string | undefined> | undefined)?.COMPOSIO_MCP_URL) ??
    normalizeRuntimeEnvValue(process.env.COMPOSIO_MCP_URL) ??
    null
  );
}

function getResolvedComposioUserId(user?: ComposioUserContext) {
  if (!user?.isAuthenticated) {
    return undefined;
  }

  return user.uid || user.composioUserId || undefined;
}

function getDisabledReason({ env, providerName, user }: ComposioToolRuntimeOptions) {
  if (!getComposioEnabled(env)) {
    return 'disabled' as const;
  }

  if (!getComposioMcpUrl(env)) {
    return 'missing_mcp_url' as const;
  }

  if (!getComposioMcpApiKey(env)) {
    return 'missing_mcp_api_key' as const;
  }

  if (!TOOL_CAPABLE_PROVIDERS.has(providerName)) {
    return 'unsupported_provider' as const;
  }

  if (!getResolvedComposioUserId(user)) {
    return 'missing_identity' as const;
  }

  return null;
}

export function shouldEnableComposioTools({ env, providerName, user }: ComposioToolRuntimeOptions) {
  return getDisabledReason({ env, providerName, user }) == null;
}

function isComposioRuntimeConfigured(status: ComposioToolResolution['status']) {
  return !['disabled', 'missing_mcp_url', 'missing_mcp_api_key'].includes(status);
}

export async function getComposioTools(options: ComposioToolRuntimeOptions): Promise<ComposioToolResolution> {
  const composioUserId = getResolvedComposioUserId(options.user);
  const disabledReason = getDisabledReason(options);
  const hasIdentity = Boolean(composioUserId);
  const hasApiKey = Boolean(getComposioMcpApiKey(options.env));
  const mcpUrl = getComposioMcpUrl(options.env);
  let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;
  let cleanedUp = false;

  if (disabledReason || !composioUserId) {
    console.info('[llm.composio] tools unavailable', {
      disabledReason: disabledReason || 'missing_identity',
      hasApiKey,
      hasIdentity,
      providerName: options.providerName,
      resolvedUserId: composioUserId,
    });

    return {
      configured: isComposioRuntimeConfigured(disabledReason || 'disabled'),
      hasIdentity,
      resolvedUserId: composioUserId,
      status: disabledReason || 'missing_identity',
      tools: {},
    };
  }

  try {
    const apiKey = getComposioMcpApiKey(options.env)!;
    const resolvedMcpUrl = mcpUrl!;
    console.info('[llm.composio] resolving tools', {
      hasApiKey: true,
      mcpUrl: resolvedMcpUrl,
      providerName: options.providerName,
      requestOrigin: options.requestOrigin,
      resolvedUserId: composioUserId,
      userPrompt: options.userPrompt,
    });
    client = await createMCPClient({
      name: 'cryzo-composio-mcp',
      transport: {
        type: 'http',
        url: resolvedMcpUrl,
        headers: {
          'x-api-key': apiKey,
        },
      },
    });

    console.info('[llm.composio] mcp client created', {
      mcpUrl: resolvedMcpUrl,
      serverInfo: client.serverInfo,
      userId: composioUserId,
    });

    const tools = await client.tools();
    const toolNames = Object.keys(tools || {});

    console.info('[llm.composio] mcp tools resolved', {
      toolCount: toolNames.length,
      toolNames: toolNames.slice(0, 10),
      userId: composioUserId,
    });

    const cleanup = async () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      const activeClient = client;

      if (!activeClient) {
        return;
      }

      try {
        await activeClient.close();
        console.info('[llm.composio] mcp client closed', {
          mcpUrl: resolvedMcpUrl,
          userId: composioUserId,
        });
      } catch (closeError) {
        console.warn('[llm.composio] failed to close mcp client', {
          errorMessage: closeError instanceof Error ? closeError.message : String(closeError),
          mcpUrl: resolvedMcpUrl,
          userId: composioUserId,
        });
      }
    };

    return {
      cleanup,
      configured: true,
      hasIdentity: true,
      resolvedUserId: composioUserId,
      status: 'available',
      tools,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to resolve Composio tools.';
    console.warn('[llm.composio] mcp tool resolution failed', {
      errorMessage,
      hasApiKey,
      providerName: options.providerName,
      requestOrigin: options.requestOrigin,
      resolvedUserId: composioUserId,
      userPrompt: options.userPrompt,
    });
    console.warn('Composio tools unavailable:', error);

    if (client && !cleanedUp) {
      cleanedUp = true;

      try {
        await client.close();
        console.info('[llm.composio] mcp client closed after resolution failure', {
          mcpUrl: mcpUrl!,
          userId: composioUserId,
        });
      } catch (closeError) {
        console.warn('[llm.composio] failed to close mcp client after resolution failure', {
          errorMessage: closeError instanceof Error ? closeError.message : String(closeError),
          mcpUrl: mcpUrl!,
          userId: composioUserId,
        });
      }
    }

    return {
      configured: true,
      errorMessage,
      hasIdentity: true,
      resolvedUserId: composioUserId,
      status: 'resolution_failed',
      tools: {},
    };
  }
}

export function __resetPendingComposioConfirmationsForTests() {
  return undefined;
}
