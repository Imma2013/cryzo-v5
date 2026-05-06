import { generateId } from 'ai';
import { storeGeneratedImage } from './generated-image-store';
import {
  DEFAULT_GOOGLE_IMAGE_MODEL_ID,
  isSupportedGoogleImageModel,
  normalizeGoogleImageModel,
} from '~/lib/llm/google-catalog';
import {
  buildGoogleImageQuotaErrorPayload,
  GoogleImageQuotaError,
  isGoogleImageRetryableProviderError,
} from '~/lib/llm/google-image-errors';

type ImageReference = {
  dataUrl: string;
};

type GenerateGoogleImageOptions = {
  apiKey: string;
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  model?: string;
  prompt: string;
  references?: ImageReference[];
};

type GeneratedImageResult = {
  images: Array<{
    data: string;
    mimeType: string;
    url: string;
  }>;
  model: string;
  text: string;
};

type GoogleImageApiResult = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: {
    code?: number;
    details?: Array<Record<string, unknown>>;
    message?: string;
    status?: string;
  };
};

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

export async function generateGoogleImage({
  apiKey,
  aspectRatio,
  imageSize,
  model,
  prompt,
  references = [],
}: GenerateGoogleImageOptions): Promise<GeneratedImageResult> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error('Prompt is required.');
  }

  const selectedModel = normalizeGoogleImageModel(model);

  if (!isSupportedGoogleImageModel(selectedModel)) {
    throw new Error(`Unsupported Google image model: ${selectedModel}`);
  }

  const parts: Array<Record<string, unknown>> = [];

  for (const reference of references) {
    const parsed = parseDataUrl(reference.dataUrl);

    if (parsed) {
      parts.push({
        inlineData: parsed,
      });
    }
  }

  parts.push({ text: trimmedPrompt });

  const modelToUse = DEFAULT_GOOGLE_IMAGE_MODEL_ID;
  const generationConfig: Record<string, unknown> = {
    responseModalities: ['Image'],
    imageConfig: {
      aspectRatio: aspectRatio || '1:1',
    },
  };

  if (imageSize) {
    (generationConfig.imageConfig as Record<string, unknown>).imageSize = imageSize;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts,
        },
      ],
      generationConfig,
    }),
  });

  const result = (await response.json()) as GoogleImageApiResult;

  if (!response.ok) {
    if (isGoogleImageRetryableProviderError(response.status, result.error)) {
      throw new GoogleImageQuotaError(
        buildGoogleImageQuotaErrorPayload({
          error: result.error,
          model: modelToUse,
          retryAfterHeader: response.headers.get('Retry-After'),
        }),
        response.status,
      );
    }

    throw new Error(result.error?.message || 'Google image generation failed.');
  }

  const responseParts = result.candidates?.[0]?.content?.parts || [];
  const text = responseParts
    .filter((part) => part.text)
    .map((part) => part.text)
    .join('\n')
    .trim();

  const images = responseParts
    .filter((part) => part.inlineData?.data)
    .map((part) => {
      const id = generateId();
      const mimeType = part.inlineData?.mimeType || 'image/png';
      const data = part.inlineData?.data || '';

      storeGeneratedImage(id, { data, mimeType });

      return {
        data,
        mimeType,
        url: `/api/generated-image/${id}`,
      };
    });

  if (images.length === 0) {
    throw new Error(text || 'Google image generation returned no image output.');
  }

  return {
    images,
    model: modelToUse,
    text,
  };
}
