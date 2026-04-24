import { describe, expect, it, vi } from 'vitest';
import { resolveComposioApiKeyFromEnv, resolveComposioManagedAuthConfigId } from './composio';

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

describe('resolveComposioManagedAuthConfigId', () => {
  it('returns an enabled managed auth config id when one already exists', async () => {
    const composio = {
      authConfigs: {
        list: vi.fn().mockResolvedValue({
          items: [{ id: 'auth_123', status: 'ENABLED' }],
        }),
      },
      toolkits: {
        get: vi.fn(),
      },
    };

    await expect(resolveComposioManagedAuthConfigId(composio as never, 'github')).resolves.toBe('auth_123');
  });

  it('accepts camelCase authConfigDetails on toolkit responses', async () => {
    const composio = {
      authConfigs: {
        list: vi.fn().mockResolvedValue({
          items: [],
        }),
        create: vi.fn().mockResolvedValue({
          id: 'auth_new',
        }),
      },
      toolkits: {
        get: vi.fn().mockResolvedValue({
          name: 'GitHub',
          authConfigDetails: [{ name: 'OAuth', mode: 'oauth2' }],
        }),
      },
    };

    await expect(resolveComposioManagedAuthConfigId(composio as never, 'github')).resolves.toBe('auth_new');
  });

  it('still accepts legacy snake_case auth_config_details when present', async () => {
    const composio = {
      authConfigs: {
        list: vi.fn().mockResolvedValue({
          items: [],
        }),
        create: vi.fn().mockResolvedValue({
          id: 'auth_legacy',
        }),
      },
      toolkits: {
        get: vi.fn().mockResolvedValue({
          name: 'GitHub',
          auth_config_details: [{ name: 'OAuth', mode: 'oauth2' }],
        }),
      },
    };

    await expect(resolveComposioManagedAuthConfigId(composio as never, 'github')).resolves.toBe('auth_legacy');
  });
});
