export function getSupabaseAuthErrorMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code.toLowerCase()
      : '';
  const message =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.trim()
      : '';
  const normalized = message.toLowerCase();

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials' ||
    code === 'invalid_credentials'
  ) {
    return 'Invalid email or password.';
  }

  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'user_not_found') {
    return 'Invalid email or password.';
  }

  if (code === 'auth/email-already-in-use' || code === 'email_exists') {
    return 'An account with this email already exists. Sign in instead.';
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return 'This email is already linked to another sign-in method. Sign in with that method.';
  }

  if (code === 'email_not_confirmed') {
    return 'Email confirmation is required before signing in.';
  }

  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for sign-in. Add it in Supabase Auth URL settings.';
  }

  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Google sign-in is unavailable in this browser context.';
  }

  if (code === 'auth/web-storage-unsupported') {
    return 'Browser storage is unavailable. Enable cookies and local storage, then try again.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Network error during authentication. Check your connection and try again.';
  }

  if (code === 'auth/redirect-cancelled-by-user') {
    return 'Google sign-in was cancelled before completion.';
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in was closed before completion.';
  }

  if (code === 'auth/popup-blocked') {
    return 'Google sign-in popup was blocked by the browser.';
  }

  if (normalized.includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Email confirmation is required before signing in.';
  }

  if (normalized.includes('invalid credentials') || normalized.includes('wrong password')) {
    return 'Invalid email or password.';
  }

  if (normalized.includes('email is required')) {
    return 'Email is required.';
  }

  if (normalized.includes('invalid password')) {
    return 'Password must be at least 8 characters.';
  }

  if (
    normalized.includes('already exists') ||
    normalized.includes('already linked') ||
    normalized.includes('duplicate') ||
    normalized.includes('already registered')
  ) {
    return 'An account with this email already exists. Sign in instead.';
  }

  if (message) {
    return message;
  }

  return 'Authentication failed.';
}
