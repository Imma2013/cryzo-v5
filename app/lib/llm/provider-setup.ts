import { createScopedLogger } from '~/utils/logger';

const GOOGLE_PROVIDER_NAME = 'Google';
const GOOGLE_SERVER_API_KEY = 'GOOGLE_GENERATIVE_AI_API_KEY';
const logger = createScopedLogger('google-server-key');

type GoogleServerKeySource = 'server_env' | 'process_env' | 'missing';

export interface ProviderSetupErrorPayload {
  error: true;
  errorType: 'setup';
  isRetryable: false;
  message: string;
  provider: string;
  setupKey: string;
  setupSource: GoogleServerKeySource;
  statusCode: number;
}

export interface GoogleServerKeyResolution {
  hasKey: boolean;
  key?: string;
  source: GoogleServerKeySource;
}

export function resolveGoogleServerApiKey(serverEnv?: Record<string, string | undefined>): GoogleServerKeyResolution {
  const serverKey = serverEnv?.[GOOGLE_SERVER_API_KEY];

  if (serverKey) {
    return {
      hasKey: true,
      key: serverKey,
      source: 'server_env',
    };
  }

  const processKey =
    typeof process !== 'undefined' && process.env ? process.env[GOOGLE_SERVER_API_KEY]?.trim() || undefined : undefined;

  if (processKey) {
    return {
      hasKey: true,
      key: processKey,
      source: 'process_env',
    };
  }

  return {
    hasKey: false,
    source: 'missing',
  };
}

export function isGoogleServerConfigured(serverEnv?: Record<string, string | undefined>) {
  return resolveGoogleServerApiKey(serverEnv).hasKey;
}

export function logGoogleServerKeyResolution(routeName: string, resolution: GoogleServerKeyResolution) {
  logger.info(
    JSON.stringify({
      routeName,
      deployment: process.env.VERCEL_URL || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      hasGoogleKey: resolution.hasKey,
      source: resolution.source,
    }),
  );
}

export function getProviderSetupPayload(
  providerName: string | undefined,
  serverEnv?: Record<string, string | undefined>,
): ProviderSetupErrorPayload | null {
  if (providerName !== GOOGLE_PROVIDER_NAME) {
    return null;
  }

  const resolution = resolveGoogleServerApiKey(serverEnv);

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

export function isProviderSetupErrorPayload(value: unknown): value is ProviderSetupErrorPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<ProviderSetupErrorPayload>;
  return payload.errorType === 'setup' && typeof payload.message === 'string' && typeof payload.provider === 'string';
}

export function isGoogleProvider(providerName: string | undefined) {
  return providerName === GOOGLE_PROVIDER_NAME;
}

export { GOOGLE_PROVIDER_NAME, GOOGLE_SERVER_API_KEY };
