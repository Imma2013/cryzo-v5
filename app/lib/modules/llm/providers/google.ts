import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('google-provider');

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most reliable/stable ones
     * Synced to dyad's current Google catalog.
     */
    {
      name: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro (Preview)',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65535,
    },

    // Gemini 3 Flash: coding-focused preview model
    {
      name: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash (Preview)',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65535,
    },

    // Gemini 2.5 Pro
    {
      name: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65535,
    },

    // Gemini 2.5 Flash
    {
      name: 'gemini-flash-latest',
      label: 'Gemini 2.5 Flash',
      provider: 'Google',
      maxTokenAllowed: 1048576,
      maxCompletionTokens: 65535,
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
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: {
        ['Content-Type']: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models from Google API: ${response.status} ${response.statusText}`);
    }

    const res = (await response.json()) as any;

    if (!res.models || !Array.isArray(res.models)) {
      throw new Error('Invalid response format from Google API');
    }

    // Filter out models with very low token limits and experimental/unstable models
    const data = res.models.filter((model: any) => {
      const hasGoodTokenLimit = (model.outputTokenLimit || 0) > 8000;
      const isStable = !model.name.includes('exp') || model.name.includes('flash-exp');

      return hasGoodTokenLimit && isStable;
    });

    return data.map((m: any) => {
      const modelName = m.name.replace('models/', '');

      // Get accurate context window from Google API
      let contextWindow = 32000; // default fallback

      if (m.inputTokenLimit && m.outputTokenLimit) {
        // Use the input limit as the primary context window (typically larger)
        contextWindow = m.inputTokenLimit;
      } else if (modelName.includes('gemini-3.1-pro-preview')) {
        contextWindow = 1048576; // Gemini 3.1 Pro preview uses 1M-class context in dyad's catalog
      } else if (modelName.includes('gemini-3-flash-preview')) {
        contextWindow = 1048576; // Gemini 3 Flash preview uses 1M-class context in dyad's catalog
      } else if (modelName.includes('gemini-2.5-pro')) {
        contextWindow = 1048576; // Gemini 2.5 Pro uses 1M-class context in dyad's catalog
      } else if (modelName.includes('gemini-flash-latest')) {
        contextWindow = 1048576; // Gemini 2.5 Flash uses 1M-class context in dyad's catalog
      } else if (modelName.includes('gemini-pro')) {
        contextWindow = 32000; // Gemini Pro has 32k context
      } else if (modelName.includes('gemini-flash')) {
        contextWindow = 32000; // Gemini Flash has 32k context
      }

      // Cap at reasonable limits to prevent issues
      const maxAllowed = 2000000; // 2M tokens max
      const finalContext = Math.min(contextWindow, maxAllowed);

      // Get completion token limit from Google API
      let completionTokens = 65535; // default fallback synced to dyad's Gemini 2.5/3.x catalog

      if (m.outputTokenLimit && m.outputTokenLimit > 0) {
        completionTokens = Math.min(m.outputTokenLimit, 128000); // Use API value, cap at reasonable limit
      }

      return {
        name: modelName,
        label: `${m.displayName} (${finalContext >= 1000000 ? Math.floor(finalContext / 1000000) + 'M' : Math.floor(finalContext / 1000) + 'k'} context)`,
        provider: this.name,
        maxTokenAllowed: finalContext,
        maxCompletionTokens: completionTokens,
      };
    });
  }

  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const google = createGoogleGenerativeAI({
      apiKey,
      fetch: async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const body = typeof init?.body === 'string' ? init.body : undefined;

        if (body && url.includes('generativelanguage.googleapis.com') && url.includes(':generateContent')) {
          const { summarizeGoogleRequestBodyForDiagnostics, validateGoogleRequestThoughtSignatures } = await import(
            '~/lib/.server/llm/google-tool-runtime'
          );
          const requestSummary = summarizeGoogleRequestBodyForDiagnostics(body);

          if (requestSummary.contents.length > 0) {
            logger.info('Google request function-call diagnostics', JSON.stringify(requestSummary));
            validateGoogleRequestThoughtSignatures(body);
          }
        }

        return fetch(input as any, init);
      },
    });

    return google(model);
  }
}
