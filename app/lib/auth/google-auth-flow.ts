const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export type GoogleSignInMethod = 'popup' | 'redirect';

export function getGoogleSignInMethod(hostname: string | null | undefined): GoogleSignInMethod {
  if (!hostname || LOCAL_HOSTS.has(hostname)) {
    return 'popup';
  }

  return 'redirect';
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
