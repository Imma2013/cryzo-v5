import type { ModelInfo } from './types';
import type { ProviderInfo } from '~/types/model';
import { getGoogleChatModels } from '~/lib/llm/google-catalog';

type ProviderMetadata = Pick<ProviderInfo, 'name' | 'getApiKeyLink' | 'labelForGetApiKey'> & {
  staticModels: ModelInfo[];
  baseUrlKey?: string;
  apiTokenKey?: string;
};

export const PROVIDER_METADATA: ProviderMetadata[] = [
  { name: 'Google', staticModels: getGoogleChatModels(), getApiKeyLink: 'https://aistudio.google.com/app/apikey', apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  { name: 'OpenAI', staticModels: [], getApiKeyLink: 'https://platform.openai.com/api-keys', apiTokenKey: 'OPENAI_API_KEY' },
];

export const PROVIDER_BASE_URL_ENV_KEYS = Object.fromEntries(
  PROVIDER_METADATA.map((provider) => [
    provider.name,
    {
      baseUrlKey: provider.baseUrlKey,
      apiTokenKey: provider.apiTokenKey,
    },
  ]),
);
