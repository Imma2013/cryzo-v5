import { resolveComposioApiKeyFromEnv } from '~/lib/.server/composio';
import { createMCPClient } from '@ai-sdk/mcp';
import { SignJWT, jwtVerify } from 'jose';

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

type ComposioConfirmationTokenInput = {
  args: unknown;
  expiresAt?: Date;
  secret: string;
  toolName: string;
  userId: string;
};

type ComposioConfirmationVerificationInput = ComposioConfirmationTokenInput & {
  token: string;
};

type ComposioToolConfirmationContext = {
  confirmationSecret: string;
  toolName: string;
  userId: string;
  userPrompt?: string;
};

type ComposioMcpConfig = {
  apiKey: string;
  serverUrl: string;
};

const COMPOSIO_MCP_SERVER_URL_KEYS = ['COMPOSIO_MCP_SERVER_URL', 'COMPOSIO_MCP_URL'] as const;
const COMPOSIO_MCP_API_KEY = 'COMPOSIO_MCP_API_KEY';

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

function getRuntimeEnvValue(env: ComposioToolRuntimeOptions['env'], key: string) {
  const envValue = (env as Record<string, string | undefined> | undefined)?.[key];
  const processValue = typeof process !== 'undefined' ? process.env[key] : undefined;
  return (envValue || processValue)?.trim() || undefined;
}

function getComposioMcpConfig(env: ComposioToolRuntimeOptions['env']): ComposioMcpConfig | null {
  const serverUrl = COMPOSIO_MCP_SERVER_URL_KEYS.map((key) => getRuntimeEnvValue(env, key)).find(Boolean);
  const apiKey = getRuntimeEnvValue(env, COMPOSIO_MCP_API_KEY);

  if (!serverUrl || !apiKey) {
    return null;
  }

  return {
    apiKey,
    serverUrl,
  };
}

function hasComposioCredentials(env: ComposioToolRuntimeOptions['env']) {
  return Boolean(getComposioMcpConfig(env) || getComposioApiKey(env));
}

function getComposioConfirmationSecret(env: ComposioToolRuntimeOptions['env'], apiKey: string) {
  const explicitSecret =
    (env as Record<string, string | undefined> | undefined)?.COMPOSIO_CONFIRMATION_SECRET ??
    process.env.COMPOSIO_CONFIRMATION_SECRET;

  return explicitSecret?.trim() || apiKey;
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

  if (!hasComposioCredentials(env)) {
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

function normalizeConfirmationArgs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeConfirmationArgs(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, normalizeConfirmationArgs(nestedValue)]),
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(normalizeConfirmationArgs(value));
}

function toBase64Url(bytes: Uint8Array) {
  const maybeBuffer = (globalThis as any).Buffer;

  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString('base64url');
  }

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hashComposioToolArgs(args: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(args)));

  return toBase64Url(new Uint8Array(digest));
}

function getJwtSecret(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function createComposioConfirmationToken({
  args,
  expiresAt = new Date(Date.now() + 10 * 60 * 1000),
  secret,
  toolName,
  userId,
}: ComposioConfirmationTokenInput) {
  const argsHash = await hashComposioToolArgs(stripComposioConfirmationFields(args));

  return new SignJWT({
    argsHash,
    toolName,
    uid: userId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setSubject(userId)
    .sign(getJwtSecret(secret));
}

export async function verifyComposioConfirmationToken({
  args,
  secret,
  token,
  toolName,
  userId,
}: ComposioConfirmationVerificationInput) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(secret), {
      subject: userId,
    });
    const expectedArgsHash = await hashComposioToolArgs(stripComposioConfirmationFields(args));

    return payload.uid === userId && payload.toolName === toolName && payload.argsHash === expectedArgsHash;
  } catch {
    return false;
  }
}

function extractComposioConfirmationTokens(text?: string) {
  return text?.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
}

async function hasValidComposioConfirmationToken({
  args,
  confirmationSecret,
  toolName,
  userId,
  userPrompt,
}: ComposioToolConfirmationContext & { args: unknown }) {
  for (const token of extractComposioConfirmationTokens(userPrompt)) {
    if (
      await verifyComposioConfirmationToken({
        args,
        secret: confirmationSecret,
        token,
        toolName,
        userId,
      })
    ) {
      return true;
    }
  }

  return false;
}

const MUTATING_COMPOSIO_TOOL_VERBS = new Set([
  'ADD',
  'CANCEL',
  'CREATE',
  'DELETE',
  'DEPLOY',
  'EXECUTE',
  'INVITE',
  'MERGE',
  'POST',
  'REDEPLOY',
  'REMOVE',
  'SEND',
  'STAR',
  'UPDATE',
  'UPLOAD',
]);

export function isLikelyMutatingComposioTool(toolName: string, description?: string) {
  const nameTokens = toolName
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  if (nameTokens.some((token) => MUTATING_COMPOSIO_TOOL_VERBS.has(token))) {
    return true;
  }

  const descriptionStart = description?.trim().split(/\s+/)[0]?.replace(/[^a-z]/gi, '').toUpperCase();

  return Boolean(descriptionStart && MUTATING_COMPOSIO_TOOL_VERBS.has(descriptionStart));
}

export function stripComposioConfirmationFields(args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return args;
  }

  const stripped = { ...(args as Record<string, unknown>) };

  for (const key of [
    'confirmed',
    'confirm',
    'confirmationToken',
    'confirmation_token',
    'composioConfirmationToken',
    'composio_confirmation_token',
  ]) {
    delete stripped[key];
  }

  return stripped;
}

function sanitizeJsonSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(sanitizeJsonSchemaForGemini);
  }

  const sanitized = { ...schema };

  if (sanitized.jsonSchema) {
    sanitized.jsonSchema = sanitizeJsonSchemaForGemini(sanitized.jsonSchema);
  }
  if (sanitized.schema) {
    sanitized.schema = sanitizeJsonSchemaForGemini(sanitized.schema);
  }

  if (sanitized.properties) {
    for (const key of Object.keys(sanitized.properties)) {
      sanitized.properties[key] = sanitizeJsonSchemaForGemini(sanitized.properties[key]);
    }
  }

  if (Array.isArray(sanitized.required)) {
    // Aggressive fix: completely delete all nested required arrays
    // because Gemini's strict OpenAPI validator crashes when arrays
    // define required constraints without matching properties.
    // The Gemini LLM functions perfectly without required arrays.
    delete sanitized.required;
  }

  if (sanitized.items) {
    sanitized.items = sanitizeJsonSchemaForGemini(sanitized.items);
  }

  if (Array.isArray(sanitized.anyOf)) {
    sanitized.anyOf = sanitized.anyOf.map(sanitizeJsonSchemaForGemini);
  }
  if (Array.isArray(sanitized.allOf)) {
    sanitized.allOf = sanitized.allOf.map(sanitizeJsonSchemaForGemini);
  }

  return sanitized;
}

export function normalizeComposioToolForAiSdkV4(tool: any) {
  if (!tool || typeof tool !== 'object') {
    return tool;
  }

  let parameters = tool.parameters || tool.inputSchema;

  if (parameters) {
    parameters = sanitizeJsonSchemaForGemini(parameters);
  }

  return {
    ...tool,
    parameters,
  };
}

export function wrapComposioToolWithConfirmation(tool: any, context: ComposioToolConfirmationContext) {
  const normalizedTool = normalizeComposioToolForAiSdkV4(tool);

  if (!normalizedTool || typeof normalizedTool !== 'object' || typeof normalizedTool.execute !== 'function') {
    return normalizedTool;
  }

  const description = typeof normalizedTool.description === 'string' ? normalizedTool.description : undefined;

  if (!isLikelyMutatingComposioTool(context.toolName, description)) {
    return normalizedTool;
  }

  const execute = normalizedTool.execute.bind(normalizedTool);

  return {
    ...normalizedTool,
    async execute(args: unknown, executeOptions?: unknown) {
      const strippedArgs = stripComposioConfirmationFields(args);

      if (
        await hasValidComposioConfirmationToken({
          ...context,
          args: strippedArgs,
        })
      ) {
        return execute(strippedArgs, executeOptions);
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const confirmationToken = await createComposioConfirmationToken({
        args: strippedArgs,
        expiresAt,
        secret: context.confirmationSecret,
        toolName: context.toolName,
        userId: context.userId,
      });

      return {
        confirmationExpiresAt: expiresAt.toISOString(),
        confirmationToken,
        message: `Confirm this external action before I run ${context.toolName}.`,
        status: 'confirmation_required',
        toolName: context.toolName,
      };
    },
  };
}

function normalizeAndWrapComposioTools(
  tools: Record<string, any>,
  context: Omit<ComposioToolConfirmationContext, 'toolName'>,
) {
  return Object.fromEntries(
    Object.entries(tools || {}).map(([toolName, tool]) => [
      toolName,
      wrapComposioToolWithConfirmation(tool, {
        ...context,
        toolName,
      }),
    ]),
  );
}

async function createComposioMcpToolResolution(
  mcpConfig: ComposioMcpConfig,
  context: Omit<ComposioToolConfirmationContext, 'toolName'>,
) {
  const client = await createMCPClient({
    transport: {
      type: 'http',
      url: mcpConfig.serverUrl,
      headers: {
        'x-api-key': mcpConfig.apiKey,
      },
    },
  });

  try {
    const tools = normalizeAndWrapComposioTools((await client.tools()) || {}, context);

    return {
      cleanup: () => client.close(),
      tools,
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function getComposioTools(options: ComposioToolRuntimeOptions): Promise<ComposioToolResolution> {
  const composioUserId = getResolvedComposioUserId(options.user);
  const disabledReason = getDisabledReason(options);
  const hasIdentity = Boolean(composioUserId);
  const mcpConfig = getComposioMcpConfig(options.env);
  const apiKey = getComposioApiKey(options.env);
  const hasApiKey = Boolean(mcpConfig?.apiKey || apiKey);

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
    const confirmationSecret = getComposioConfirmationSecret(options.env, mcpConfig?.apiKey || apiKey!);
    console.info('[llm.composio] resolving tools', {
      hasApiKey: true,
      mcpTransport: Boolean(mcpConfig),
      providerName: options.providerName,
      requestOrigin: options.requestOrigin,
      resolvedUserId: composioUserId,
      userPrompt: options.userPrompt,
    });

    if (mcpConfig) {
      const { cleanup, tools } = await createComposioMcpToolResolution(mcpConfig, {
        confirmationSecret,
        userId: composioUserId,
        userPrompt: options.userPrompt,
      });
      const toolNames = Object.keys(tools || {});

      console.info('[llm.composio] mcp tools resolved', {
        serverUrl: mcpConfig.serverUrl,
        toolCount: toolNames.length,
        toolNames: toolNames.slice(0, 10),
        userId: composioUserId,
      });

      return {
        cleanup,
        configured: true,
        hasIdentity: true,
        resolvedUserId: composioUserId,
        status: 'available',
        tools,
      };
    }

    console.warn('[llm.composio] MCP not configured, direct SDK path disabled (incompatible with Vercel serverless runtime)');

    return {
      configured: true,
      errorMessage: 'Composio MCP server not configured. Set COMPOSIO_MCP_SERVER_URL and COMPOSIO_MCP_API_KEY.',
      hasIdentity: true,
      resolvedUserId: composioUserId,
      status: 'resolution_failed',
      tools: {},
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
