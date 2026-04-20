export type GoogleSignInMethod = 'popup' | 'redirect';

export function getGoogleSignInMethod(hostname: string | null | undefined): GoogleSignInMethod {
  void hostname;
  return 'popup';
}

export function getCurrentHostname() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.hostname;
}

export function getGoogleSignInPendingLabel(method: GoogleSignInMethod) {
  return method === 'redirect' ? 'Redirecting to Google...' : 'Working...';
}

const POPUP_TO_REDIRECT_FALLBACK_CODES = new Set([
  'auth/operation-not-supported-in-this-environment',
  'auth/popup-blocked',
  'auth/web-storage-unsupported',
]);

export function shouldFallbackToRedirectFromPopupError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;

  return code ? POPUP_TO_REDIRECT_FALLBACK_CODES.has(code) : false;
}
