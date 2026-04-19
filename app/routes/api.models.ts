import { json } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { getServerEnv } from '~/lib/server-env';
import { isGoogleServerConfigured } from '~/lib/llm/provider-setup';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function getProviderInfo(llmManager: LLMManager, includeGoogle: boolean) {
  const eligibleProviders = llmManager
    .getAllProviders()
    .filter((provider) => includeGoogle || provider.name !== 'Google');

  if (!cachedProviders || cachedProviders.some((provider) => provider.name === 'Google') !== includeGoogle) {
    cachedProviders = eligibleProviders.map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  if (!cachedDefaultProvider || (cachedDefaultProvider.name === 'Google' && !includeGoogle)) {
    const defaultProvider =
      eligibleProviders.find((provider) => provider.name === 'Google') ||
      eligibleProviders[0] ||
      llmManager.getDefaultProvider();
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

  // Get client side maintained API keys and provider settings from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);
  const includeGoogle = isGoogleServerConfigured(serverEnv as Record<string, string>);

  const { providers, defaultProvider } = getProviderInfo(llmManager, includeGoogle);

  let modelList: ModelInfo[] = [];

  if (params.provider) {
    // Only update models for the specific provider
    const provider = llmManager.getProvider(params.provider);

    if (provider) {
      if (provider.name === 'Google' && !includeGoogle) {
        modelList = [];
      } else {
      modelList = await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as Record<string, string>,
      });
      }
    }
  } else {
    // Update all models
    modelList = await llmManager.updateModelList({
      apiKeys,
      providerSettings,
      serverEnv: serverEnv as Record<string, string>,
    });

    if (!includeGoogle) {
      modelList = modelList.filter((model) => model.provider !== 'Google');
    }
  }

  return json<ModelsResponse>({
    modelList,
    providers,
    defaultProvider,
  });
}
