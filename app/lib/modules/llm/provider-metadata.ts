import type { ModelInfo } from './types';
import type { ProviderInfo } from '~/types/model';
import { getOpenAIChatModels } from '~/lib/llm/openai-catalog';
import { OPENAI_PROVIDER_NAME } from '~/lib/llm/provider-defaults';

type ProviderMetadata = Pick<ProviderInfo, 'name' | 'getApiKeyLink' | 'labelForGetApiKey'> & {
  staticModels: ModelInfo[];
  baseUrlKey?: string;
  apiTokenKey?: string;
};

export const PROVIDER_METADATA: ProviderMetadata[] = [
  {
    name: OPENAI_PROVIDER_NAME,
    staticModels: getOpenAIChatModels(),
    getApiKeyLink: 'https://platform.openai.com/api-keys',
    apiTokenKey: 'OPENAI_API_KEY',
  },
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
