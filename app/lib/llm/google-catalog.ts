import type { ModelInfo } from '~/lib/modules/llm/types';

export type GoogleImageModelInfo = {
  id: string;
  label: string;
  description: string;
  defaultImageSize?: '1K' | '2K' | '4K';
};

const GOOGLE_CHAT_MODELS: readonly ModelInfo[] = [
  {
    name: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro (Preview)',
    provider: 'Google',
    maxTokenAllowed: 1048576,
    maxCompletionTokens: 65535,
  },
  {
    name: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (Preview)',
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
    name: 'gemini-flash-latest',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    maxTokenAllowed: 1048576,
    maxCompletionTokens: 65535,
  },
] as const;

const GOOGLE_IMAGE_MODELS: readonly GoogleImageModelInfo[] = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Nano Banana',
    description: 'Fastest path for quick image generation and variation.',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',
    description: 'Best for polished assets and harder art direction.',
    defaultImageSize: '2K',
  },
] as const;

export function getGoogleChatModels(): ModelInfo[] {
  return GOOGLE_CHAT_MODELS.map((model) => ({ ...model }));
}

export function getGoogleImageModels(): GoogleImageModelInfo[] {
  return GOOGLE_IMAGE_MODELS.map((model) => ({ ...model }));
}

export function isSupportedGoogleImageModel(model: string | undefined): model is GoogleImageModelInfo['id'] {
  return Boolean(model && GOOGLE_IMAGE_MODELS.some((entry) => entry.id === model));
}

export function getDefaultGoogleImageModel(): GoogleImageModelInfo {
  return { ...GOOGLE_IMAGE_MODELS[0] };
}
