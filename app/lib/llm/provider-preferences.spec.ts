import { describe, expect, it } from 'vitest';
import type { IProviderConfig } from '~/types/model';
import { applyProviderSettingsSnapshot, createProviderSettingsSnapshot } from './provider-preferences';

const providers: Record<string, IProviderConfig> = {
  Anthropic: {
    name: 'Anthropic',
    staticModels: [],
    settings: {
      enabled: false,
    },
  },
  Google: {
    name: 'Google',
    staticModels: [],
    settings: {
      enabled: true,
    },
  },
  OpenAILike: {
    name: 'OpenAILike',
    staticModels: [],
    settings: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:1234',
      OPENAI_LIKE_API_MODELS: 'local-model',
    },
  },
};

describe('createProviderSettingsSnapshot', () => {
  it('serializes the syncable provider settings', () => {
    expect(createProviderSettingsSnapshot(providers)).toEqual({
      Anthropic: { enabled: false, baseUrl: undefined, OPENAI_LIKE_API_MODELS: undefined },
      Google: { enabled: true, baseUrl: undefined, OPENAI_LIKE_API_MODELS: undefined },
      OpenAILike: {
        enabled: false,
        baseUrl: 'http://127.0.0.1:1234',
        OPENAI_LIKE_API_MODELS: 'local-model',
      },
    });
  });
});

describe('applyProviderSettingsSnapshot', () => {
  it('merges synced settings onto the existing provider configuration', () => {
    const result = applyProviderSettingsSnapshot(providers, {
      Anthropic: { enabled: true },
      OpenAILike: { enabled: true, baseUrl: 'http://localhost:3000' },
    });

    expect(result.Anthropic.settings.enabled).toBe(false);
    expect(result.Google.settings.enabled).toBe(true);
    expect(result.OpenAILike.settings).toEqual({
      enabled: false,
      baseUrl: 'http://localhost:3000',
      OPENAI_LIKE_API_MODELS: 'local-model',
    });
  });
});
