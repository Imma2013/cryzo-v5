type GoogleProviderErrorDetail = {
  '@type'?: string;
  retryDelay?: string;
  [key: string]: unknown;
};

type GoogleProviderError = {
  code?: number;
  details?: GoogleProviderErrorDetail[];
  message?: string;
  status?: string;
};

export type GoogleImageQuotaErrorPayload = {
  error: true;
  errorType: 'quota';
  message: string;
  model: string;
  provider: 'Google';
  providerError?: string;
  retryAfterSeconds?: number;
};

export class GoogleImageQuotaError extends Error {
  readonly payload: GoogleImageQuotaErrorPayload;
  readonly status: number;

  constructor(payload: GoogleImageQuotaErrorPayload, status = 429) {
    super(payload.message);
    this.name = 'GoogleImageQuotaError';
    this.payload = payload;
    this.status = status;
  }
}

function parsePositiveInteger(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseGoogleRetryAfterSeconds({
  details,
  message,
  retryAfterHeader,
}: {
  details?: GoogleProviderErrorDetail[];
  message?: string;
  retryAfterHeader?: string | null;
}) {
  const headerRetryAfter = parsePositiveInteger(retryAfterHeader);

  if (headerRetryAfter) {
    return headerRetryAfter;
  }

  const retryDelay = details?.find((detail) => typeof detail.retryDelay === 'string')?.retryDelay;
  const retryDelayMatch = retryDelay?.match(/^(\d+)s$/);

  if (retryDelayMatch) {
    return parsePositiveInteger(retryDelayMatch[1]);
  }

  const retryAfterMessageMatch = message?.match(/retry(?:\s+after|\s+in)?\s+(\d+)\s*(?:s|sec|secs|second|seconds)\b/i);

  if (retryAfterMessageMatch) {
    return parsePositiveInteger(retryAfterMessageMatch[1]);
  }

  return undefined;
}

export function isGoogleQuotaError(status: number, error?: GoogleProviderError) {
  const message = error?.message?.toLowerCase() || '';
  const statusText = error?.status?.toLowerCase() || '';

  return status === 429 || statusText.includes('quota') || message.includes('quota');
}

export function isGoogleImageRetryableProviderError(status: number, error?: GoogleProviderError) {
  if (isGoogleQuotaError(status, error)) {
    return true;
  }

  const message = error?.message?.toLowerCase() || '';
  const statusText = error?.status?.toLowerCase() || '';
  const text = `${statusText} ${message}`;

  return (
    status === 503 ||
    text.includes('billing') ||
    text.includes('resource exhausted') ||
    text.includes('unavailable') ||
    text.includes('not available') ||
    text.includes('not enabled') ||
    text.includes('unsupported') ||
    text.includes('not supported') ||
    (text.includes('not found') && text.includes('model'))
  );
}

export function buildGoogleImageQuotaErrorPayload({
  error,
  model,
  retryAfterHeader,
}: {
  error?: GoogleProviderError;
  model: string;
  retryAfterHeader?: string | null;
}): GoogleImageQuotaErrorPayload {
  const retryAfterSeconds = parseGoogleRetryAfterSeconds({
    details: error?.details,
    message: error?.message,
    retryAfterHeader,
  });
  const retryMessage = retryAfterSeconds ? ` Retry after about ${retryAfterSeconds} seconds.` : '';

  return {
    error: true,
    errorType: 'quota',
    message:
      `Google image generation quota, billing, or model availability is blocking ${model}. Check the Google AI Studio quota/billing settings for the API key, verify the model is available, or wait for quota to reset before retrying.` +
      retryMessage,
    model,
    provider: 'Google',
    providerError: error?.message,
    retryAfterSeconds,
  };
}
