import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import { isSupportedGoogleImageModel } from '~/lib/llm/google-catalog';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';
import { logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { withSecurity } from '~/lib/security';
import { getServerEnv } from '~/lib/server-env';

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type ImageInput = {
  source: 'project' | 'upload';
  path?: string;
  data?: string;
  mimeType: string;
};

const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const IMAGE_MODEL_ALIASES: Record<string, string> = {
  'gemini-3.1-flash-image-preview': DEFAULT_IMAGE_MODEL,
};

function normalizeImageModel(model?: string) {
  if (!model?.trim()) {
    return DEFAULT_IMAGE_MODEL;
  }

  return IMAGE_MODEL_ALIASES[model] || model;
}

function buildImageParts(prompt: string, inputs: ImageInput[] = []) {
  return [
    { text: prompt },
    ...inputs
      .filter((input) => input.data && input.mimeType)
      .map((input) => ({
        inlineData: {
          mimeType: input.mimeType,
          data: input.data!,
        },
      })),
  ];
}

function jsonResponse(payload: unknown, status = 200, responseHeaders?: Headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: withSupabaseAuthHeaders(
      {
        'Content-Type': 'application/json',
      },
      responseHeaders,
    ),
  });
}

async function imageAction({ context, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return jsonResponse({ message: 'Method not allowed.' }, 405);
  }

  const serverEnv = getServerEnv(context as any) as Record<string, string>;
  let responseHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before generating images.',
    });
    responseHeaders = auth.responseHeaders;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }

  const googleKeyResolution = resolveGoogleServerApiKeyForRuntime(serverEnv);
  logGoogleServerKeyResolution('api.image', googleKeyResolution);

  if (!googleKeyResolution.key) {
    return jsonResponse(
      {
        message: 'Missing Google API key on the server. Configure GOOGLE_GENERATIVE_AI_API_KEY before generating images.',
      },
      401,
      responseHeaders,
    );
  }

  const { prompt, model, aspectRatio, operation = 'generate', inputs = [] } = await request.json<{
    filePath: string;
    prompt: string;
    operation?: 'generate' | 'edit';
    model?: string;
    aspectRatio?: string;
    inputs?: ImageInput[];
  }>();

  if (!prompt?.trim()) {
    return jsonResponse({ message: 'Image prompt is required.' }, 400, responseHeaders);
  }

  if (operation === 'edit' && inputs.length === 0) {
    return jsonResponse({ message: 'Image edit actions require at least one input image.' }, 400, responseHeaders);
  }

  const selectedModel = normalizeImageModel(model);

  if (!isSupportedGoogleImageModel(selectedModel)) {
    return jsonResponse(
      {
        message: `Unsupported Google image model: ${selectedModel}`,
      },
      400,
      responseHeaders,
    );
  }

  const payload = {
    contents: [
      {
        parts: buildImageParts(prompt, inputs),
      },
    ],
    generationConfig: {
      responseModalities: ['Image'],
      imageConfig: {
        ...(aspectRatio ? { aspectRatio } : {}),
      },
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': googleKeyResolution.key,
      },
      body: JSON.stringify(payload),
    },
  );

  const result = (await response.json()) as {
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{
      finishReason?: string;
      content?: {
        parts?: GeminiPart[];
      };
    }>;
  };

  if (!response.ok) {
    return jsonResponse(
      {
        message: result.error?.message || 'Google image generation request failed.',
        providerError: result.error?.message,
      },
      response.status,
      responseHeaders,
    );
  }

  const imagePart = result.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => {
    return Boolean(part.inlineData?.data);
  });

  if (!imagePart?.inlineData?.data) {
    const providerError =
      result.promptFeedback?.blockReason || result.candidates?.find((candidate) => candidate.finishReason)?.finishReason;

    return jsonResponse(
      {
        message: providerError ? `The model did not return an image (${providerError}).` : 'The model did not return an image.',
        providerError,
      },
      502,
      responseHeaders,
    );
  }

  return jsonResponse(
    {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      model: selectedModel,
      operation,
    },
    200,
    responseHeaders,
  );
}

export const action = withSecurity(imageAction, {
  allowedMethods: ['POST'],
});
