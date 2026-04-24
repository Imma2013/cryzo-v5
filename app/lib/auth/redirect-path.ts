const AUTH_CALLBACK_PATH = '/auth/callback';
const AUTH_CALLBACK_QUERY_MARKERS = ['code', 'error', 'error_description', 'token_hash', 'access_token', 'refresh_token'];
const AUTH_CALLBACK_QUERY_KEYS_TO_DROP = [
  ...AUTH_CALLBACK_QUERY_MARKERS,
  'state',
  'expires_in',
  'expires_at',
  'provider_token',
  'provider_refresh_token',
  'type',
];

function hasAuthCallbackPayload(searchParams: URLSearchParams) {
  return AUTH_CALLBACK_QUERY_MARKERS.some((key) => searchParams.has(key));
}

function stripAuthCallbackQuery(searchParams: URLSearchParams) {
  const cleaned = new URLSearchParams(searchParams);

  for (const key of AUTH_CALLBACK_QUERY_KEYS_TO_DROP) {
    cleaned.delete(key);
  }

  return cleaned;
}

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
    const sanitizedSearchParams = hasAuthCallbackPayload(parsed.searchParams)
      ? stripAuthCallbackQuery(parsed.searchParams)
      : parsed.searchParams;
    const sanitizedSearch = sanitizedSearchParams.toString();
    const normalized = `${parsed.pathname}${sanitizedSearch ? `?${sanitizedSearch}` : ''}${parsed.hash}`;

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
