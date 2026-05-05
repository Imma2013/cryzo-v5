import type { ModelInfo } from '~/lib/modules/llm/types';

export type GoogleImageModelInfo = {
  id: string;
  label: string;
  description: string;
  defaultImageSize?: '1K' | '2K' | '4K';
};

export const DEFAULT_GOOGLE_IMAGE_MODEL_ID = 'gemini-3.1-flash-image-preview';
export const GOOGLE_IMAGE_FALLBACK_MODEL_ID = 'gemini-3-pro-image-preview';

const GOOGLE_CHAT_MODELS: readonly ModelInfo[] = [
  {
    name: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (Preview)',
    provider: 'Google',
    maxTokenAllowed: 1048576,
    maxCompletionTokens: 65535,
  },
  {
    name: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview)',
    provider: 'Google',
    maxTokenAllowed: 1048576,
    maxCompletionTokens: 65535,
  },
  {
    name: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    maxTokenAllowed: 1048576,
    maxCompletionTokens: 65535,
  },
  {
    name: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    maxTokenAllowed: 1048576,
    maxCompletionTokens: 65535,
  },
] as const;

export const GOOGLE_TEXT_MODEL_FALLBACK_ORDER = GOOGLE_CHAT_MODELS.map((model) => model.name);

const GOOGLE_IMAGE_MODELS: readonly GoogleImageModelInfo[] = [
  {
    id: DEFAULT_GOOGLE_IMAGE_MODEL_ID,
    label: 'Gemini 3.1 Flash Image (Preview)',
    description: 'Standard model for fast image generation and variation.',
  },
  {
    id: GOOGLE_IMAGE_FALLBACK_MODEL_ID,
    label: 'Nano Banana Pro',
    description: 'Best for polished assets and harder art direction.',
    defaultImageSize: '2K',
  },
  {
    id: 'gemini-2.5-flash-image',
    label: 'Nano Banana',
    description: 'Legacy manual option for quick image generation and variation.',
  },
] as const;

const GOOGLE_IMAGE_MODEL_ALIASES: Readonly<Record<string, GoogleImageModelInfo['id']>> = {
  'gemini-2.5-flash-preview-image': 'gemini-2.5-flash-image',
};

export function getGoogleChatModels(): ModelInfo[] {
  return GOOGLE_CHAT_MODELS.map((model) => ({ ...model }));
}

export function getGoogleTextModelFallbackOrder(): string[] {
  return [...GOOGLE_TEXT_MODEL_FALLBACK_ORDER];
}

export function normalizeGoogleChatModel(model: string | undefined): string {
  return isSupportedGoogleChatModel(model) ? model : GOOGLE_TEXT_MODEL_FALLBACK_ORDER[0];
}

export function isSupportedGoogleChatModel(model: string | undefined): model is ModelInfo['name'] {
  return Boolean(model && GOOGLE_CHAT_MODELS.some((entry) => entry.name === model));
}

export function getGoogleImageModels(): GoogleImageModelInfo[] {
  return GOOGLE_IMAGE_MODELS.map((model) => ({ ...model }));
}

export function isSupportedGoogleImageModel(model: string | undefined): model is GoogleImageModelInfo['id'] {
  return Boolean(model && GOOGLE_IMAGE_MODELS.some((entry) => entry.id === model));
}

export function normalizeGoogleImageModel(model: string | undefined): GoogleImageModelInfo['id'] | string {
  const trimmedModel = model?.trim();

  if (!trimmedModel) {
    return getDefaultGoogleImageModel().id;
  }

  return GOOGLE_IMAGE_MODEL_ALIASES[trimmedModel] || trimmedModel;
}

export function getDefaultGoogleImageModel(): GoogleImageModelInfo {
  return { ...GOOGLE_IMAGE_MODELS[0] };
}
