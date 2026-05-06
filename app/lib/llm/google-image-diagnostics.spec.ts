import { describe, expect, it } from 'vitest';
import { getGoogleApiKeyFingerprint, sanitizeGoogleProviderError } from './google-image-diagnostics';

describe('google image diagnostics', () => {
  it('redacts Google API keys from provider messages', () => {
    expect(
      sanitizeGoogleProviderError({
        message: 'API key AIzaSyabcdefghijklmnopqrstuvwxyz is blocked',
        status: 'PERMISSION_DENIED',
      }),
    ).toMatchObject({
      message: 'API key [REDACTED_GOOGLE_API_KEY] is blocked',
      status: 'PERMISSION_DENIED',
    });
  });

  it('returns a stable non-secret key fingerprint', async () => {
    const fingerprint = await getGoogleApiKeyFingerprint('AIzaSyabcdefghijklmnopqrstuvwxyz');

    expect(fingerprint).toMatch(/^(sha256:[a-f0-9]{12}|fnv1a:[a-f0-9]{8})$/);
    expect(fingerprint).not.toContain('AIza');
  });
});
