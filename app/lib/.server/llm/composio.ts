import {
  createComposioSessionFromApiKey,
  resolveComposioApiKeyFromEnv,
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

function normalizePromptForToolkitMatching(userPrompt?: string) {
  return (userPrompt || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function inferToolkitSlugsFromPrompt(userPrompt?: string) {
  const normalizedPrompt = normalizePromptForToolkitMatching(userPrompt);

  if (!normalizedPrompt) {
    return [];
  }

  const toolkitAliases: Record<string, string[]> = {
    gmail: ['gmail', 'googlemail', 'email', 'emails', 'inbox', 'mailbox'],
    github: ['github', 'repo', 'repository', 'pullrequest', 'pullrequests', 'issue', 'issues'],
    googlecalendar: ['calendar', 'calendars', 'meeting', 'meetings', 'schedule', 'scheduling'],
    googlesheets: ['sheet', 'sheets', 'spreadsheet', 'spreadsheets'],
    google_docs: ['doc', 'docs', 'document', 'documents'],
    notion: ['notion', 'workspace', 'wiki'],
    slack: ['slack', 'channel', 'channels'],
    stripe: ['stripe', 'checkout', 'payment', 'payments', 'invoice', 'invoices', 'billing'],
    linear: ['linear', 'ticket', 'tickets', 'project', 'projects'],
    gmail_schedule: [],
  };

  return Object.entries(toolkitAliases)
    .filter(([, aliases]) => aliases.some((alias) => normalizedPrompt.includes(alias)))
    .map(([toolkitSlug]) => toolkitSlug);
}

async function buildOfficialComposioTools({
  apiKey,
  userId,
  userPrompt,
}: {
  apiKey: string;
  userId: string;
  userPrompt?: string;
}) {
  const inferredToolkits = inferToolkitSlugsFromPrompt(userPrompt);
  console.info('[llm.composio] creating tool session', {
    inferredToolkits,
    userId,
  });
  const session = await createComposioSessionFromApiKey(apiKey, userId, {
    manageConnections: true,
    ...(inferredToolkits.length > 0 ? { toolkits: inferredToolkits } : {}),
  });

  return session.tools();
}

export async function getComposioTools(options: ComposioToolRuntimeOptions): Promise<ComposioToolResolution> {
  const composioUserId = getResolvedComposioUserId(options.user);
  const disabledReason = getDisabledReason(options);
  const hasIdentity = Boolean(composioUserId);

  if (disabledReason || !composioUserId) {
    console.info('[llm.composio] tools unavailable', {
      disabledReason: disabledReason || 'missing_identity',
      hasIdentity,
      providerName: options.providerName,
    });

    return {
      configured: disabledReason !== 'disabled' && disabledReason !== 'missing_api_key',
      hasIdentity,
      resolvedUserId: composioUserId,
      status: disabledReason || 'missing_identity',
      tools: {},
    };
  }

  try {
    const apiKey = getComposioApiKey(options.env)!;
    const tools = await buildOfficialComposioTools({
      apiKey,
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
