import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { LanguageModelV1 } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { createAnthropic } from '@ai-sdk/anthropic';

export default class AnthropicProvider extends BaseProvider {
  name = 'Anthropic';
  getApiKeyLink = 'https://console.anthropic.com/settings/keys';

  config = {
    apiTokenKey: 'ANTHROPIC_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most stable/reliable ones
     * Synced to dyad's current Anthropic catalog.
     */
    {
      name: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 32000,
    },

    // Claude Sonnet 4.6: current fast, general-purpose Anthropic default
    {
      name: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 32000,
    },

    // Claude Opus 4.5
    {
      name: 'claude-opus-4-5',
      label: 'Claude Opus 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 200000,
      maxCompletionTokens: 32000,
    },

    // Claude Sonnet 4.5
    {
      name: 'claude-sonnet-4-5-20250929',
      label: 'Claude Sonnet 4.5',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 32000,
    },

    // Claude Sonnet 4
    {
      name: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      provider: 'Anthropic',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 32000,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://api.anthropic.com/v1/models`, {
      headers: {
        'x-api-key': `${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
    });

    const res = (await response.json()) as any;
    const staticModelIds = this.staticModels.map((m) => m.name);

    const data = res.data.filter((model: any) => model.type === 'model' && !staticModelIds.includes(model.id));

    return data.map((m: any) => {
      // Get accurate context window from Anthropic API
      let contextWindow = 32000; // default fallback

      // Anthropic provides max_tokens in their API response
      if (m.max_tokens) {
        contextWindow = m.max_tokens;
      } else if (m.id?.includes('claude-opus-4-6') || m.id?.includes('claude-sonnet-4-6')) {
        contextWindow = 1000000; // Claude 4.6 family supports 1M context in dyad's catalog
      } else if (m.id?.includes('claude-opus-4-5')) {
        contextWindow = 200000; // Claude Opus 4.5 remains 200k in dyad's catalog
      } else if (m.id?.includes('claude-sonnet-4-5') || m.id?.includes('claude-sonnet-4-20250514')) {
        contextWindow = 1000000; // Claude Sonnet 4.x uses 1M context in dyad's catalog
      }

      // Determine completion token limits based on specific model
      let maxCompletionTokens = 32000; // conservative default for Claude 4 fallbacks

      if (m.id?.includes('claude-opus-4')) {
        maxCompletionTokens = 32000; // Claude 4 Opus: 32K output limit
      } else if (m.id?.includes('claude-sonnet-4')) {
        maxCompletionTokens = 32000; // Keep synced with dyad's catalog defaults
      } else if (m.id?.includes('claude-4')) {
        maxCompletionTokens = 32000; // Other Claude 4 models: conservative 32K limit
      }

      return {
        name: m.id,
        label: `${m.display_name} (${Math.floor(contextWindow / 1000)}k context)`,
        provider: this.name,
        maxTokenAllowed: contextWindow,
        maxCompletionTokens,
      };
    });
  }

  getModelInstance: (options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1 = (options) => {
    const { apiKeys, providerSettings, serverEnv, model } = options;
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'ANTHROPIC_API_KEY',
    });
    const anthropic = createAnthropic({
      apiKey,
      headers: { 'anthropic-beta': 'output-128k-2025-02-19' },
    });

    return anthropic(model);
  };
}
