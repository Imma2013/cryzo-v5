import { describe, expect, it } from 'vitest';
import { getServerEnv, normalizeServerEnvValue } from './server-env';

describe('normalizeServerEnvValue', () => {
  it('trims trailing whitespace from environment values', () => {
    expect(normalizeServerEnvValue('AIzaTestKey123\r\n')).toBe('AIzaTestKey123');
  });

  it('converts whitespace-only values to undefined', () => {
    expect(normalizeServerEnvValue('   \r\n')).toBeUndefined();
  });
});

describe('getServerEnv', () => {
  it('normalizes cloudflare environment values', () => {
    const env = getServerEnv({
      cloudflare: {
        env: {
          GOOGLE_GENERATIVE_AI_API_KEY: 'AIzaServerKey456\r\n',
          EMPTY_VALUE: '   ',
        },
      },
    });

    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('AIzaServerKey456');
    expect(env.EMPTY_VALUE).toBeUndefined();
  });

  it('normalizes top-level runtime environment values', () => {
    const env = getServerEnv({
      env: {
        GOOGLE_GENERATIVE_AI_API_KEY: 'AIzaTopLevelKey123\r\n',
        EMPTY_VALUE: '   ',
      },
    });

    expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBe('AIzaTopLevelKey123');
    expect(env.EMPTY_VALUE).toBeUndefined();
  });
});
