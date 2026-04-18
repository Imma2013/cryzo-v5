import type { LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getServerEnv } from '~/lib/server-env';

export const loader: LoaderFunction = async ({ context, request }) => {
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

  if (provider === 'Google') {
    const isSet = !!(
      serverEnv.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      llmManager.env.GOOGLE_GENERATIVE_AI_API_KEY
    );

    return Response.json({ isSet });
  }

  const isSet = !!(serverEnv[envVarName] || process.env[envVarName] || llmManager.env[envVarName]);

  return Response.json({ isSet });
};
