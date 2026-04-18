import { describe, expect, it } from 'vitest';
import { createLlmErrorAlert } from './error-alerts';

describe('createLlmErrorAlert', () => {
  it('maps provider setup payloads to setup alerts', () => {
    const error = new Error(
      JSON.stringify({
        error: true,
        errorType: 'setup',
        isRetryable: false,
        message: 'Google is selected, but GOOGLE_GENERATIVE_AI_API_KEY is missing on the server.',
        provider: 'Google',
        setupKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
        setupSource: 'server_env',
        statusCode: 503,
      }),
    );

    const alert = createLlmErrorAlert(error, 'Google');

    expect(alert.errorType).toBe('setup');
    expect(alert.title).toBe('Server Setup Required');
    expect(alert.description).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
  });

  it('keeps non-setup API key failures as authentication alerts', () => {
    const alert = createLlmErrorAlert(new Error('Invalid or missing API key'), 'OpenAI');

    expect(alert.errorType).toBe('authentication');
    expect(alert.title).toBe('Authentication Error');
  });
});
