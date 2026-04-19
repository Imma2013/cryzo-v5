import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

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
  currentProviderName,
  preferredProviderName,
  savedProviderName,
}: ResolveActiveProviderSelectionOptions): ProviderInfo | undefined {
  if (activeProviders.length === 0) {
    return undefined;
  }

  return (
    activeProviders.find((provider) => provider.name === preferredProviderName) ||
    activeProviders.find((provider) => provider.name === currentProviderName) ||
    activeProviders.find((provider) => provider.name === savedProviderName) ||
    activeProviders[0]
  );
}

export function resolveProviderModelSelection({
  modelList,
  providerName,
  currentModel,
  preferredModel,
  savedModel,
}: ResolveProviderModelSelectionOptions): string | undefined {
  if (!providerName) {
    return undefined;
  }

  const providerModels = modelList.filter((model) => model.provider === providerName);

  if (providerModels.length === 0) {
    return undefined;
  }

  if (preferredModel && providerModels.some((model) => model.name === preferredModel)) {
    return preferredModel;
  }

  if (currentModel && providerModels.some((model) => model.name === currentModel)) {
    return currentModel;
  }

  if (savedModel && providerModels.some((model) => model.name === savedModel)) {
    return savedModel;
  }

  return providerModels[0].name;
}
