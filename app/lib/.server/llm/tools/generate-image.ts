import { generateId, tool } from 'ai';
import { z } from 'zod';
import { generateGoogleImage } from '~/lib/.server/images/google-image-generation';

type GeneratedImageAsset = {
  data: string;
  filePath: string;
  id: string;
  mimeType: string;
};

type CreateGenerateImageToolOptions = {
  apiKey?: string;
  existingFiles?: string[];
  onGeneratedImageAsset?: (asset: GeneratedImageAsset) => void;
};

type GenerateProjectImagesOptions = {
  apiKey: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '3:2' | '2:3';
  existingFiles?: string[];
  imageSize?: '1K' | '2K' | '4K';
  model?: 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';
  onGeneratedImageAsset?: (asset: GeneratedImageAsset) => void;
  prompt: string;
  targetPath?: string;
};

const DEFAULT_PUBLIC_DIR = 'public/ai-generated';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function getExtensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}

function sanitizeProjectPath(targetPath: string | undefined, prompt: string, mimeType: string) {
  const normalized = (targetPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  const extension = getExtensionForMimeType(mimeType);
  const defaultFileName = `${slugify(prompt) || 'generated-image'}.${extension}`;

  if (segments.length === 0) {
    return `${DEFAULT_PUBLIC_DIR}/${defaultFileName}`;
  }

  const lastSegment = segments[segments.length - 1];
  const hasExtension = /\.[a-z0-9]+$/i.test(lastSegment);

  if (segments[0] !== 'public') {
    return `${DEFAULT_PUBLIC_DIR}/${defaultFileName}`;
  }

  if (!hasExtension) {
    segments.push(defaultFileName);
  }

  const joined = segments.join('/');
  return /\.[a-z0-9]+$/i.test(joined) ? joined : `${joined}.${extension}`;
}

function ensureUniquePath(filePath: string, existingPaths: Set<string>) {
  if (!existingPaths.has(filePath)) {
    existingPaths.add(filePath);
    return filePath;
  }

  const match = filePath.match(/^(.*?)(\.[^.]+)$/);
  const basePath = match?.[1] || filePath;
  const extension = match?.[2] || '';
  let suffix = 2;

  while (existingPaths.has(`${basePath}-${suffix}${extension}`)) {
    suffix++;
  }

  const uniquePath = `${basePath}-${suffix}${extension}`;
  existingPaths.add(uniquePath);
  return uniquePath;
}

export async function generateProjectImages({
  apiKey,
  aspectRatio,
  existingFiles = [],
  imageSize,
  model,
  onGeneratedImageAsset,
  prompt,
  targetPath,
}: GenerateProjectImagesOptions) {
  const result = await generateGoogleImage({
    apiKey,
    aspectRatio,
    imageSize,
    model,
    prompt,
  });

  const usedPaths = new Set(existingFiles.map((filePath) => filePath.replace(/^\/+/, '')));
  const images = result.images.map((image) => {
    const requestedPath = sanitizeProjectPath(targetPath, prompt, image.mimeType);
    const filePath = ensureUniquePath(requestedPath, usedPaths);
    const asset = {
      data: image.data,
      filePath,
      id: generateId(),
      mimeType: image.mimeType,
    };

    onGeneratedImageAsset?.(asset);
    return asset;
  });

  return {
    images: images.map((image) => ({
      filePath: image.filePath,
      mimeType: image.mimeType,
      urlPath: `/${image.filePath.replace(/^public\/+/, '')}`,
    })),
    model: result.model,
    text: result.text,
  };
}

export function createGenerateImageTool({ apiKey, existingFiles = [], onGeneratedImageAsset }: CreateGenerateImageToolOptions) {
  return tool({
    description:
      'Generate first-party images for the current build, save them into public/ai-generated/, and return stable local URL paths that should be used directly in generated code. Use this instead of stock-photo URLs whenever imagery is needed.',
    parameters: z.object({
      prompt: z.string().min(1).describe('Detailed prompt describing the desired image, composition, mood, and style.'),
      aspectRatio: z
        .enum(['1:1', '16:9', '9:16', '3:2', '2:3'])
        .optional()
        .describe('Preferred image aspect ratio.'),
      imageSize: z.enum(['1K', '2K', '4K']).optional().describe('Requested render size when supported by the model.'),
      model: z
        .enum(['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'])
        .optional()
        .describe('Google Gemini image model to use.'),
      targetPath: z
        .string()
        .optional()
        .describe('Optional project-relative file path under public/, for example public/ai-generated/hero-chair.png.'),
    }),
    execute: async ({ prompt, aspectRatio, imageSize, model, targetPath }) => {
      if (!apiKey) {
        throw new Error('Missing Google API key. Set the Google provider key first.');
      }
      return generateProjectImages({
        apiKey,
        aspectRatio,
        existingFiles,
        imageSize,
        model,
        onGeneratedImageAsset,
        prompt,
        targetPath,
      });
    },
  });
}
