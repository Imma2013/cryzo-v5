import { describe, expect, it } from 'vitest';
import {
  createComposioManagementClientFromApiKey,
  createComposioToolClientFromApiKey,
  extractComposioRedirectUrl,
  resolveComposioApiKeyFromEnv,
} from './composio';

describe('resolveComposioApiKeyFromEnv', () => {
  it('prefers explicit server env values and trims whitespace', () => {
    expect(
      resolveComposioApiKeyFromEnv(
        { COMPOSIO_API_KEY: '  composio-server-key  ' },
        { COMPOSIO_API_KEY: 'meta-key' },
        { COMPOSIO_API_KEY: 'process-key' },
      ),
    ).toBe('composio-server-key');
  });

  it('falls back to process or VITE-prefixed values when needed', () => {
    expect(resolveComposioApiKeyFromEnv({}, undefined, { COMPOSIO_API_KEY: 'process-key' })).toBe('process-key');
    expect(resolveComposioApiKeyFromEnv({}, undefined, { VITE_COMPOSIO_API_KEY: 'vite-key' } as any)).toBe('vite-key');
  });
});

describe('extractComposioRedirectUrl', () => {
  it('accepts direct redirect URLs from docs-style session authorize responses', () => {
    expect(
      extractComposioRedirectUrl({
        redirectUrl: 'https://platform.composio.dev/connect/github',
      }),
    ).toBe('https://platform.composio.dev/connect/github');
  });

  it('finds nested redirect URLs in wrapped response payloads', () => {
    expect(
      extractComposioRedirectUrl({
        data: {
          connectionRequest: {
            redirect_url: 'https://platform.composio.dev/connect/gmail',
          },
        },
      }),
    ).toBe('https://platform.composio.dev/connect/gmail');
  });

  it('supports additional redirect URL key variants used by auth responses', () => {
    expect(
      extractComposioRedirectUrl({
        response: {
          data: {
            redirectUri: 'https://platform.composio.dev/connect/slack',
          },
        },
      }),
    ).toBe('https://platform.composio.dev/connect/slack');
  });
});

describe('Composio client construction', () => {
  it('creates a plain management client that keeps the default provider for dashboard sessions', () => {
    const client = createComposioManagementClientFromApiKey('test-key') as any;

    expect(client.provider?.name).toBe('openai');
  });

  it('creates a tool client with the Vercel provider for session.tools()', () => {
    const client = createComposioToolClientFromApiKey('test-key') as any;

    expect(client.provider?.name).toBe('vercel');
  });
});
