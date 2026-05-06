import { createScopedLogger } from '~/utils/logger';
import { DEFAULT_GOOGLE_IMAGE_MODEL_ID } from './google-catalog';

type GoogleModelListResponse = {
  error?: {
    code?: number;
    details?: Array<Record<string, unknown>>;
    message?: string;
    status?: string;
  };
  models?: Array<{
    baseModelId?: string;
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

type GoogleImageProbeResponse = {
  error?: {
    code?: number;
    details?: Array<Record<string, unknown>>;
    message?: string;
    status?: string;
  };
  candidates?: unknown[];
};

export type GoogleImageDiagnosticModelId =
  | 'gemini-2.5-flash-image'
  | 'gemini-3-pro-image-preview'
  | 'gemini-3.1-flash-image-preview';

const logger = createScopedLogger('google-image-diagnostics');
const GOOGLE_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DIAGNOSTIC_MODELS: GoogleImageDiagnosticModelId[] = [
  DEFAULT_GOOGLE_IMAGE_MODEL_ID,
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
];

function redactGoogleApiKeys(value: string | undefined) {
  return value?.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GOOGLE_API_KEY]');
}

function getDetailTypes(details: Array<Record<string, unknown>> | undefined) {
  return details
    ?.map((detail) => detail['@type'])
    .filter((type): type is string => typeof type === 'string' && type.length > 0);
}

export function sanitizeGoogleProviderError(error: GoogleModelListResponse['error'] | undefined) {
  if (!error) {
    return undefined;
  }

  return {
    code: error.code,
    detailTypes: getDetailTypes(error.details),
    message: redactGoogleApiKeys(error.message),
    status: error.status,
  };
}

export async function getGoogleApiKeyFingerprint(apiKey: string | undefined) {
  if (!apiKey) {
    return undefined;
  }

  const data = new TextEncoder().encode(apiKey);
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    const digest = await subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    return `sha256:${hex.slice(0, 12)}`;
  }

  let hash = 2166136261;

  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeModelName(model: { baseModelId?: string; name?: string }) {
  return model.baseModelId || (model.name?.startsWith('models/') ? model.name.slice('models/'.length) : model.name);
}

export async function inspectGoogleImageModelAccess(apiKey: string) {
  const response = await fetch(GOOGLE_MODELS_ENDPOINT, {
    headers: {
      'x-goog-api-key': apiKey,
    },
  });
  const payload = (await response.json()) as GoogleModelListResponse;
  const models = Array.isArray(payload.models) ? payload.models : [];
  const modelMap = new Map(models.map((model) => [normalizeModelName(model), model]));

  return {
    error: sanitizeGoogleProviderError(payload.error),
    models: DIAGNOSTIC_MODELS.map((modelId) => {
      const model = modelMap.get(modelId);

      return {
        id: modelId,
        listed: Boolean(model),
        supportsGenerateContent: model?.supportedGenerationMethods?.includes('generateContent') ?? false,
      };
    }),
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  };
}

export async function runGoogleImageProbe(apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GOOGLE_IMAGE_MODEL_ID}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: 'Generate a simple blue square app icon with no text.' }],
          },
        ],
        generationConfig: {
          responseModalities: ['Image'],
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      }),
    },
  );
  const payload = (await response.json()) as GoogleImageProbeResponse;

  return {
    candidateCount: payload.candidates?.length || 0,
    error: sanitizeGoogleProviderError(payload.error),
    model: DEFAULT_GOOGLE_IMAGE_MODEL_ID,
    ok: response.ok,
    retryAfter: response.headers.get('Retry-After'),
    status: response.status,
    statusText: response.statusText,
  };
}

export function logGoogleImageProviderFailure({
  context,
  error,
  keyFingerprint,
  keySource,
  model,
  retryAfterHeader,
  status,
}: {
  context: string;
  error?: GoogleModelListResponse['error'];
  keyFingerprint?: string;
  keySource?: string;
  model: string;
  retryAfterHeader?: string | null;
  status: number;
}) {
  logger.warn(
    JSON.stringify({
      context,
      error: sanitizeGoogleProviderError(error),
      keyFingerprint,
      keySource,
      model,
      retryAfterHeader,
      status,
    }),
  );
}
