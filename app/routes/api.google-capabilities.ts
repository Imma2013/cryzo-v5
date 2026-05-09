import { json, type LoaderFunction } from '@remix-run/node';
import { getServerEnv } from '~/lib/server-env';
import { logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';
import { resolveGoogleCatalog } from '~/lib/llm/google-catalog.server';

export const loader: LoaderFunction = async ({ context }) => {
  const serverEnv = getServerEnv(context as any);
  const resolution = resolveGoogleServerApiKeyForRuntime(serverEnv);
  logGoogleServerKeyResolution('api.google-capabilities', resolution);
  const catalog = await resolveGoogleCatalog(resolution.key);

  return json(
    {
      configured: resolution.hasKey,
      source: resolution.source,
      catalogSource: catalog.catalogSource,
      lastResolvedAt: catalog.lastResolvedAt,
      chatModels: resolution.hasKey ? catalog.chatModels : [],
      imageModels: resolution.hasKey ? catalog.imageModels : [],
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
};
