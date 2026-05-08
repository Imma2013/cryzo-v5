import type { IProviderConfig, IProviderSetting } from '~/types/model';
import { DEFAULT_LLM_PROVIDER_NAME } from './provider-defaults';

export interface SyncedLlmPreferences {
  providerSettings?: Record<string, IProviderSetting>;
  selectedProvider?: string;
  selectedModel?: string;
}

export function createProviderSettingsSnapshot(
  providers: Record<string, IProviderConfig>,
): Record<string, IProviderSetting> {
  return Object.fromEntries(
    Object.entries(providers).map(([providerName, provider]) => [
      providerName,
      {
        enabled: providerName === DEFAULT_LLM_PROVIDER_NAME,
        baseUrl: provider.settings.baseUrl,
        OPENAI_LIKE_API_MODELS: provider.settings.OPENAI_LIKE_API_MODELS,
      },
    ]),
  );
}

export function applyProviderSettingsSnapshot(
  providers: Record<string, IProviderConfig>,
  snapshot?: Record<string, IProviderSetting>,
): Record<string, IProviderConfig> {
  if (!snapshot) {
    return providers;
  }

  return Object.fromEntries(
    Object.entries(providers).map(([providerName, provider]) => {
      const syncedSettings = snapshot[providerName];

      if (!syncedSettings) {
        return [providerName, provider];
      }

      return [
        providerName,
        {
          ...provider,
          settings: {
            ...provider.settings,
            ...syncedSettings,
            enabled: syncedSettings.enabled ?? providerName === DEFAULT_LLM_PROVIDER_NAME,
          },
        },
      ];
    }),
  );
}
