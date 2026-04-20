import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { getServerEnv } from '~/lib/server-env';
import { logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';
import { isSupportedGoogleImageModel } from '~/lib/llm/google-catalog';
import { getBearerTokenFromAuthorizationHeader, verifyFirebaseIdToken } from '~/lib/auth/firebase-server';

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

export async function imageAction({ context, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'Method not allowed.' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const serverEnv = getServerEnv(context as any) as Record<string, string>;
  const authHeader = request.headers.get('Authorization');
  const firebaseIdToken = getBearerTokenFromAuthorizationHeader(authHeader);

  if (!firebaseIdToken) {
    return new Response(
      JSON.stringify({
        error: true,
        errorType: 'auth_required',
        isRetryable: false,
        message: 'Sign in with Firebase before generating images.',
        provider: 'Cryzo',
        statusCode: 401,
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
        statusText: 'Unauthorized',
      },
    );
  }

  try {
    await verifyFirebaseIdToken(firebaseIdToken, serverEnv as any);
  } catch {
    return new Response(
      JSON.stringify({
        error: true,
        errorType: 'auth_required',
        isRetryable: false,
        message: 'Sign in with Firebase before generating images.',
        provider: 'Cryzo',
        statusCode: 401,
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
        statusText: 'Unauthorized',
      },
    );
  }

  const googleKeyResolution = resolveGoogleServerApiKeyForRuntime(serverEnv);
  logGoogleServerKeyResolution('api.image', googleKeyResolution);

  if (!googleKeyResolution.key) {
    return new Response(
      JSON.stringify({
        message: 'Missing Google API key on the server. Configure GOOGLE_GENERATIVE_AI_API_KEY before generating images.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      },
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
    return new Response(JSON.stringify({ message: 'Image prompt is required.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  if (operation === 'edit' && inputs.length === 0) {
    return new Response(JSON.stringify({ message: 'Image edit actions require at least one input image.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const selectedModel = normalizeImageModel(model);

  if (!isSupportedGoogleImageModel(selectedModel)) {
    return new Response(
      JSON.stringify({
        message: `Unsupported Google image model: ${selectedModel}`,
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      },
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
    return new Response(
      JSON.stringify({
        message: result.error?.message || 'Google image generation request failed.',
        providerError: result.error?.message,
      }),
      {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }

  const imagePart = result.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => {
    return Boolean(part.inlineData?.data);
  });

  if (!imagePart?.inlineData?.data) {
    const providerError =
      result.promptFeedback?.blockReason || result.candidates?.find((candidate) => candidate.finishReason)?.finishReason;

    return new Response(
      JSON.stringify({
        message: providerError ? `The model did not return an image (${providerError}).` : 'The model did not return an image.',
        providerError,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }

  return new Response(
    JSON.stringify({
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      model: selectedModel,
      operation,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

export const action = withSecurity(imageAction, {
  allowedMethods: ['POST'],
});
