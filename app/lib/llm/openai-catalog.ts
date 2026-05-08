import type { ModelInfo } from '~/lib/modules/llm/types';
import { DEFAULT_OPENAI_MODEL, OPENAI_PROVIDER_NAME } from './provider-defaults';

export function getOpenAIChatModels(): ModelInfo[] {
  return [
    {
      name: DEFAULT_OPENAI_MODEL,
      label: 'GPT 5.4',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'gpt-5.2',
      label: 'GPT 5.2',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'gpt-5.1',
      label: 'GPT 5.1',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'gpt-5.1-codex',
      label: 'GPT 5.1 Codex',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'gpt-5.1-codex-mini',
      label: 'GPT 5.1 Codex Mini',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'gpt-5',
      label: 'GPT 5',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'gpt-5-codex',
      label: 'GPT 5 Codex',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
    {
      name: 'gpt-5-mini',
      label: 'GPT 5 Mini',
      provider: OPENAI_PROVIDER_NAME,
      maxTokenAllowed: 400000,
      maxCompletionTokens: 128000,
    },
  ];
}
