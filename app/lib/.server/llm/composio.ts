import { createComposioSessionFromApiKey, resolveComposioApiKeyFromEnv } from '~/lib/.server/composio';
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

// JSON Schema keys whose value is a single nested schema.
const SCHEMA_KEYS_SINGLE = [
  'items',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
  'additionalItems',
  'jsonSchema',
  'schema',
] as const;

// JSON Schema keys whose value is an array of nested schemas.
const SCHEMA_KEYS_ARRAY = ['anyOf', 'allOf', 'oneOf', 'prefixItems'] as const;

// JSON Schema keys whose value is a record/map of nested schemas.
const SCHEMA_KEYS_RECORD = [
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
] as const;

/**
 * Recursively sanitize a JSON Schema so it passes Google Gemini's strict
 * OpenAPI validator. Composio tool-router meta-tools (e.g. COMPOSIO_SEARCH_TOOLS,
 * COMPOSIO_EXECUTE_TOOL) ship JSON schemas with `required` entries that
 * reference properties that aren't defined on the same object — usually inside
 * `oneOf`, `$defs`, or `additionalProperties` branches that the previous
 * sanitizer never traversed. Gemini rejects those payloads with errors like:
 *
 *   GenerateContentRequest.tools[0].function_declarations[1]
 *     .parameters.properties[tools].items.required[1]: property is not defined
 *
 * This walks every standard JSON Schema branch (single, array, record forms,
 * plus `additionalProperties`) and:
 *   - filters `required` to keys that actually exist in `properties`
 *   - drops `required` entirely when no valid entries remain
 *   - guards against cycles via a WeakSet (Composio schemas reuse `$defs`).
 */
function sanitizeJsonSchemaForGemini(schema: any, seen: WeakSet<object> = new WeakSet()): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map((entry) => sanitizeJsonSchemaForGemini(entry, seen));
  }

  if (seen.has(schema)) {
    return schema;
  }
  seen.add(schema);

  const sanitized: Record<string, any> = { ...schema };

  for (const key of SCHEMA_KEYS_SINGLE) {
    const value = sanitized[key];

    if (value !== undefined && value !== null && typeof value === 'object') {
      sanitized[key] = sanitizeJsonSchemaForGemini(value, seen);
    }
  }

  for (const key of SCHEMA_KEYS_ARRAY) {
    if (Array.isArray(sanitized[key])) {
      sanitized[key] = sanitized[key].map((entry: unknown) => sanitizeJsonSchemaForGemini(entry, seen));
    }
  }

  for (const key of SCHEMA_KEYS_RECORD) {
    const value = sanitized[key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const next: Record<string, any> = {};

      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        next[innerKey] = sanitizeJsonSchemaForGemini(innerValue, seen);
      }
      sanitized[key] = next;
    }
  }

  // `additionalProperties` may be either a boolean or a nested schema.
  if (sanitized.additionalProperties && typeof sanitized.additionalProperties === 'object') {
    sanitized.additionalProperties = sanitizeJsonSchemaForGemini(sanitized.additionalProperties, seen);
  }

  // Filter `required` to keys that actually exist on `properties`. Gemini
  // crashes if a required entry doesn't match a defined property, but it
  // accepts `required` when every entry resolves. If nothing valid remains,
  // drop the key entirely so the LLM call still goes through.
  if (Array.isArray(sanitized.required)) {
    const properties =
      sanitized.properties && typeof sanitized.properties === 'object' && !Array.isArray(sanitized.properties)
        ? (sanitized.properties as Record<string, unknown>)
        : null;

    const validRequired = properties
      ? sanitized.required.filter(
          (name: unknown) => typeof name === 'string' && Object.prototype.hasOwnProperty.call(properties, name),
        )
      : [];

    if (validRequired.length > 0) {
      sanitized.required = validRequired;
    } else {
      delete sanitized.required;
    }
  }

  return sanitized;
}

export function normalizeComposioToolForAiSdkV4(tool: any) {
  if (!tool || typeof tool !== 'object') {
    return tool;
  }

  // AI SDK v5 (used by @composio/vercel and @ai-sdk/google) reads
  // `inputSchema`, while v4 reads `parameters`. The previous version of this
  // helper only sanitized `parameters` and spread the original `tool` last,
  // which left an unsanitized `inputSchema` on the returned tool — Gemini's
  // strict OpenAPI validator then rejected the request. Sanitize both so
  // either provider path uses the cleaned schema.
  const rawParameters = tool.parameters;
  const rawInputSchema = tool.inputSchema;
  const source = rawParameters ?? rawInputSchema;
  const sanitized = source ? sanitizeJsonSchemaForGemini(source) : source;

  const next: Record<string, any> = { ...tool };

  if (rawParameters !== undefined || sanitized !== undefined) {
    next.parameters = sanitized;
  }

  if (rawInputSchema !== undefined || sanitized !== undefined) {
    next.inputSchema = sanitized;
  }

  return next;
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
    const confirmationSecret = getComposioConfirmationSecret(options.env, apiKey);
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

    const tools = normalizeAndWrapComposioTools((await session.tools()) || {}, {
      confirmationSecret,
      userId: composioUserId,
      userPrompt: options.userPrompt,
    });
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
