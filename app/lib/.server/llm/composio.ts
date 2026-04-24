import type { Tool as ComposioTool } from '@composio/core';
import { APPROVED_APP_CONNECTOR_SLUGS, APPS_VIEW_QUERY_KEY, APPS_VIEW_QUERY_VALUE, isApprovedAppToolkit } from '~/components/apps/apps.constants';
import {
  createComposioAgentClientFromApiKey,
  createComposioConnectionRequest,
  extractComposioRedirectUrl,
  isComposioAuthError,
  resolveComposioApiKeyFromEnv,
  type ComposioAgentClient,
} from '~/lib/.server/composio';

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

type ComposioToolkitRef = {
  logo?: string;
  name?: string;
  slug?: string;
};

type ApprovedComposioTool = ComposioTool & {
  toolkit?: ComposioToolkitRef;
};

export type ComposioToolResolution = {
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

const TOOL_LIMIT = 12;

function getComposioEnabled(env: ComposioToolRuntimeOptions['env']) {
  const raw = (env as Record<string, string | undefined> | undefined)?.FEATURE_COMPOSIO_TOOLS ?? process.env.FEATURE_COMPOSIO_TOOLS;

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

function normalizePromptForToolkitMatching(userPrompt?: string) {
  return (userPrompt || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function inferToolkitSlugsFromPrompt(userPrompt?: string) {
  const normalizedPrompt = normalizePromptForToolkitMatching(userPrompt);

  if (!normalizedPrompt) {
    return [];
  }

  return APPROVED_APP_CONNECTOR_SLUGS.filter((toolkitSlug) => normalizedPrompt.includes(toolkitSlug));
}

async function getRelevantRawTools(composio: ComposioAgentClient, userPrompt?: string) {
  const inferredToolkits = inferToolkitSlugsFromPrompt(userPrompt);
  const normalizedPrompt = userPrompt?.trim();
  const searchFilters = normalizedPrompt
    ? {
        limit: TOOL_LIMIT,
        search: normalizedPrompt,
        toolkits: inferredToolkits.length > 0 ? inferredToolkits : [...APPROVED_APP_CONNECTOR_SLUGS],
      }
    : {
        limit: TOOL_LIMIT,
        toolkits: inferredToolkits.length > 0 ? inferredToolkits : [...APPROVED_APP_CONNECTOR_SLUGS],
      };
  let rawTools = (await composio.tools.getRawComposioTools(searchFilters)) as ApprovedComposioTool[];

  if (rawTools.length === 0 && normalizedPrompt && inferredToolkits.length > 0) {
    rawTools = (await composio.tools.getRawComposioTools({
      limit: TOOL_LIMIT,
      search: normalizedPrompt,
      toolkits: [...APPROVED_APP_CONNECTOR_SLUGS],
    })) as ApprovedComposioTool[];
  }

  if (rawTools.length === 0 && inferredToolkits.length > 0) {
    rawTools = (await composio.tools.getRawComposioTools({
      limit: TOOL_LIMIT,
      toolkits: inferredToolkits,
    })) as ApprovedComposioTool[];
  }

  return rawTools.filter((tool: ApprovedComposioTool) => Boolean(tool.toolkit) && isApprovedAppToolkit(tool.toolkit!));
}

function getToolResultPayload(rawResult: any) {
  return rawResult?.data ?? rawResult;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'Composio tool failed.';
}

async function createAuthRequiredResult({
  composio,
  requestOrigin,
  toolkit,
  userId,
}: {
  composio: ComposioAgentClient;
  requestOrigin?: string;
  toolkit?: { name?: string; slug?: string };
  userId: string;
}) {
  const toolkitName = toolkit?.name || toolkit?.slug || 'this app';
  const callbackUrl = requestOrigin ? `${requestOrigin}/?${APPS_VIEW_QUERY_KEY}=${APPS_VIEW_QUERY_VALUE}` : undefined;
  let authUrl: string | undefined;

  if (toolkit?.slug) {
    try {
      const connectionRequest = await createComposioConnectionRequest(composio, userId, toolkit.slug, {
        callbackUrl,
      });
      authUrl = extractComposioRedirectUrl(connectionRequest);
    } catch (error) {
      authUrl = extractComposioRedirectUrl(error);
    }
  }

  return {
    authUrl: authUrl || callbackUrl,
    message: authUrl
      ? `Authentication is required for ${toolkitName}. Open the auth link, connect the app, then retry the request.`
      : `Authentication is required for ${toolkitName}. Open the Apps tab, connect the app, then retry the request.`,
    status: 'auth_required' as const,
    toolkit,
  };
}

async function buildOfficialComposioTools({
  composio,
  requestOrigin,
  userId,
  userPrompt,
}: {
  composio: ComposioAgentClient;
  requestOrigin?: string;
  userId: string;
  userPrompt?: string;
}) {
  const rawTools = await getRelevantRawTools(composio, userPrompt);

  if (rawTools.length === 0) {
    return {};
  }

  const toolsBySlug = new Map<string, ApprovedComposioTool>(rawTools.map((tool: ApprovedComposioTool) => [tool.slug, tool]));

  return composio.provider.wrapTools(rawTools, async (toolSlug: string, input: Record<string, unknown>) => {
    const resolvedTool = toolsBySlug.get(toolSlug);

    try {
      const rawResult = await composio.tools.execute(toolSlug, {
        arguments: input,
        userId,
      });

      return getToolResultPayload(rawResult);
    } catch (error) {
      if (isComposioAuthError(error)) {
        return createAuthRequiredResult({
          composio,
          requestOrigin,
          toolkit: resolvedTool?.toolkit,
          userId,
        });
      }

      return {
        message: getErrorMessage(error),
        status: 'error' as const,
        toolkit: resolvedTool?.toolkit,
      };
    }
  });
}

export async function getComposioTools(options: ComposioToolRuntimeOptions): Promise<ComposioToolResolution> {
  const composioUserId = getResolvedComposioUserId(options.user);
  const disabledReason = getDisabledReason(options);
  const hasIdentity = Boolean(composioUserId);

  if (disabledReason || !composioUserId) {
    return {
      configured: disabledReason !== 'disabled' && disabledReason !== 'missing_api_key',
      hasIdentity,
      resolvedUserId: composioUserId,
      status: disabledReason || 'missing_identity',
      tools: {},
    };
  }

  try {
    const composio = createComposioAgentClientFromApiKey(getComposioApiKey(options.env)!);
    const tools = await buildOfficialComposioTools({
      composio,
      requestOrigin: options.requestOrigin,
      userId: composioUserId,
      userPrompt: options.userPrompt,
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
