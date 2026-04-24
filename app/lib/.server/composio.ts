import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getServerEnv, normalizeServerEnvValue } from '~/lib/server-env';

type RouteContext = ActionFunctionArgs['context'] | LoaderFunctionArgs['context'];
export type ComposioClient = any;
export type ComposioAgentClient = any;

function normalizeComposioEnvRecord(record?: Record<string, unknown> | null) {
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, normalizeServerEnvValue(typeof value === 'string' ? value : undefined)]),
  ) as Record<string, string | undefined>;
}

export function resolveComposioApiKeyFromEnv(
  env?: Record<string, string | undefined> | null,
  metaEnv?: Record<string, unknown> | null,
  processEnv: Record<string, string | undefined> | undefined = typeof process !== 'undefined' ? process.env : undefined,
) {
  const normalizedEnv = normalizeComposioEnvRecord(env);
  const normalizedMetaEnv = normalizeComposioEnvRecord(metaEnv);
  const normalizedProcessEnv = normalizeComposioEnvRecord(processEnv);
  const mergedEnv = {
    ...normalizedMetaEnv,
    ...normalizedProcessEnv,
    ...normalizedEnv,
  };

  return mergedEnv.COMPOSIO_API_KEY || mergedEnv.VITE_COMPOSIO_API_KEY || null;
}

export function resolveComposioApiKey(context: RouteContext) {
  const serverEnv = getServerEnv(context as any);

  return resolveComposioApiKeyFromEnv(serverEnv);
}

export function createComposioClientFromApiKey(apiKey: string): ComposioClient {
  return new Composio({ apiKey }) as any;
}

export function createComposioAgentClientFromApiKey(apiKey: string): ComposioAgentClient {
  return new Composio({
    apiKey,
    provider: new VercelProvider() as any,
  } as any) as any;
}

export function createComposioClient(context: RouteContext) {
  const apiKey = resolveComposioApiKey(context);

  if (!apiKey) {
    throw new Error('Missing COMPOSIO_API_KEY on the server runtime. Add it to the Vercel environment variables before using Apps.');
  }

  return createComposioClientFromApiKey(apiKey);
}

export function createComposioAgentClient(context: RouteContext) {
  const apiKey = resolveComposioApiKey(context);

  if (!apiKey) {
    throw new Error('Missing COMPOSIO_API_KEY on the server runtime. Add it to the Vercel environment variables before using Apps.');
  }

  return createComposioAgentClientFromApiKey(apiKey);
}

export function extractComposioRedirectUrl(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    const match = value.match(/https?:\/\/[^\s)]+/);
    return match?.[0];
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of [
    'redirectUrl',
    'redirect_url',
    'authUrl',
    'authUri',
    'authorizationUrl',
    'url',
    'link',
  ]) {
    const candidate = record[key];

    if (typeof candidate === 'string' && /^https?:\/\//.test(candidate)) {
      return candidate;
    }
  }

  for (const nestedKey of ['connectionData', 'connection', 'data', 'val']) {
    const nested = record[nestedKey];
    const nestedUrl = extractComposioRedirectUrl(nested);

    if (nestedUrl) {
      return nestedUrl;
    }
  }

  return undefined;
}

export function isComposioAuthError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : '';
  const normalizedMessage = message.toLowerCase();

  return (
    Boolean(extractComposioRedirectUrl(error)) ||
    normalizedMessage.includes('no connected accounts found') ||
    normalizedMessage.includes('connected account') ||
    normalizedMessage.includes('authenticate') ||
    normalizedMessage.includes('authorization') ||
    normalizedMessage.includes('oauth')
  );
}

export async function resolveComposioManagedAuthConfigId(composio: ComposioClient, toolkitSlug: string) {
  const authConfigs = await composio.authConfigs.list({
    isComposioManaged: true,
    limit: 100,
    toolkit: toolkitSlug,
  });

  const enabledAuthConfig = authConfigs.items.find((item: any) => item?.status === 'ENABLED' || item?.enabled === true);

  if (enabledAuthConfig?.id) {
    return enabledAuthConfig.id as string;
  }

  const toolkit = await composio.toolkits.get(toolkitSlug);
  const authConfigDetails = toolkit.authConfigDetails ?? toolkit.auth_config_details;

  if (!authConfigDetails?.length) {
    return null;
  }

  const createdAuthConfig = await composio.authConfigs.create(toolkitSlug, {
    credentials: {},
    name: `${toolkit.name} Auth Config`,
    type: 'use_composio_managed_auth',
  });

  return createdAuthConfig.id;
}

export async function createComposioConnectionRequest(
  composio: ComposioClient,
  userId: string,
  toolkitSlug: string,
  options?: { callbackUrl?: string },
) {
  const authConfigId = await resolveComposioManagedAuthConfigId(composio, toolkitSlug);

  if (!authConfigId) {
    return composio.toolkits.authorize(userId, toolkitSlug);
  }

  return composio.connectedAccounts.link(userId, authConfigId, {
    ...(options?.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
  });
}
