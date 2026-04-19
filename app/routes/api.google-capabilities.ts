import { json, type LoaderFunction } from '@remix-run/cloudflare';
import { getGoogleChatModels, getGoogleImageModels } from '~/lib/llm/google-catalog';
import { getServerEnv } from '~/lib/server-env';
import { logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';

export const loader: LoaderFunction = async ({ context }) => {
  const serverEnv = getServerEnv(context as any);
  const resolution = resolveGoogleServerApiKeyForRuntime(serverEnv);
  logGoogleServerKeyResolution('api.google-capabilities', resolution);

  return json(
    {
      configured: resolution.hasKey,
      source: resolution.source,
      chatModels: resolution.hasKey ? getGoogleChatModels() : [],
      imageModels: resolution.hasKey ? getGoogleImageModels() : [],
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
};
