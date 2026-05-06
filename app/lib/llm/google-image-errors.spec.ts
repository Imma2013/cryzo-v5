import { describe, expect, it } from 'vitest';
import {
  buildGoogleImageQuotaErrorPayload,
  isGoogleImageRetryableProviderError,
  isGoogleQuotaError,
  parseGoogleRetryAfterSeconds,
} from './google-image-errors';

describe('google image errors', () => {
  it('parses retry timing from Google retry headers, details, and messages', () => {
    expect(parseGoogleRetryAfterSeconds({ retryAfterHeader: '45' })).toBe(45);
    expect(parseGoogleRetryAfterSeconds({ details: [{ retryDelay: '30s' }] })).toBe(30);
    expect(parseGoogleRetryAfterSeconds({ message: 'Resource exhausted. Please retry in 12 seconds.' })).toBe(12);
  });

  it('builds a structured quota payload for Google image 429s', () => {
    const payload = buildGoogleImageQuotaErrorPayload({
      error: {
        message: 'Quota exceeded for quota metric Generate content API requests.',
      },
      model: 'gemini-3.1-flash-image-preview',
      retryAfterHeader: '60',
    });

    expect(payload).toMatchObject({
      error: true,
      errorType: 'quota',
      model: 'gemini-3.1-flash-image-preview',
      provider: 'Google',
      providerError: 'Quota exceeded for quota metric Generate content API requests.',
      retryAfterSeconds: 60,
    });
    expect(payload.message).toContain('Google AI Studio quota/billing');
  });

  it('treats Google 429 as quota even when the provider message is vague', () => {
    expect(isGoogleQuotaError(429, { message: 'Resource exhausted' })).toBe(true);
  });

  it('treats model availability and billing failures as retryable image provider errors', () => {
    expect(
      isGoogleImageRetryableProviderError(404, {
        message: 'models/gemini-3.1-flash-image-preview is not found or is not supported for generateContent',
      }),
    ).toBe(true);
    expect(isGoogleImageRetryableProviderError(403, { message: 'Billing is not enabled for this project.' })).toBe(true);
    expect(isGoogleImageRetryableProviderError(503, { message: 'The model is temporarily unavailable.' })).toBe(true);
  });
});
