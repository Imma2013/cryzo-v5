import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { GOOGLE_PROVIDER_NAME } from './provider-setup';

interface ResolveActiveProviderSelectionOptions {
  activeProviders: ProviderInfo[];
  currentProviderName?: string;
  preferredProviderName?: string;
  savedProviderName?: string;
}

interface ResolveProviderModelSelectionOptions {
  modelList: ModelInfo[];
  providerName?: string;
  currentModel?: string;
  preferredModel?: string;
  savedModel?: string;
}

export function resolveActiveProviderSelection({
  activeProviders,
  currentProviderName: _currentProviderName,
  preferredProviderName: _preferredProviderName,
  savedProviderName: _savedProviderName,
}: ResolveActiveProviderSelectionOptions): ProviderInfo | undefined {
  if (activeProviders.length === 0) {
    return undefined;
  }

  return activeProviders.find((provider) => provider.name === GOOGLE_PROVIDER_NAME) || activeProviders[0];
}

export function resolveProviderModelSelection({
  modelList,
  providerName: _providerName,
  currentModel: _currentModel,
  preferredModel: _preferredModel,
  savedModel: _savedModel,
}: ResolveProviderModelSelectionOptions): string | undefined {
  const providerModels = modelList.filter((model) => model.provider === GOOGLE_PROVIDER_NAME);

  if (providerModels.length === 0) {
    return undefined;
  }

  return providerModels[0].name;
}
