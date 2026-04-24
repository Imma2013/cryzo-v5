import { sanitizeRelativeRedirectPath } from '~/lib/auth/redirect-path';

const AUTH_CALLBACK_QUERY_KEYS = ['code', 'error', 'error_description', 'token_hash', 'access_token', 'refresh_token'];

export type AuthCallbackParams = {
  authCode: string | null;
  authError: string | null;
  authErrorDescription: string | null;
  nextPath: string;
};

export function hasAuthCallbackQueryParams(url: URL) {
  return AUTH_CALLBACK_QUERY_KEYS.some((key) => url.searchParams.has(key));
}

export function parseAuthCallbackParams(url: URL): AuthCallbackParams {
  return {
    authCode: url.searchParams.get('code'),
    authError: url.searchParams.get('error'),
    authErrorDescription: url.searchParams.get('error_description'),
    nextPath: sanitizeRelativeRedirectPath(url.searchParams.get('next'), '/'),
  };
}
