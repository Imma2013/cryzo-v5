import { json, type LoaderFunction } from '@remix-run/node';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getServerEnv } from '~/lib/server-env';

export const loader: LoaderFunction = async ({ context, request }) => {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');

    if (!provider) {
      return json({ isSet: false, source: 'missing' as const });
    }

    const serverEnv = getServerEnv(context as any);
    const llmManager = LLMManager.getInstance(serverEnv as Record<string, string>);
    const providerInstance = llmManager.getProvider(provider);

    if (!providerInstance || !providerInstance.config.apiTokenKey) {
      return json({ isSet: false, source: 'missing' as const });
    }

    const envVarName = providerInstance.config.apiTokenKey;
    const isSet = Boolean(serverEnv[envVarName] || llmManager.env[envVarName]);

    return json(
      { isSet, source: isSet ? 'server_env' : 'missing' },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch {
    return json({ isSet: false, source: 'missing' as const }, { status: 200 });
  }
};
