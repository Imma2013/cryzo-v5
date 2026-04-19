import {
  GOOGLE_PROVIDER_NAME,
  GOOGLE_SERVER_API_KEY,
  type GoogleServerKeyResolution,
  type ProviderSetupErrorPayload,
} from '~/lib/llm/provider-setup';
import { normalizeServerEnvValue } from '~/lib/server-env';

function getBuildTimeGoogleServerApiKey() {
  const env = import.meta.env as Record<string, string | undefined>;
  return normalizeServerEnvValue(env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export function resolveGoogleServerApiKeyForRuntime(
  serverEnv?: Record<string, string | undefined>,
): GoogleServerKeyResolution {
  const serverKey = normalizeServerEnvValue(serverEnv?.[GOOGLE_SERVER_API_KEY]);

  if (serverKey) {
    return {
      hasKey: true,
      key: serverKey,
      source: 'server_env',
    };
  }

  const processKey =
    typeof process !== 'undefined' && process.env ? normalizeServerEnvValue(process.env[GOOGLE_SERVER_API_KEY]) : undefined;

  if (processKey) {
    return {
      hasKey: true,
      key: processKey,
      source: 'process_env',
    };
  }

  const buildTimeKey = getBuildTimeGoogleServerApiKey();

  if (buildTimeKey) {
    return {
      hasKey: true,
      key: buildTimeKey,
      source: 'process_env',
    };
  }

  return {
    hasKey: false,
    source: 'missing',
  };
}

export function getGoogleProviderSetupPayloadForRuntime(
  providerName: string | undefined,
  serverEnv?: Record<string, string | undefined>,
): ProviderSetupErrorPayload | null {
  if (providerName !== GOOGLE_PROVIDER_NAME) {
    return null;
  }

  const resolution = resolveGoogleServerApiKeyForRuntime(serverEnv);

  if (resolution.hasKey) {
    return null;
  }

  return {
    error: true,
    errorType: 'setup',
    isRetryable: false,
    message: `Google is selected, but ${GOOGLE_SERVER_API_KEY} is missing on the server. Add it to the Vercel project environment variables and redeploy before retrying.`,
    provider: GOOGLE_PROVIDER_NAME,
    setupKey: GOOGLE_SERVER_API_KEY,
    setupSource: resolution.source,
    statusCode: 503,
  };
}
