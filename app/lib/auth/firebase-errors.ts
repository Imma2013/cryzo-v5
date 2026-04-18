function getCurrentHostname() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.hostname;
}

export function getFirebaseAuthErrorMessage(error: unknown) {
  const authCode =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;

  if (authCode === 'auth/unauthorized-domain') {
    const hostname = getCurrentHostname();
    const domainLabel = hostname ? `\`${hostname}\`` : 'this domain';

    return `Firebase Auth is blocking ${domainLabel}. Add it in Firebase Console -> Authentication -> Settings -> Authorized domains, then retry sign-in.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Authentication failed.';
}
