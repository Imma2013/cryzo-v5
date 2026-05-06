import { describe, expect, it } from 'vitest';
import {
  buildGoogleImageProviderErrorPayload,
  buildGoogleImageQuotaErrorPayload,
  classifyGoogleImageProviderError,
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
      status: 429,
    });

    expect(payload).toMatchObject({
      error: true,
      errorType: 'quota',
      model: 'gemini-3.1-flash-image-preview',
      provider: 'Google',
      providerError: 'Quota exceeded for quota metric Generate content API requests.',
      providerStatus: undefined,
      retryAfterSeconds: 60,
    });
    expect(payload.message).toContain('rate limits');
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

  it('classifies billing and model availability separately from quota', () => {
    expect(classifyGoogleImageProviderError(429, { message: 'Resource exhausted' })).toBe('quota');
    expect(classifyGoogleImageProviderError(403, { message: 'Billing is not enabled for this project.' })).toBe('billing');
    expect(
      classifyGoogleImageProviderError(404, {
        message: 'models/gemini-3.1-flash-image-preview is not found or is not supported for generateContent',
      }),
    ).toBe('model_unavailable');
  });

  it('redacts API keys and includes safe provider metadata', () => {
    const payload = buildGoogleImageProviderErrorPayload({
      error: {
        code: 403,
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo' }],
        message: 'API key AIzaSyabcdefghijklmnopqrstuvwxyz is blocked. Billing is not enabled.',
        status: 'FAILED_PRECONDITION',
      },
      keyFingerprint: 'sha256:abc123',
      keySource: 'server_env',
      model: 'gemini-3.1-flash-image-preview',
      status: 403,
    });

    expect(payload).toMatchObject({
      errorType: 'billing',
      keyFingerprint: 'sha256:abc123',
      keySource: 'server_env',
      providerCode: 403,
      providerError: 'API key [REDACTED_GOOGLE_API_KEY] is blocked. Billing is not enabled.',
      providerErrorDetailTypes: ['type.googleapis.com/google.rpc.ErrorInfo'],
      providerStatus: 'FAILED_PRECONDITION',
    });
  });
});
