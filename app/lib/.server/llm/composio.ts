import { createComposioSessionFromApiKey, resolveComposioApiKeyFromEnv } from '~/lib/.server/composio';

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
    | 'missing_api_key'
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

function getComposioApiKey(env: ComposioToolRuntimeOptions['env']) {
  return resolveComposioApiKeyFromEnv(env as Record<string, string | undefined> | undefined);
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

  if (!getComposioApiKey(env)) {
    return 'missing_api_key' as const;
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
  return !['disabled', 'missing_api_key'].includes(status);
}

export async function getComposioTools(options: ComposioToolRuntimeOptions): Promise<ComposioToolResolution> {
  const composioUserId = getResolvedComposioUserId(options.user);
  const disabledReason = getDisabledReason(options);
  const hasIdentity = Boolean(composioUserId);
  const hasApiKey = Boolean(getComposioApiKey(options.env));

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
    const apiKey = getComposioApiKey(options.env)!;
    console.info('[llm.composio] resolving tools', {
      hasApiKey: true,
      providerName: options.providerName,
      requestOrigin: options.requestOrigin,
      resolvedUserId: composioUserId,
      userPrompt: options.userPrompt,
    });

    const session = await createComposioSessionFromApiKey(apiKey, composioUserId);

    console.info('[llm.composio] session created', {
      userId: composioUserId,
    });

    const tools = (await session.tools()) || {};
    const toolNames = Object.keys(tools || {});

    console.info('[llm.composio] session tools resolved', {
      toolCount: toolNames.length,
      toolNames: toolNames.slice(0, 10),
      userId: composioUserId,
    });

    return {
      configured: true,
      hasIdentity: true,
      resolvedUserId: composioUserId,
      status: 'available',
      tools,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to resolve Composio tools.';
    console.warn('[llm.composio] session tool resolution failed', {
      errorMessage,
      hasApiKey,
      providerName: options.providerName,
      requestOrigin: options.requestOrigin,
      resolvedUserId: composioUserId,
      userPrompt: options.userPrompt,
    });
    console.warn('Composio tools unavailable:', error);

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
