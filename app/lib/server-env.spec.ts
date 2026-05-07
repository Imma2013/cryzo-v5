import { describe, expect, it } from 'vitest';
import { getServerEnv, getServerEnvDiagnostics, normalizeServerEnvValue } from './server-env';

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

  it('falls back to server-side import.meta env values', () => {
    const env = getServerEnv(undefined, {
      metaEnv: {
        VITE_SUPABASE_ANON_KEY: 'anon-key-from-meta\r\n',
        VITE_SUPABASE_URL: 'https://meta.supabase.co\r\n',
      },
      processEnv: {},
    });

    expect(env.VITE_SUPABASE_URL).toBe('https://meta.supabase.co');
    expect(env.VITE_SUPABASE_ANON_KEY).toBe('anon-key-from-meta');
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

  it('applies precedence cloudflare/context over process over meta env', () => {
    const env = getServerEnv(
      {
        cloudflare: {
          env: {
            VITE_SUPABASE_URL: 'https://cloudflare.supabase.co',
          },
        },
        env: {
          VITE_SUPABASE_URL: 'https://context.supabase.co',
        },
      },
      {
        metaEnv: {
          VITE_SUPABASE_URL: 'https://meta.supabase.co',
        },
        processEnv: {
          VITE_SUPABASE_URL: 'https://process.supabase.co',
        },
      },
    );

    expect(env.VITE_SUPABASE_URL).toBe('https://cloudflare.supabase.co');
  });

  it('tracks sanitized diagnostics for source presence and discovered keys', () => {
    const env = getServerEnv(
      {
        env: {
          COMPOSIO_API_KEY: 'composio-context-key',
          SUPABASE_URL: 'https://context.supabase.co',
        },
      },
      {
        metaEnv: {
          FEATURE_COMPOSIO_TOOLS: 'true',
          VITE_SUPABASE_ANON_KEY: 'meta-anon-key',
        },
        processEnv: {},
      },
    );

    expect(getServerEnvDiagnostics(env)).toEqual({
      keys: {
        COMPOSIO_API_KEY: true,
        FEATURE_COMPOSIO_TOOLS: true,
        SUPABASE_ANON_KEY: false,
        SUPABASE_URL: true,
        VITE_SUPABASE_ANON_KEY: true,
        VITE_SUPABASE_URL: false,
      },
      sourceKeys: {
        cloudflare: {
          COMPOSIO_API_KEY: false,
          FEATURE_COMPOSIO_TOOLS: false,
          SUPABASE_ANON_KEY: false,
          SUPABASE_URL: false,
          VITE_SUPABASE_ANON_KEY: false,
          VITE_SUPABASE_URL: false,
        },
        context: {
          COMPOSIO_API_KEY: true,
          FEATURE_COMPOSIO_TOOLS: false,
          SUPABASE_ANON_KEY: false,
          SUPABASE_URL: true,
          VITE_SUPABASE_ANON_KEY: false,
          VITE_SUPABASE_URL: false,
        },
        meta: {
          COMPOSIO_API_KEY: false,
          FEATURE_COMPOSIO_TOOLS: true,
          SUPABASE_ANON_KEY: false,
          SUPABASE_URL: false,
          VITE_SUPABASE_ANON_KEY: true,
          VITE_SUPABASE_URL: false,
        },
        process: {
          COMPOSIO_API_KEY: false,
          FEATURE_COMPOSIO_TOOLS: false,
          SUPABASE_ANON_KEY: false,
          SUPABASE_URL: false,
          VITE_SUPABASE_ANON_KEY: false,
          VITE_SUPABASE_URL: false,
        },
      },
      sources: {
        cloudflare: false,
        context: true,
        meta: true,
        process: false,
      },
    });
  });
});
