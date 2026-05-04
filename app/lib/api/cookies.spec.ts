import { describe, expect, it } from 'vitest';
import { getApiKeysFromCookie } from './cookies';

describe('getApiKeysFromCookie', () => {
  it('strips all browser-provided Google API key aliases', () => {
    const cookie = `apiKeys=${encodeURIComponent(
      JSON.stringify({
        Google: 'cookie-google',
        GOOGLE_GENERATIVE_AI_API_KEY: 'cookie-env',
        google: 'cookie-lower',
        OpenAI: 'cookie-openai',
      }),
    )}`;

    expect(getApiKeysFromCookie(cookie)).toEqual({
      OpenAI: 'cookie-openai',
    });
  });
});
