import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { generateGoogleImage } from '~/lib/.server/images/google-image-generation';
import { getServerEnv } from '~/lib/server-env';
import { logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';

type GenerateImageRequest = Parameters<typeof generateGoogleImage>[0] & {
  prompt?: string;
};

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function action({ context, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return badRequest('Method not allowed', 405);
  }

  const serverEnv = getServerEnv(context as any) as Record<string, string>;
  const googleKeyResolution = resolveGoogleServerApiKeyForRuntime(serverEnv);
  logGoogleServerKeyResolution('api.image-generate', googleKeyResolution);

  if (!googleKeyResolution.key) {
    return badRequest('Missing Google API key on the server. Set GOOGLE_GENERATIVE_AI_API_KEY first.', 401);
  }

  const body = (await request.json()) as GenerateImageRequest;
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return badRequest('Prompt is required.');
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

    return new Response(
      JSON.stringify({
        ok: true,
        images: result.images.map((image) => ({
          mimeType: image.mimeType,
          data: image.data,
          url: image.url,
        })),
        text: result.text,
        model: result.model,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Nano Banana image generation failed.', 502);
  }
}
