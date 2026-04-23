const AUTH_CALLBACK_PATH = '/auth/callback';

function trimLeadingWhitespace(value: string) {
  return value.replace(/^\s+/, '');
}

export function sanitizeRelativeRedirectPath(input: string | null | undefined, fallback = '/') {
  if (!input) {
    return fallback;
  }

  const candidate = trimLeadingWhitespace(input.trim());

  if (!candidate.startsWith('/')) {
    return fallback;
  }

  if (candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return fallback;
  }

  if (/[\r\n]/.test(candidate)) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'http://localhost');
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (!normalized.startsWith('/')) {
      return fallback;
    }

    if (parsed.pathname === AUTH_CALLBACK_PATH) {
      return fallback;
    }

    return normalized;
  } catch {
    return fallback;
  }
}

export function buildGoogleAuthRedirectTo(nextPath?: string) {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const defaultNext = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const safeNext = sanitizeRelativeRedirectPath(nextPath ?? defaultNext, '/');
  const params = new URLSearchParams({ next: safeNext });

  return `${window.location.origin}${AUTH_CALLBACK_PATH}?${params.toString()}`;
}
