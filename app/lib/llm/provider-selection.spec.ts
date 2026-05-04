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
  { name: 'gpt-5', label: 'GPT 5', provider: 'OpenAI', maxTokenAllowed: 400000 },
  { name: 'gpt-4.1', label: 'GPT 4.1', provider: 'OpenAI', maxTokenAllowed: 128000 },
  { name: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'Google', maxTokenAllowed: 1048576 },
];

describe('resolveActiveProviderSelection', () => {
  it('always selects Google when it is active', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers,
      currentProviderName: 'OpenRouter',
      savedProviderName: 'Google',
    });

    expect(result?.name).toBe('Google');
  });

  it('ignores synced non-Google providers', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers,
      currentProviderName: 'OpenRouter',
      preferredProviderName: 'OpenAI',
      savedProviderName: 'OpenAI',
    });

    expect(result?.name).toBe('Google');
  });

  it('falls back to the first active provider only when Google is unavailable', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: [providers[0]],
      currentProviderName: 'Anthropic',
      savedProviderName: 'Google',
    });

    expect(result?.name).toBe('OpenAI');
  });
});

describe('resolveProviderModelSelection', () => {
  it('always returns the first Google model', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'OpenAI',
      currentModel: 'gpt-4.1',
      savedModel: 'gpt-5',
    });

    expect(result).toBe('gemini-3.1-pro-preview');
  });

  it('ignores synced non-Google models', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'OpenAI',
      currentModel: 'gpt-4.1',
      preferredModel: 'gpt-5',
      savedModel: 'gpt-4.1',
    });

    expect(result).toBe('gemini-3.1-pro-preview');
  });
});
