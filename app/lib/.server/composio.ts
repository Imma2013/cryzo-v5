import { Composio } from '@composio/core';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';

type RouteContext = ActionFunctionArgs['context'] | LoaderFunctionArgs['context'];
export type ComposioClient = any;

export function resolveComposioApiKeyFromEnv(
  env?: Record<string, string | undefined> | null,
  processEnv: Record<string, string | undefined> | undefined = typeof process !== 'undefined' ? process.env : undefined,
) {
  return env?.COMPOSIO_API_KEY || processEnv?.COMPOSIO_API_KEY || processEnv?.VITE_COMPOSIO_API_KEY || null;
}

export function resolveComposioApiKey(context: RouteContext) {
  const env = context?.cloudflare?.env as unknown as Record<string, string | undefined> | undefined;

  return resolveComposioApiKeyFromEnv(env);
}

export function createComposioClientFromApiKey(apiKey: string): ComposioClient {
  return new Composio({ apiKey }) as any;
}

export function createComposioClient(context: RouteContext) {
  const apiKey = resolveComposioApiKey(context);

  if (!apiKey) {
    throw new Error('Missing COMPOSIO_API_KEY. Add it to your local server env before using Apps.');
  }

  return createComposioClientFromApiKey(apiKey);
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
