import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getProviderSetupPayload, resolveGoogleServerApiKey } from './provider-setup';

const originalGoogleServerApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

beforeEach(() => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
});

afterEach(() => {
  if (originalGoogleServerApiKey) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleServerApiKey;
  } else {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
});

describe('getProviderSetupPayload', () => {
  it('returns a setup payload when the Google server key is missing', () => {
    const payload = getProviderSetupPayload('Google', {});

    expect(payload?.errorType).toBe('setup');
    expect(payload?.setupKey).toBe('GOOGLE_GENERATIVE_AI_API_KEY');
  });

  it('treats whitespace-only Google server keys as missing', () => {
    const payload = getProviderSetupPayload('Google', {
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
    });

    expect(payload?.errorType).toBe('setup');
  });

  it('does not return a setup payload when the Google server key is present', () => {
    const payload = getProviderSetupPayload('Google', {
      GOOGLE_GENERATIVE_AI_API_KEY: 'AIzaValidServerKey789',
    });

    expect(payload).toBeNull();
  });

  it('prefers the server env source when a Google key is present', () => {
    const resolution = resolveGoogleServerApiKey({
      GOOGLE_GENERATIVE_AI_API_KEY: 'AIzaValidServerKey789',
    });

    expect(resolution).toEqual({
      hasKey: true,
      key: 'AIzaValidServerKey789',
      source: 'server_env',
    });
  });
});
