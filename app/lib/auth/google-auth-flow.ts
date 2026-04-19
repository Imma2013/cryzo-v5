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
