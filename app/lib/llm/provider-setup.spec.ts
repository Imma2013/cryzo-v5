import { describe, expect, it } from 'vitest';
import { getProviderSetupPayload } from './provider-setup';

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
});
