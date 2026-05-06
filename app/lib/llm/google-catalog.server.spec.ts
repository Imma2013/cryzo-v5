import { describe, expect, it, vi } from 'vitest';
import { resolveGoogleCatalog } from './google-catalog.server';

describe('resolveGoogleCatalog', () => {
  it('keeps only the curated Google models from the live catalog', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            name: 'models/gemini-3-flash-preview',
            inputTokenLimit: 1048576,
            outputTokenLimit: 65535,
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-3.1-pro-preview',
            inputTokenLimit: 1048576,
            outputTokenLimit: 65535,
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-2.5-pro',
            inputTokenLimit: 1048576,
            outputTokenLimit: 65535,
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-2.5-flash',
            inputTokenLimit: 1048576,
            outputTokenLimit: 65535,
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-3.1-flash-image-preview',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-2.5-flash-image',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-3-pro-image-preview',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-1.5-pro',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    } as Response);

    const catalog = await resolveGoogleCatalog('AIza-test');

    expect(catalog.catalogSource).toBe('live');
    expect(catalog.chatModels.map((model) => model.name)).toEqual([
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ]);
    expect(catalog.imageModels.map((model) => model.id)).toEqual(['gemini-3.1-flash-image-preview']);

    fetchSpy.mockRestore();
  });

  it('falls back to the curated catalog when the live request fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    const catalog = await resolveGoogleCatalog('AIza-test');

    expect(catalog.catalogSource).toBe('fallback');
    expect(catalog.chatModels.map((model) => model.name)).toEqual([
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ]);

    fetchSpy.mockRestore();
  });
});
