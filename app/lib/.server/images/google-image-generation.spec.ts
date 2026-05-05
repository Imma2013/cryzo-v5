import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateGoogleImage } from './google-image-generation';

function googleResponse(body: unknown, init: { headers?: Record<string, string>; status?: number } = {}) {
  return {
    headers: new Headers(init.headers),
    ok: !init.status || (init.status >= 200 && init.status < 300),
    status: init.status || 200,
    json: async () => body,
  } as Response;
}

function imagePayload(data = 'base64-image') {
  return {
    candidates: [
      {
        content: {
          parts: [
            { text: 'generated text' },
            {
              inlineData: {
                data,
                mimeType: 'image/png',
              },
            },
          ],
        },
      },
    ],
  };
}

function calledModels(fetchSpy: { mock: { calls: readonly (readonly unknown[])[] } }) {
  return fetchSpy.mock.calls.map((call) => String(call[0]).match(/models\/(.+?):generateContent/)?.[1]);
}

describe('generateGoogleImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses Gemini 3.1 Flash image by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(googleResponse(imagePayload()));

    const result = await generateGoogleImage({
      apiKey: 'AIza-test',
      prompt: 'Generate a product hero',
    });

    expect(calledModels(fetchSpy)).toEqual(['gemini-3.1-flash-image-preview']);
    expect(result.model).toBe('gemini-3.1-flash-image-preview');
    expect(result.images[0]).toMatchObject({
      data: 'base64-image',
      mimeType: 'image/png',
    });
  });

  it('retries Gemini 3 Pro image preview when Gemini 3.1 Flash image is unavailable', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        googleResponse(
          {
            error: {
              message:
                'models/gemini-3.1-flash-image-preview is not found for API version v1beta, or is not supported for generateContent.',
              status: 'NOT_FOUND',
            },
          },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(googleResponse(imagePayload('fallback-image')));

    const result = await generateGoogleImage({
      apiKey: 'AIza-test',
      prompt: 'Generate a product hero',
    });

    expect(calledModels(fetchSpy)).toEqual(['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']);
    expect(result.model).toBe('gemini-3-pro-image-preview');
    expect(result.images[0]?.data).toBe('fallback-image');
  });

  it('does not use Gemini 2.5 Flash image as an automatic fallback', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        googleResponse(
          {
            error: {
              message: 'Quota exceeded for quota metric Generate content API requests.',
              status: 'RESOURCE_EXHAUSTED',
            },
          },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(googleResponse(imagePayload('fallback-image')));

    await generateGoogleImage({
      apiKey: 'AIza-test',
      prompt: 'Generate a product hero',
    });

    expect(calledModels(fetchSpy)).toEqual(['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']);
  });

  it('preserves the structured Google quota error when both default and fallback fail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        googleResponse(
          {
            error: {
              message: 'Quota exceeded for Gemini 3.1 Flash image.',
              status: 'RESOURCE_EXHAUSTED',
            },
          },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(
        googleResponse(
          {
            error: {
              message: 'Billing is not enabled for Gemini 3 Pro image.',
              status: 'FAILED_PRECONDITION',
            },
          },
          { headers: { 'Retry-After': '30' }, status: 403 },
        ),
      );

    await expect(
      generateGoogleImage({
        apiKey: 'AIza-test',
        prompt: 'Generate a product hero',
      }),
    ).rejects.toMatchObject({
      payload: {
        error: true,
        errorType: 'quota',
        model: 'gemini-3-pro-image-preview',
        provider: 'Google',
        providerError: 'Billing is not enabled for Gemini 3 Pro image.',
        retryAfterSeconds: 30,
      },
      status: 403,
    });
  });
});
