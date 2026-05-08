import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { resolveActiveProviderSelection, resolveProviderModelSelection } from './provider-selection';

const providers: ProviderInfo[] = [
  { name: 'OpenAI', staticModels: [] },
  { name: 'Google', staticModels: [] },
  { name: 'OpenRouter', staticModels: [] },
];

const modelList: ModelInfo[] = [
  { name: 'gpt-5.4', label: 'GPT 5.4', provider: 'OpenAI', maxTokenAllowed: 400000 },
  { name: 'gpt-5', label: 'GPT 5', provider: 'OpenAI', maxTokenAllowed: 400000 },
  { name: 'gpt-4.1', label: 'GPT 4.1', provider: 'OpenAI', maxTokenAllowed: 128000 },
  { name: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'Google', maxTokenAllowed: 1048576 },
  { name: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'Google', maxTokenAllowed: 1048576 },
];

describe('resolveActiveProviderSelection', () => {
  it('selects the default OpenAI provider when it is active', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers,
      currentProviderName: 'Google',
    });

    expect(result?.name).toBe('OpenAI');
  });

  it('honors synced provider preferences when available', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers,
      currentProviderName: 'OpenAI',
      preferredProviderName: 'Google',
      savedProviderName: 'Google',
    });

    expect(result?.name).toBe('Google');
  });

  it('falls back to the first active provider only when no preferred/default provider is available', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: [providers[2]],
      currentProviderName: 'Anthropic',
    });

    expect(result?.name).toBe('OpenRouter');
  });
});

describe('resolveProviderModelSelection', () => {
  it('returns the default OpenAI model for the OpenAI provider', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'OpenAI',
    });

    expect(result).toBe('gpt-5.4');
  });

  it('honors synced model preferences for the selected provider', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'OpenAI',
      preferredModel: 'gpt-5',
    });

    expect(result).toBe('gpt-5');
  });
});
