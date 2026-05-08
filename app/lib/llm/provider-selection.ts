import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { DEFAULT_LLM_PROVIDER_NAME, DEFAULT_OPENAI_MODEL } from './provider-defaults';

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
    activeProviders.find((provider) => provider.name === savedProviderName) ||
    activeProviders.find((provider) => provider.name === DEFAULT_LLM_PROVIDER_NAME) ||
    activeProviders.find((provider) => provider.name === currentProviderName) ||
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
  const effectiveProviderName = providerName || DEFAULT_LLM_PROVIDER_NAME;
  const providerModels = modelList.filter((model) => model.provider === effectiveProviderName);

  if (providerModels.length === 0) {
    return undefined;
  }

  return (
    providerModels.find((model) => model.name === preferredModel)?.name ||
    providerModels.find((model) => model.name === savedModel)?.name ||
    providerModels.find((model) => model.name === currentModel)?.name ||
    providerModels.find((model) => model.name === DEFAULT_OPENAI_MODEL)?.name ||
    providerModels[0].name
  );
}
