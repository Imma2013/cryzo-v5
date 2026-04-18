import type { LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getServerEnv } from '~/lib/server-env';

export const loader: LoaderFunction = async ({ context, request }) => {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');

    if (!provider) {
      return Response.json({ isSet: false });
    }

    const serverEnv = getServerEnv(context as any);
    const llmManager = LLMManager.getInstance(serverEnv as Record<string, string>);
    const providerInstance = llmManager.getProvider(provider);

    if (!providerInstance || !providerInstance.config.apiTokenKey) {
      return Response.json({ isSet: false });
    }

    const envVarName = providerInstance.config.apiTokenKey;
    const isSet = Boolean(serverEnv[envVarName] || llmManager.env[envVarName]);

    return Response.json(
      { isSet },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch {
    return Response.json({ isSet: false }, { status: 200 });
  }
};
