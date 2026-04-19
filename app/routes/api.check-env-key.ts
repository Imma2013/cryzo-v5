import { json, type LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getServerEnv } from '~/lib/server-env';
import { GOOGLE_PROVIDER_NAME, logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';

export const loader: LoaderFunction = async ({ context, request }) => {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');

    if (!provider) {
      return json({ isSet: false, source: 'missing' as const });
    }

    if (provider === GOOGLE_PROVIDER_NAME) {
      const serverEnv = getServerEnv(context as any);
      const resolution = resolveGoogleServerApiKeyForRuntime(serverEnv);
      logGoogleServerKeyResolution('api.check-env-key', resolution);

      return json(
        { isSet: resolution.hasKey, source: resolution.source },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
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
