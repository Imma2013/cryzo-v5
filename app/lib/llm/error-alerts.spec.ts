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

  it('maps Google image provider error types to specific alerts', () => {
    const billingAlert = createLlmErrorAlert(
      new Error(
        JSON.stringify({
          errorType: 'billing',
          message: 'Google image generation billing is blocking gemini-3.1-flash-image-preview.',
          provider: 'Google',
          statusCode: 403,
        }),
      ),
      'Google',
    );
    const modelAlert = createLlmErrorAlert(
      new Error(
        JSON.stringify({
          errorType: 'model_unavailable',
          message: 'Google image model availability is blocking gemini-3.1-flash-image-preview.',
          provider: 'Google',
          statusCode: 404,
        }),
      ),
      'Google',
    );

    expect(billingAlert).toMatchObject({ errorType: 'billing', title: 'Billing Required' });
    expect(modelAlert).toMatchObject({ errorType: 'model_unavailable', title: 'Model Unavailable' });
  });
});
