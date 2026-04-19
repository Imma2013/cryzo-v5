import type { ModelInfo } from '~/lib/modules/llm/types';
import {
  getDefaultGoogleImageModel,
  getGoogleChatModels,
  getGoogleImageModels,
  type GoogleImageModelInfo,
} from './google-catalog';

type GoogleCatalogSource = 'live' | 'fallback' | 'missing';

type GoogleApiModel = {
  baseModelId?: string;
  description?: string;
  displayName?: string;
  inputTokenLimit?: number;
  name?: string;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
};

type GoogleModelsListResponse = {
  models?: GoogleApiModel[];
};

export type GoogleResolvedCatalog = {
  catalogSource: GoogleCatalogSource;
  chatModels: ModelInfo[];
  imageModels: GoogleImageModelInfo[];
  lastResolvedAt?: string;
};

const GOOGLE_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL_FETCH_TIMEOUT_MS = 5_000;
const CURATED_CHAT_MODELS = getGoogleChatModels();
const CURATED_IMAGE_MODELS = getGoogleImageModels();
const CURATED_CHAT_MODEL_NAMES = new Set(CURATED_CHAT_MODELS.map((model) => model.name));
const CURATED_IMAGE_MODEL_IDS = new Set(CURATED_IMAGE_MODELS.map((model) => model.id));

function supportsGenerateContent(model: GoogleApiModel) {
  return model.supportedGenerationMethods?.includes('generateContent') ?? false;
}

function normalizeGoogleModelName(model: GoogleApiModel) {
  const resourceName = model.name?.startsWith('models/') ? model.name.slice('models/'.length) : model.name;
  return model.baseModelId || resourceName;
}

function mapChatModel(model: GoogleApiModel, fallback: ModelInfo): ModelInfo {
  return {
    name: fallback.name,
    label: fallback.label,
    provider: 'Google',
    maxTokenAllowed: model.inputTokenLimit || fallback.maxTokenAllowed,
    maxCompletionTokens: model.outputTokenLimit || fallback.maxCompletionTokens,
  };
}

function mapImageModel(model: GoogleApiModel, fallback: GoogleImageModelInfo): GoogleImageModelInfo {
  return {
    id: fallback.id,
    label: fallback.label,
    description: model.description || fallback.description,
    defaultImageSize: fallback.defaultImageSize,
  };
}

function fallbackCatalog(): GoogleResolvedCatalog {
  return {
    catalogSource: 'fallback',
    chatModels: CURATED_CHAT_MODELS,
    imageModels: CURATED_IMAGE_MODELS,
    lastResolvedAt: new Date().toISOString(),
  };
}

export async function resolveGoogleCatalog(apiKey?: string): Promise<GoogleResolvedCatalog> {
  if (!apiKey) {
    return {
      catalogSource: 'missing',
      chatModels: [],
      imageModels: [],
    };
  }

  try {
    const response = await fetch(GOOGLE_MODELS_ENDPOINT, {
      headers: {
        'x-goog-api-key': apiKey,
      },
      signal: AbortSignal.timeout(MODEL_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return fallbackCatalog();
    }

    const payload = (await response.json()) as GoogleModelsListResponse;
    const models = Array.isArray(payload.models) ? payload.models.filter(supportsGenerateContent) : [];
    const modelMap = new Map(models.map((model) => [normalizeGoogleModelName(model), model]));

    const chatModels = CURATED_CHAT_MODELS.filter((model) => modelMap.has(model.name)).map((model) =>
      mapChatModel(modelMap.get(model.name)!, model),
    );
    const imageModels = CURATED_IMAGE_MODELS.filter((model) => modelMap.has(model.id)).map((model) =>
      mapImageModel(modelMap.get(model.id)!, model),
    );

    if (chatModels.length === 0 && imageModels.length === 0) {
      return fallbackCatalog();
    }

    return {
      catalogSource: 'live',
      chatModels: chatModels.length > 0 ? chatModels : CURATED_CHAT_MODELS,
      imageModels: imageModels.length > 0 ? imageModels : CURATED_IMAGE_MODELS,
      lastResolvedAt: new Date().toISOString(),
    };
  } catch {
    return fallbackCatalog();
  }
}

export function getAllowedGoogleChatModelNames() {
  return Array.from(CURATED_CHAT_MODEL_NAMES);
}

export function getAllowedGoogleImageModelIds() {
  return Array.from(CURATED_IMAGE_MODEL_IDS);
}

export function getFallbackGoogleCatalog() {
  return fallbackCatalog();
}

export function getFallbackGoogleImageModel() {
  return getDefaultGoogleImageModel();
}
