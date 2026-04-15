import { generateId, tool } from 'ai';
import { z } from 'zod';
import { APPS_VIEW_QUERY_KEY, APPS_VIEW_QUERY_VALUE, isApprovedAppToolkit } from '~/components/apps/apps.constants';
import {
  createComposioClientFromApiKey,
  extractComposioRedirectUrl,
  resolveComposioManagedAuthConfigId,
  type ComposioClient,
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

type SearchResultItem = {
  connectedAccountId?: string;
  description: string;
  name: string;
  noAuth: boolean;
  slug: string;
  toolkit: {
    name: string;
    slug: string;
  };
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

const SEARCH_TOOL_NAME = 'COMPOSIO_SEARCH_TOOLS';
const EXECUTE_TOOL_NAME = 'COMPOSIO_EXECUTE_TOOL';
const COMPOSIO_WRITE_VERBS = [
  'add',
  'archive',
  'assign',
  'comment',
  'create',
  'delete',
  'edit',
  'invite',
  'move',
  'patch',
  'post',
  'publish',
  'remove',
  'rename',
  'reply',
  'send',
  'share',
  'star',
  'submit',
  'trigger',
  'unlink',
  'unstar',
  'update',
  'upload',
  'write',
];

type PendingConfirmation = {
  args: unknown;
  createdAt: number;
  toolName: string;
  userId: string;
};

const PENDING_CONFIRMATIONS = new Map<string, PendingConfirmation>();
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

function getEnvValue(env: ComposioToolRuntimeOptions['env'], key: string) {
  const envMap = env as Record<string, string | undefined> | undefined;
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;

  return envMap?.[key] || processEnv?.[key];
}

function getComposioApiKey(env: ComposioToolRuntimeOptions['env']) {
  return getEnvValue(env, 'COMPOSIO_API_KEY');
}

function getComposioEnabled(env: ComposioToolRuntimeOptions['env']) {
  const raw = getEnvValue(env, 'FEATURE_COMPOSIO_TOOLS');

  if (raw == null || raw === '') {
    return true;
  }

  return raw !== '0' && raw.toLowerCase() !== 'false';
}

function getResolvedComposioUserId(user?: ComposioUserContext) {
  return user?.composioUserId || user?.uid || undefined;
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

function isWriteLikeTool(toolName: string) {
  const normalized = toolName.toLowerCase();

  return COMPOSIO_WRITE_VERBS.some(
    (verb) => normalized.includes(`_${verb}_`) || normalized.endsWith(`_${verb}`) || normalized.includes(verb),
  );
}

function cleanupExpiredConfirmations() {
  const now = Date.now();

  for (const [token, pending] of PENDING_CONFIRMATIONS.entries()) {
    if (now - pending.createdAt > CONFIRMATION_TTL_MS) {
      PENDING_CONFIRMATIONS.delete(token);
    }
  }
}

function createPendingConfirmation(userId: string, toolName: string, args: unknown) {
  cleanupExpiredConfirmations();
  const confirmationToken = generateId();
  PENDING_CONFIRMATIONS.set(confirmationToken, {
    args,
    createdAt: Date.now(),
    toolName,
    userId,
  });

  return confirmationToken;
}

function consumePendingConfirmation(userId: string, toolName: string, confirmationToken: string, args: unknown) {
  cleanupExpiredConfirmations();
  const pending = PENDING_CONFIRMATIONS.get(confirmationToken);

  if (!pending) {
    throw new Error('Confirmation token is missing or expired.');
  }

  if (pending.userId !== userId || pending.toolName !== toolName) {
    throw new Error('Confirmation token does not match the requested action.');
  }

  if (JSON.stringify(pending.args) !== JSON.stringify(args)) {
    throw new Error('Confirmed action does not match the pending request.');
  }

  PENDING_CONFIRMATIONS.delete(confirmationToken);
}

function normalizeComposioError(error: unknown, toolName: string) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Composio tool failed.';
  const authUrl = extractComposioRedirectUrl(error) || extractComposioRedirectUrl({ message });
  const lower = message.toLowerCase();

  if (authUrl || lower.includes('oauth') || lower.includes('authenticate') || lower.includes('authorization')) {
    return {
      authUrl,
      message,
      status: 'auth_required' as const,
      toolName,
    };
  }

  return {
    message,
    status: 'error' as const,
    toolName,
  };
}

function normalizeComposioResult(toolName: string, result: unknown) {
  const authUrl = extractComposioRedirectUrl(result);

  if (authUrl) {
    return {
      authUrl,
      output: result,
      status: 'auth_required' as const,
      toolName,
    };
  }

  return {
    output: result,
    status: 'completed' as const,
    toolName,
  };
}

async function loadActiveAccountsByToolkit(composio: ComposioClient, userId: string) {
  const connectedAccounts = await composio.connectedAccounts.list({
    limit: 200,
    statuses: ['ACTIVE'],
    userIds: [userId],
  });

  const accountsByToolkitSlug = new Map<string, string[]>();

  for (const account of connectedAccounts.items) {
    const toolkitSlug = account.toolkit?.slug;

    if (!toolkitSlug) {
      continue;
    }

    const existing = accountsByToolkitSlug.get(toolkitSlug) || [];
    existing.push(account.id);
    accountsByToolkitSlug.set(toolkitSlug, existing);
  }

  return accountsByToolkitSlug;
}

function buildSearchResultItems(
  items: Array<any>,
  activeAccountsByToolkit: Map<string, string[]>,
  limit: number,
): SearchResultItem[] {
  return items
    .filter((item) => isApprovedAppToolkit(item?.toolkit))
    .slice(0, limit)
    .map((item) => ({
      connectedAccountId: activeAccountsByToolkit.get(item.toolkit.slug)?.[0],
      description: item.description || `${item.name} via ${item.toolkit.name}`,
      name: item.name,
      noAuth: item.noAuth === true,
      slug: item.slug,
      toolkit: {
        name: item.toolkit.name,
        slug: item.toolkit.slug,
      },
    }));
}

async function createAuthLinkForToolkit(
  composio: ComposioClient,
  userId: string,
  toolkitSlug: string,
  requestOrigin?: string,
) {
  if (!requestOrigin) {
    return undefined;
  }

  const authConfigId = await resolveComposioManagedAuthConfigId(composio, toolkitSlug);

  if (!authConfigId) {
    return undefined;
  }

  const callbackUrl = `${requestOrigin}/?${APPS_VIEW_QUERY_KEY}=${APPS_VIEW_QUERY_VALUE}`;
  const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId, {
    callbackUrl,
  });

  return extractComposioRedirectUrl(connectionRequest);
}

function createComposioSearchTool(composio: ComposioClient, userId: string, activeAccountsByToolkit: Map<string, string[]>) {
  return tool({
    description:
      'Search Composio tools across connected apps like Gmail, Google Calendar, Slack, Notion, GitHub, and others. Use this first before executing a connected-app action.',
    parameters: z.object({
      limit: z.number().int().min(1).max(20).optional().default(10),
      query: z.string().min(2).describe('What app action you want to find, for example "read latest Gmail emails".'),
      toolkitSlug: z.string().optional().describe('Optional toolkit slug such as gmail, googlecalendar, slack, notion, or github.'),
    }),
    execute: async ({ limit, query, toolkitSlug }) => {
      const toolList = await composio.tools.getRawComposioTools({
        limit: Math.min(limit * 3, 60),
        search: query,
        ...(toolkitSlug ? { toolkits: [toolkitSlug] } : {}),
      });
      const items = buildSearchResultItems(toolList, activeAccountsByToolkit, limit);

      return {
        items,
        query,
        status: 'completed' as const,
        toolName: SEARCH_TOOL_NAME,
        userId,
      };
    },
  });
}

function createComposioExecuteTool(
  composio: ComposioClient,
  userId: string,
  activeAccountsByToolkit: Map<string, string[]>,
  requestOrigin?: string,
) {
  return tool({
    description:
      'Execute a Composio app action after discovering the correct tool. If the app is not connected yet, this returns an auth link when available.',
    parameters: z
      .object({
        arguments: z
          .record(z.string(), z.any())
          .optional()
          .describe('Structured arguments for the selected tool. Use this for tool execution whenever possible.'),
        connectedAccountId: z
          .string()
          .optional()
          .describe('Optional connected account ID to force a specific app connection if multiple are available.'),
        text: z
          .string()
          .optional()
          .describe('Optional natural-language execution request when structured arguments are not known yet.'),
        toolSlug: z.string().min(1).describe('The Composio tool slug returned by COMPOSIO_SEARCH_TOOLS.'),
        version: z.string().optional().describe('Optional tool version.'),
        confirmed: z
          .boolean()
          .optional()
          .default(false)
          .describe('Only set to true after the user explicitly confirms a write action.'),
        confirmationToken: z
          .string()
          .optional()
          .describe('Required when retrying a previously pending write action after user confirmation.'),
      })
      .refine((value) => Boolean(value.text || value.arguments), {
        message: 'Provide either text or arguments for the Composio tool execution.',
        path: ['arguments'],
      }),
    execute: async ({ arguments: toolArguments, connectedAccountId, confirmationToken, confirmed, text, toolSlug, version }) => {
      const writeLike = isWriteLikeTool(toolSlug);
      const executionPayload = {
        arguments: toolArguments,
        connectedAccountId,
        text,
        toolSlug,
        version,
      };

      if (writeLike) {
        if (!confirmed) {
          const pendingToken = createPendingConfirmation(userId, toolSlug, executionPayload);

          return {
            actionKind: 'write',
            confirmationToken: pendingToken,
            input: executionPayload,
            message: `Confirmation required before running ${toolSlug}.`,
            status: 'confirmation_required' as const,
            toolName: toolSlug,
          };
        }

        if (!confirmationToken) {
          throw new Error(`Confirmation token is required for ${toolSlug}.`);
        }

        consumePendingConfirmation(userId, toolSlug, confirmationToken, executionPayload);
      }

      const toolDefinition = await composio.tools.getRawComposioToolBySlug(toolSlug);
      const toolkitSlug = toolDefinition.toolkit.slug;
      const requiresAuth = toolDefinition.noAuth !== true;
      const resolvedConnectedAccountId =
        connectedAccountId || activeAccountsByToolkit.get(toolkitSlug)?.[0] || undefined;

      if (requiresAuth && !resolvedConnectedAccountId) {
        const authUrl = await createAuthLinkForToolkit(composio, userId, toolkitSlug, requestOrigin).catch(() => undefined);

        return {
          actionKind: writeLike ? 'write' : 'read',
          authUrl,
          input: executionPayload,
          message: authUrl
            ? `Authentication is required for ${toolDefinition.toolkit.name}. Open the auth link, connect the app, then retry the action.`
            : `Authentication is required for ${toolDefinition.toolkit.name}. Open the Apps tab to connect it, then retry the action.`,
          status: 'auth_required' as const,
          toolkit: toolDefinition.toolkit,
          toolName: toolSlug,
        };
      }

      try {
        const rawResult = await composio.tools.execute(toolSlug, {
          arguments: toolArguments,
          connectedAccountId: resolvedConnectedAccountId,
          text,
          userId: userId,
          version,
        });

        return {
          ...normalizeComposioResult(toolSlug, rawResult.data),
          actionKind: writeLike ? 'write' : 'read',
          connectedAccountId: resolvedConnectedAccountId,
          input: executionPayload,
          toolkit: toolDefinition.toolkit,
        };
      } catch (error) {
        return {
          ...normalizeComposioError(error, toolSlug),
          actionKind: writeLike ? 'write' : 'read',
          input: executionPayload,
          toolkit: toolDefinition.toolkit,
        };
      }
    },
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
    const composio = createComposioClientFromApiKey(getComposioApiKey(options.env)!);
    const activeAccountsByToolkit = await loadActiveAccountsByToolkit(composio, composioUserId);

    return {
      configured: true,
      hasIdentity: true,
      resolvedUserId: composioUserId,
      status: 'available',
      tools: {
        [SEARCH_TOOL_NAME]: createComposioSearchTool(composio, composioUserId, activeAccountsByToolkit),
        [EXECUTE_TOOL_NAME]: createComposioExecuteTool(
          composio,
          composioUserId,
          activeAccountsByToolkit,
          options.requestOrigin,
        ),
      },
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
  PENDING_CONFIRMATIONS.clear();
}
