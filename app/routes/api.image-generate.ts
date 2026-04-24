import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateGoogleImage } from '~/lib/.server/images/google-image-generation';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';
import { logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { getServerEnv } from '~/lib/server-env';

type GenerateImageRequest = Parameters<typeof generateGoogleImage>[0] & {
  prompt?: string;
};

function jsonResponse(payload: unknown, status = 400, responseHeaders?: Headers) {
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

export async function action({ context, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: true, message: 'Method not allowed' }, 405);
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
  logGoogleServerKeyResolution('api.image-generate', googleKeyResolution);

  if (!googleKeyResolution.key) {
    return jsonResponse(
      { error: true, message: 'Missing Google API key on the server. Set GOOGLE_GENERATIVE_AI_API_KEY first.' },
      401,
      responseHeaders,
    );
  }

  const body = (await request.json()) as GenerateImageRequest;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return jsonResponse({ error: true, message: 'Prompt is required.' }, 400, responseHeaders);
  }

  try {
    const result = await generateGoogleImage({
      apiKey: googleKeyResolution.key,
      aspectRatio: body.aspectRatio,
      imageSize: body.imageSize,
      model: body.model,
      prompt,
      references: body.references,
    });

    return jsonResponse(
      {
        ok: true,
        images: result.images.map((image) => ({
          mimeType: image.mimeType,
          data: image.data,
          url: image.url,
        })),
        text: result.text,
        model: result.model,
      },
      200,
      responseHeaders,
    );
  } catch (error) {
    return jsonResponse(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Nano Banana image generation failed.',
      },
      502,
      responseHeaders,
    );
  }
}
