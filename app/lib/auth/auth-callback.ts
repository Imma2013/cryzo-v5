import { sanitizeRelativeRedirectPath } from '~/lib/auth/redirect-path';

export type AuthCallbackParams = {
  authCode: string | null;
  authError: string | null;
  authErrorDescription: string | null;
  nextPath: string;
};

export function parseAuthCallbackParams(url: URL): AuthCallbackParams {
  return {
    authCode: url.searchParams.get('code'),
    authError: url.searchParams.get('error'),
    authErrorDescription: url.searchParams.get('error_description'),
    nextPath: sanitizeRelativeRedirectPath(url.searchParams.get('next'), '/'),
  };
}
