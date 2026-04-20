import { generateId } from 'ai';
import { storeGeneratedImage } from './generated-image-store';
import { getDefaultGoogleImageModel, isSupportedGoogleImageModel } from '~/lib/llm/google-catalog';

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

  if (model && !isSupportedGoogleImageModel(model)) {
    throw new Error(`Unsupported Google image model: ${model}`);
  }

  const selectedModel = model || getDefaultGoogleImageModel().id;
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

  const generationConfig: Record<string, unknown> = {
    responseModalities: ['Image'],
    imageConfig: {
      aspectRatio: aspectRatio || '1:1',
    },
  };

  if (imageSize && selectedModel !== 'gemini-2.5-flash-image') {
    (generationConfig.imageConfig as Record<string, unknown>).imageSize = imageSize;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`, {
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

  const result = (await response.json()) as {
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
      message?: string;
    };
  };

  if (!response.ok) {
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
    model: selectedModel,
    text,
  };
}
