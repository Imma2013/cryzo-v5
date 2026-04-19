import type { ModelInfo } from './types';
import type { ProviderInfo } from '~/types/model';
import { getGoogleChatModels } from '~/lib/llm/google-catalog';

type ProviderMetadata = Pick<ProviderInfo, 'name' | 'getApiKeyLink' | 'labelForGetApiKey'> & {
  staticModels: ModelInfo[];
  baseUrlKey?: string;
  apiTokenKey?: string;
};

export const PROVIDER_METADATA: ProviderMetadata[] = [
  { name: 'Anthropic', staticModels: [], getApiKeyLink: 'https://console.anthropic.com/settings/keys', apiTokenKey: 'ANTHROPIC_API_KEY' },
  { name: 'Cerebras', staticModels: [], getApiKeyLink: 'https://cloud.cerebras.ai/settings', apiTokenKey: 'CEREBRAS_API_KEY' },
  { name: 'Cohere', staticModels: [], getApiKeyLink: 'https://dashboard.cohere.com/api-keys', apiTokenKey: 'COHERE_API_KEY' },
  { name: 'Deepseek', staticModels: [], getApiKeyLink: 'https://platform.deepseek.com/apiKeys', apiTokenKey: 'DEEPSEEK_API_KEY' },
  { name: 'Fireworks', staticModels: [], getApiKeyLink: 'https://fireworks.ai/api-keys', apiTokenKey: 'FIREWORKS_API_KEY' },
  { name: 'Google', staticModels: getGoogleChatModels(), getApiKeyLink: 'https://aistudio.google.com/app/apikey', apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  { name: 'Groq', staticModels: [], getApiKeyLink: 'https://console.groq.com/keys', apiTokenKey: 'GROQ_API_KEY' },
  { name: 'HuggingFace', staticModels: [], getApiKeyLink: 'https://huggingface.co/settings/tokens', apiTokenKey: 'HuggingFace_API_KEY' },
  { name: 'Hyperbolic', staticModels: [], getApiKeyLink: 'https://app.hyperbolic.xyz/settings', apiTokenKey: 'HYPERBOLIC_API_KEY' },
  { name: 'Mistral', staticModels: [], getApiKeyLink: 'https://console.mistral.ai/api-keys/', apiTokenKey: 'MISTRAL_API_KEY' },
  { name: 'Moonshot', staticModels: [], getApiKeyLink: 'https://platform.moonshot.ai/console/api-keys', apiTokenKey: 'MOONSHOT_API_KEY' },
  { name: 'Ollama', staticModels: [], getApiKeyLink: 'https://ollama.com/download', labelForGetApiKey: 'Download Ollama', baseUrlKey: 'OLLAMA_API_BASE_URL' },
  { name: 'OpenAI', staticModels: [], getApiKeyLink: 'https://platform.openai.com/api-keys', apiTokenKey: 'OPENAI_API_KEY' },
  { name: 'OpenAILike', staticModels: [], baseUrlKey: 'OPENAI_LIKE_API_BASE_URL', apiTokenKey: 'OPENAI_LIKE_API_KEY' },
  { name: 'OpenRouter', staticModels: [], getApiKeyLink: 'https://openrouter.ai/settings/keys', apiTokenKey: 'OPEN_ROUTER_API_KEY' },
  { name: 'Perplexity', staticModels: [], getApiKeyLink: 'https://www.perplexity.ai/settings/api', apiTokenKey: 'PERPLEXITY_API_KEY' },
  { name: 'Together', staticModels: [], getApiKeyLink: 'https://api.together.xyz/settings/api-keys', baseUrlKey: 'TOGETHER_API_BASE_URL', apiTokenKey: 'TOGETHER_API_KEY' },
  { name: 'XAI', staticModels: [], getApiKeyLink: 'https://docs.x.ai/docs/quickstart#creating-an-api-key', apiTokenKey: 'XAI_API_KEY' },
  { name: 'LMStudio', staticModels: [], getApiKeyLink: 'https://lmstudio.ai/', labelForGetApiKey: 'Get LMStudio', baseUrlKey: 'LMSTUDIO_API_BASE_URL' },
  { name: 'AmazonBedrock', staticModels: [], getApiKeyLink: 'https://console.aws.amazon.com/iam/home', apiTokenKey: 'AWS_BEDROCK_CONFIG' },
  { name: 'Github', staticModels: [], getApiKeyLink: 'https://github.com/settings/personal-access-tokens', apiTokenKey: 'GITHUB_API_KEY' },
  { name: 'Zai', staticModels: [], getApiKeyLink: 'https://open.bigmodel.cn/usercenter/apikeys', baseUrlKey: 'ZAI_BASE_URL', apiTokenKey: 'ZAI_API_KEY' },
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
