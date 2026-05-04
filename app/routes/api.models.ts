import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getServerEnv } from '~/lib/server-env';
import { getGoogleProviderSetupPayloadForRuntime } from '~/lib/llm/google-server-runtime';
import { GOOGLE_PROVIDER_NAME } from '~/lib/llm/provider-setup';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function getProviderInfo(llmManager: LLMManager) {
  const eligibleProviders = llmManager.getAllProviders().filter((provider) => provider.name === GOOGLE_PROVIDER_NAME);

  if (!cachedProviders) {
    cachedProviders = eligibleProviders.map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = eligibleProviders[0] || llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

export async function loader({
  request,
  params,
  context,
}: {
  request: Request;
  params: { provider?: string };
  context: {
    cloudflare?: {
      env: Record<string, string>;
    };
  };
}): Promise<Response> {
  const serverEnv = getServerEnv(context as any);
  const llmManager = LLMManager.getInstance(serverEnv as Record<string, string>);
  const setupPayload = getGoogleProviderSetupPayloadForRuntime(GOOGLE_PROVIDER_NAME, serverEnv);

  if (setupPayload) {
    return new Response(JSON.stringify(setupPayload), {
      status: setupPayload.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Service Unavailable',
    });
  }

  const { providers, defaultProvider } = getProviderInfo(llmManager);

  let modelList: ModelInfo[] = [];

  if (params.provider) {
    // Only update models for the specific provider
    const provider = llmManager.getProvider(params.provider);

    if (provider?.name === GOOGLE_PROVIDER_NAME) {
      modelList = await llmManager.getModelListFromProvider(provider, {
        serverEnv: serverEnv as Record<string, string>,
      });
    }
  } else {
    // Update all models
    modelList = await llmManager.updateModelList({
      serverEnv: serverEnv as Record<string, string>,
    });
  }

  return json<ModelsResponse>({
    modelList,
    providers,
    defaultProvider,
  });
}
