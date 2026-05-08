import { normalizeServerEnvValue } from '~/lib/server-env';
import { getGoogleProviderSetupPayloadForRuntime, resolveGoogleServerApiKeyForRuntime } from './google-server-runtime';
import {
  GOOGLE_PROVIDER_NAME,
  OPENAI_PROVIDER_NAME,
  OPENAI_SERVER_API_KEY,
} from './provider-defaults';
import type { ProviderSetupErrorPayload } from './provider-setup';

export function resolveOpenAiServerApiKeyForRuntime(serverEnv?: Record<string, string | undefined>) {
  const serverKey = normalizeServerEnvValue(serverEnv?.[OPENAI_SERVER_API_KEY]);

  if (serverKey) {
    return {
      hasKey: true,
      key: serverKey,
      source: 'server_env' as const,
    };
  }

  const processKey =
    typeof process !== 'undefined' && process.env ? normalizeServerEnvValue(process.env[OPENAI_SERVER_API_KEY]) : undefined;

  if (processKey) {
    return {
      hasKey: true,
      key: processKey,
      source: 'process_env' as const,
    };
  }

  return {
    hasKey: false,
    source: 'missing' as const,
  };
}

export function getProviderSetupPayloadForRuntime(
  providerName: string | undefined,
  serverEnv?: Record<string, string | undefined>,
): ProviderSetupErrorPayload | null {
  if (providerName === GOOGLE_PROVIDER_NAME) {
    return getGoogleProviderSetupPayloadForRuntime(providerName, serverEnv);
  }

  if (providerName !== OPENAI_PROVIDER_NAME) {
    return null;
  }

  const resolution = resolveOpenAiServerApiKeyForRuntime(serverEnv);

  if (resolution.hasKey) {
    return null;
  }

  return {
    error: true,
    errorType: 'setup',
    isRetryable: false,
    message: `OpenAI is selected, but ${OPENAI_SERVER_API_KEY} is missing on the server. Add it to the Vercel project environment variables and redeploy before retrying.`,
    provider: OPENAI_PROVIDER_NAME,
    setupKey: OPENAI_SERVER_API_KEY,
    setupSource: resolution.source,
    statusCode: 503,
  };
}
