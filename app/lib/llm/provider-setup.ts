const GOOGLE_PROVIDER_NAME = 'Google';
const GOOGLE_SERVER_API_KEY = 'GOOGLE_GENERATIVE_AI_API_KEY';

export interface ProviderSetupErrorPayload {
  error: true;
  errorType: 'setup';
  isRetryable: false;
  message: string;
  provider: string;
  setupKey: string;
  setupSource: 'server_env';
  statusCode: number;
}

export function getProviderSetupPayload(
  providerName: string | undefined,
  serverEnv?: Record<string, string | undefined>,
): ProviderSetupErrorPayload | null {
  if (providerName !== GOOGLE_PROVIDER_NAME) {
    return null;
  }

  if (serverEnv?.[GOOGLE_SERVER_API_KEY]) {
    return null;
  }

  return {
    error: true,
    errorType: 'setup',
    isRetryable: false,
    message: `Google is selected, but ${GOOGLE_SERVER_API_KEY} is missing on the server. Add it to the Vercel project environment variables and redeploy before retrying.`,
    provider: GOOGLE_PROVIDER_NAME,
    setupKey: GOOGLE_SERVER_API_KEY,
    setupSource: 'server_env',
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
