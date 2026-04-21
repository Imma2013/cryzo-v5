export function getFirebaseAuthErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.trim()
      : '';
  const normalized = message.toLowerCase();

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

  if (normalized.includes('[convex a(auth:signin)]') || normalized.includes('server error called by client')) {
    return 'Authentication failed. Please check your email/password and try again.';
  }

  if (message) {
    return message;
  }

  return 'Authentication failed.';
}
