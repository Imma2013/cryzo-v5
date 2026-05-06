type GoogleProviderErrorDetail = {
  '@type'?: unknown;
  retryDelay?: unknown;
  [key: string]: unknown;
};

type GoogleProviderError = {
  code?: number;
  details?: GoogleProviderErrorDetail[];
  message?: string;
  status?: string;
};

export type GoogleImageProviderErrorType = 'billing' | 'model_unavailable' | 'provider' | 'quota';

export type GoogleImageProviderErrorPayload = {
  error: true;
  errorType: GoogleImageProviderErrorType;
  isRetryable: boolean;
  keyFingerprint?: string;
  keySource?: string;
  message: string;
  model: string;
  provider: 'Google';
  providerCode?: number;
  providerError?: string;
  providerStatus?: string;
  providerErrorDetailTypes?: string[];
  retryAfterSeconds?: number;
  statusCode: number;
};

export class GoogleImageProviderError extends Error {
  readonly payload: GoogleImageProviderErrorPayload;
  readonly status: number;

  constructor(payload: GoogleImageProviderErrorPayload, status = 502) {
    super(payload.message);
    this.name = 'GoogleImageProviderError';
    this.payload = payload;
    this.status = status;
  }
}

export class GoogleImageQuotaError extends GoogleImageProviderError {
  constructor(payload: GoogleImageProviderErrorPayload, status = 429) {
    super(payload, status);
    this.name = 'GoogleImageQuotaError';
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

export function classifyGoogleImageProviderError(
  status: number,
  error?: GoogleProviderError,
): GoogleImageProviderErrorType {
  if (isGoogleQuotaError(status, error)) {
    return 'quota';
  }

  const message = error?.message?.toLowerCase() || '';
  const statusText = error?.status?.toLowerCase() || '';
  const text = `${statusText} ${message}`;

  if (text.includes('billing')) {
    return 'billing';
  }

  if (
    status === 503 ||
    text.includes('unavailable') ||
    text.includes('not available') ||
    text.includes('not enabled') ||
    text.includes('unsupported') ||
    text.includes('not supported') ||
    (text.includes('not found') && text.includes('model'))
  ) {
    return 'model_unavailable';
  }

  return 'provider';
}

export function isGoogleImageRetryableProviderError(status: number, error?: GoogleProviderError) {
  return classifyGoogleImageProviderError(status, error) !== 'provider';
}

function redactGoogleProviderMessage(message: string | undefined) {
  return message?.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GOOGLE_API_KEY]');
}

function getProviderErrorDetailTypes(details: GoogleProviderErrorDetail[] | undefined) {
  return details
    ?.map((detail) => detail['@type'])
    .filter((type): type is string => typeof type === 'string' && type.length > 0);
}

function buildGoogleImageProviderMessage({
  errorType,
  model,
  retryAfterSeconds,
}: {
  errorType: GoogleImageProviderErrorType;
  model: string;
  retryAfterSeconds?: number;
}) {
  const retryMessage = retryAfterSeconds ? ` Retry after about ${retryAfterSeconds} seconds.` : '';

  if (errorType === 'quota') {
    return `Google image generation rate limits are blocking ${model}. Check the active AI Studio rate limits for the API key's Google Cloud project, or wait before retrying.${retryMessage}`;
  }

  if (errorType === 'billing') {
    return `Google image generation billing is blocking ${model}. Check that the API key's Google Cloud project has Gemini API billing enabled and is eligible for this image model.${retryMessage}`;
  }

  if (errorType === 'model_unavailable') {
    return `Google image model availability is blocking ${model}. Verify the API key's Google Cloud project can access this model in AI Studio and that the model is available in the current region/account.${retryMessage}`;
  }

  return `Google image generation failed for ${model}. Check the sanitized provider error details and retry after confirming the API key and request are valid.${retryMessage}`;
}

export function buildGoogleImageProviderErrorPayload({
  error,
  keyFingerprint,
  keySource,
  model,
  retryAfterHeader,
  status,
}: {
  error?: GoogleProviderError;
  keyFingerprint?: string;
  keySource?: string;
  model: string;
  retryAfterHeader?: string | null;
  status: number;
}): GoogleImageProviderErrorPayload {
  const retryAfterSeconds = parseGoogleRetryAfterSeconds({
    details: error?.details,
    message: error?.message,
    retryAfterHeader,
  });
  const errorType = classifyGoogleImageProviderError(status, error);

  return {
    error: true,
    errorType,
    isRetryable: errorType === 'quota' || errorType === 'model_unavailable',
    keyFingerprint,
    keySource,
    message: buildGoogleImageProviderMessage({ errorType, model, retryAfterSeconds }),
    model,
    provider: 'Google',
    providerCode: error?.code,
    providerError: redactGoogleProviderMessage(error?.message),
    providerStatus: error?.status,
    providerErrorDetailTypes: getProviderErrorDetailTypes(error?.details),
    retryAfterSeconds,
    statusCode: status,
  };
}

export function buildGoogleImageQuotaErrorPayload({
  error,
  keyFingerprint,
  keySource,
  model,
  retryAfterHeader,
  status = 429,
}: {
  error?: GoogleProviderError;
  keyFingerprint?: string;
  keySource?: string;
  model: string;
  retryAfterHeader?: string | null;
  status?: number;
}): GoogleImageProviderErrorPayload {
  return buildGoogleImageProviderErrorPayload({
    error,
    keyFingerprint,
    keySource,
    model,
    retryAfterHeader,
    status,
  });
}
