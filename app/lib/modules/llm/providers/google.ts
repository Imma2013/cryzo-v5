import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createScopedLogger } from '~/utils/logger';
import { resolveGoogleServerApiKey } from '~/lib/llm/provider-setup';
import { getGoogleChatModels } from '~/lib/llm/google-catalog';

const logger = createScopedLogger('google-provider');

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  staticModels: ModelInfo[] = getGoogleChatModels();

  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, providerSettings } = options;
    void providerSettings;
    const { key: apiKey } = resolveGoogleServerApiKey(this.convertEnvToRecord(serverEnv));

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
