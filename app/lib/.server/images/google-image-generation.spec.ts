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

  it('does not fall back when Gemini 3.1 Flash image is unavailable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
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
        model: 'gemini-3.1-flash-image-preview',
        provider: 'Google',
        providerError:
          'models/gemini-3.1-flash-image-preview is not found for API version v1beta, or is not supported for generateContent.',
      },
      status: 404,
    });

    expect(calledModels(fetchSpy)).toEqual(['gemini-3.1-flash-image-preview']);
  });

  it('does not fall back on quota failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      googleResponse(
        {
          error: {
            message: 'Quota exceeded for quota metric Generate content API requests.',
            status: 'RESOURCE_EXHAUSTED',
          },
        },
        { status: 429 },
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
        model: 'gemini-3.1-flash-image-preview',
        provider: 'Google',
        providerError: 'Quota exceeded for quota metric Generate content API requests.',
      },
      status: 429,
    });

    expect(calledModels(fetchSpy)).toEqual(['gemini-3.1-flash-image-preview']);
  });

  it('preserves the structured Google quota error for billing failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      googleResponse(
        {
          error: {
            message: 'Billing is not enabled for Gemini 3.1 Flash image.',
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
        model: 'gemini-3.1-flash-image-preview',
        provider: 'Google',
        providerError: 'Billing is not enabled for Gemini 3.1 Flash image.',
        retryAfterSeconds: 30,
      },
      status: 403,
    });

    expect(calledModels(fetchSpy)).toEqual(['gemini-3.1-flash-image-preview']);
  });
});
