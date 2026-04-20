export function getFirebaseAuthErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message.trim()
      : '';

  if (message.toLowerCase().includes('invalid credentials')) {
    return 'Invalid email or password.';
  }

  if (message.toLowerCase().includes('email is required')) {
    return 'Email is required.';
  }

  if (message.toLowerCase().includes('invalid password')) {
    return 'Password must be at least 8 characters.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Authentication failed.';
}
