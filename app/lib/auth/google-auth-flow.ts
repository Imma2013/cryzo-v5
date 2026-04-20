export type GoogleSignInMethod = 'popup' | 'redirect';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
export const FIREBASE_PRODUCTION_AUTH_HOSTNAME = 'cryzo-v5.vercel.app';

function normalizeHostname(hostname: string | null | undefined) {
  return hostname?.trim().toLowerCase() ?? '';
}

function isLocalhostHostname(hostname: string) {
  return LOCALHOST_HOSTNAMES.has(hostname);
}

function isVercelPreviewHostname(hostname: string) {
  return hostname.endsWith('.vercel.app') && hostname !== FIREBASE_PRODUCTION_AUTH_HOSTNAME;
}

export function getGoogleSignInMethod(hostname: string | null | undefined): GoogleSignInMethod {
  if (!hostname) {
    return 'popup';
  }

  return 'popup';
}

export function getFirebaseAuthHostSupport(hostname: string | null | undefined) {
  const normalizedHostname = normalizeHostname(hostname);

  if (!normalizedHostname) {
    return {
      isSupported: false,
      message: `Firebase sign-in is only enabled on \`${FIREBASE_PRODUCTION_AUTH_HOSTNAME}\`.`,
    };
  }

  if (isLocalhostHostname(normalizedHostname) || normalizedHostname === FIREBASE_PRODUCTION_AUTH_HOSTNAME) {
    return {
      isSupported: true,
      message: null,
    };
  }

  if (isVercelPreviewHostname(normalizedHostname)) {
    return {
      isSupported: false,
      message: `Firebase sign-in is disabled on preview URLs. Open \`https://${FIREBASE_PRODUCTION_AUTH_HOSTNAME}\` for authentication.`,
    };
  }

  return {
    isSupported: false,
    message: `Firebase sign-in is only enabled on \`${FIREBASE_PRODUCTION_AUTH_HOSTNAME}\`.`,
  };
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
