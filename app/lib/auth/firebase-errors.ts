import { getCurrentHostname } from './google-auth-flow';

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

  if (authCode === 'auth/popup-closed-by-user') {
    return 'Google sign-in was interrupted before completion. Retry sign-in and finish the Google flow in the opened window.';
  }

  if (authCode === 'auth/popup-blocked') {
    return 'The Google sign-in popup was blocked by the browser. Allow popups for this site and retry sign-in.';
  }

  if (authCode === 'auth/web-storage-unsupported') {
    return 'This browser does not allow the storage required for Google sign-in. Enable site data/cookies for this site and retry.';
  }

  if (authCode === 'auth/operation-not-supported-in-this-environment') {
    return 'Google popup sign-in is not supported in this browser context. Retry and complete the redirect sign-in flow.';
  }

  if (authCode === 'auth/cancelled-popup-request') {
    return 'A Google sign-in popup is already in progress. Finish the open popup or close it before retrying.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Authentication failed.';
}
