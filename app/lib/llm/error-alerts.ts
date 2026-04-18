import type { LlmErrorAlertType } from '~/types/actions';
import { GOOGLE_SERVER_API_KEY, isProviderSetupErrorPayload } from './provider-setup';

interface ParsedErrorInfo {
  errorType?: string;
  message: string;
  provider?: string;
  statusCode?: number;
}

function parseErrorInfo(error: unknown): ParsedErrorInfo {
  if (error instanceof Error && error.message) {
    try {
      const parsed = JSON.parse(error.message) as ParsedErrorInfo;

      if (parsed && (parsed.message || parsed.errorType || parsed.statusCode)) {
        return {
          errorType: parsed.errorType,
          message: parsed.message || error.message,
          provider: parsed.provider,
          statusCode: parsed.statusCode,
        };
      }
    } catch {
      return { message: error.message };
    }
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'An unexpected error occurred' };
}

export function createLlmErrorAlert(error: unknown, fallbackProvider: string): LlmErrorAlertType {
  const parsed = parseErrorInfo(error);
  const provider = parsed.provider || fallbackProvider;

  if (
    isProviderSetupErrorPayload(parsed) ||
    parsed.message.includes(GOOGLE_SERVER_API_KEY) ||
    parsed.message.toLowerCase().includes('google is selected, but')
  ) {
    return {
      type: 'error',
      title: 'Server Setup Required',
      description: parsed.message,
      provider,
      errorType: 'setup',
    };
  }

  if (parsed.statusCode === 401 || parsed.message.toLowerCase().includes('api key')) {
    return {
      type: 'error',
      title: 'Authentication Error',
      description: parsed.message,
      provider,
      errorType: 'authentication',
    };
  }

  if (parsed.statusCode === 429 || parsed.message.toLowerCase().includes('rate limit')) {
    return {
      type: 'error',
      title: 'Rate Limit Exceeded',
      description: parsed.message,
      provider,
      errorType: 'rate_limit',
    };
  }

  if (parsed.message.toLowerCase().includes('quota')) {
    return {
      type: 'error',
      title: 'Quota Exceeded',
      description: parsed.message,
      provider,
      errorType: 'quota',
    };
  }

  if ((parsed.statusCode || 0) >= 500) {
    return {
      type: 'error',
      title: 'Server Error',
      description: parsed.message,
      provider,
      errorType: 'network',
    };
  }

  return {
    type: 'error',
    title: 'Request Failed',
    description: parsed.message,
    provider,
    errorType: 'unknown',
  };
}
