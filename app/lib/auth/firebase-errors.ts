export function getFirebaseAuthErrorMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code.toLowerCase()
      : '';
  const message =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.trim()
      : '';
  const normalized = message.toLowerCase();

  if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
    return 'Invalid email or password.';
  }

  if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return 'Invalid email or password.';
  }

  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Sign in instead.';
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return 'This email is already linked to another sign-in method. Sign in with that method.';
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completion.';
  }

  if (code === 'auth/popup-blocked') {
    return 'Popup blocked by browser. Allow popups and try Google sign-in again.';
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
