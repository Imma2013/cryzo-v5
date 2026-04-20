const NON_ACTIONABLE_REDIRECT_RESOLUTION_AUTH_CODES = new Set([
  'auth/internal-error',
  'auth/network-request-failed',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

function getFirebaseAuthCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null;
}

export function shouldIgnoreRedirectResolutionError(error: unknown) {
  const code = getFirebaseAuthCode(error);

  if (code && NON_ACTIONABLE_REDIRECT_RESOLUTION_AUTH_CODES.has(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';

  return message.includes('/__/auth/iframe') || message.includes('chrome-error://chromewebdata');
}
