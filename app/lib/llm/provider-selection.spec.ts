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
  it('prefers the current provider when it is still active', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers,
      currentProviderName: 'OpenRouter',
      savedProviderName: 'Google',
    });

    expect(result?.name).toBe('OpenRouter');
  });

  it('prefers the synced provider when one is provided', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers,
      currentProviderName: 'OpenRouter',
      preferredProviderName: 'Google',
      savedProviderName: 'OpenAI',
    });

    expect(result?.name).toBe('Google');
  });

  it('falls back to the saved provider when the current provider is unavailable', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers.slice(0, 2),
      currentProviderName: 'Anthropic',
      savedProviderName: 'Google',
    });

    expect(result?.name).toBe('Google');
  });

  it('falls back to the first active provider when neither current nor saved providers are available', () => {
    const result = resolveActiveProviderSelection({
      activeProviders: providers.slice(0, 2),
      currentProviderName: 'Anthropic',
      savedProviderName: 'OpenRouter',
    });

    expect(result?.name).toBe('OpenAI');
  });
});

describe('resolveProviderModelSelection', () => {
  it('keeps the current model when it belongs to the selected provider', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'OpenAI',
      currentModel: 'gpt-4.1',
      savedModel: 'gpt-5',
    });

    expect(result).toBe('gpt-4.1');
  });

  it('prefers the synced model when one is provided', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'OpenAI',
      currentModel: 'gpt-4.1',
      preferredModel: 'gpt-5',
      savedModel: 'gpt-4.1',
    });

    expect(result).toBe('gpt-5');
  });

  it('falls back to the saved model when the current model belongs to another provider', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'OpenAI',
      currentModel: 'gemini-3.1-pro-preview',
      savedModel: 'gpt-5',
    });

    expect(result).toBe('gpt-5');
  });

  it('falls back to the first available provider model when needed', () => {
    const result = resolveProviderModelSelection({
      modelList,
      providerName: 'Google',
      currentModel: 'gpt-5',
      savedModel: 'gpt-4.1',
    });

    expect(result).toBe('gemini-3.1-pro-preview');
  });
});
