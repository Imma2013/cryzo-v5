import { afterEach, describe, expect, it, vi } from 'vitest';
import { APPROVED_APP_CONNECTOR_NAMES, isApprovedAppToolkit, normalizeAppConnectorKey } from '~/components/apps/apps.constants';
import type { AppToolkit } from '~/components/apps/AppsDashboard';

const composioState = vi.hoisted(() => ({
  createComposioClient: vi.fn(),
  createComposioManagementSession: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('~/lib/.server/composio', () => ({
  createComposioClient: composioState.createComposioClient,
  createComposioManagementSession: composioState.createComposioManagementSession,
  extractComposioRedirectUrl: vi.fn(),
  resolveComposioApiKey: vi.fn().mockReturnValue('test-key'),
}));

vi.mock('~/lib/auth/require-auth.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/auth/require-auth.server')>('~/lib/auth/require-auth.server');

  return {
    ...actual,
    requireAuth: composioState.requireAuth,
  };
});

import { buildApprovedToolkitCatalog, buildToolkitLogoProxyUrl, getToolkitLogo, loader } from '~/routes/api.connections';

type ConnectionsPayload = {
  toolkits: AppToolkit[];
};

afterEach(() => {
  composioState.createComposioClient.mockReset();
  composioState.createComposioManagementSession.mockReset();
  composioState.requireAuth.mockReset();
});

describe('/api/connections loader', () => {
  it('maps auth-required approved toolkits from array responses into the curated catalog', async () => {
    composioState.requireAuth.mockResolvedValue({
      responseHeaders: new Headers(),
      user: { id: 'user_123' },
    });
    composioState.createComposioManagementSession.mockResolvedValue({
      toolkits: vi.fn().mockResolvedValue({
        items: [
          {
            slug: 'github',
            name: 'GitHub',
            logo: 'https://logos.composio.dev/api/github',
            connection: {
              connectedAccount: {
                id: 'ca_123',
              },
              isActive: true,
            },
          },
          {
            slug: 'slack',
            name: 'Slack',
            isNoAuth: true,
            logo: 'https://logos.composio.dev/api/slack',
          },
          {
            slug: 'asana',
            name: 'Asana',
            logo: 'https://logos.composio.dev/api/asana',
          },
        ],
      }),
    });

    const request = new Request('https://bolt.local/api/connections', {
    });

    const response = await loader({
      request,
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as ConnectionsPayload;

    expect(payload.toolkits).toHaveLength(APPROVED_APP_CONNECTOR_NAMES.length);
    expect(payload.toolkits.find((toolkit: any) => toolkit.name === 'GitHub')).toEqual({
      slug: 'github',
      name: 'GitHub',
      logo: 'https://bolt.local/api/connections/logo?slug=github',
      isAvailable: true,
      isConnected: true,
      connectedAccountId: 'ca_123',
    });
    expect(payload.toolkits.find((toolkit: any) => toolkit.name === 'Excel')).toEqual({
      slug: 'excel',
      name: 'Excel',
      logo: undefined,
      isAvailable: false,
      isConnected: false,
      connectedAccountId: undefined,
    });
  });

  it('returns an empty toolkit list when Composio omits toolkit items', async () => {
    composioState.requireAuth.mockResolvedValue({
      responseHeaders: new Headers(),
      user: { id: 'user_123' },
    });
    composioState.createComposioManagementSession.mockResolvedValue({
      toolkits: vi.fn().mockResolvedValue({}),
    });

    const response = await loader({
      request: new Request('https://bolt.local/api/connections'),
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as ConnectionsPayload;
    expect(payload.toolkits).toHaveLength(APPROVED_APP_CONNECTOR_NAMES.length);
    expect(payload.toolkits.every((toolkit: any) => toolkit.isAvailable === false)).toBe(true);
  });

  it('treats missing connected account items as disconnected toolkits', async () => {
    composioState.requireAuth.mockResolvedValue({
      responseHeaders: new Headers(),
      user: { id: 'user_123' },
    });
    composioState.createComposioManagementSession.mockResolvedValue({
      toolkits: vi.fn().mockResolvedValue({
        items: [
          {
            slug: 'github',
            name: 'GitHub',
          },
        ],
      }),
    });

    const response = await loader({
      request: new Request('https://bolt.local/api/connections'),
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as ConnectionsPayload;
    expect(payload.toolkits.find((toolkit: any) => toolkit.name === 'GitHub')).toEqual({
      slug: 'github',
      name: 'GitHub',
      logo: undefined,
      isAvailable: true,
      isConnected: false,
      connectedAccountId: undefined,
    });
  });

  it('returns a 500 json error when Composio throws', async () => {
    composioState.requireAuth.mockResolvedValue({
      responseHeaders: new Headers(),
      user: { id: 'user_123' },
    });
    composioState.createComposioManagementSession.mockRejectedValue(new Error('Composio exploded'));

    const response = await loader({
      request: new Request('https://bolt.local/api/connections'),
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load app connections: Composio exploded',
    });
  });

  it('supports alternate toolkit connection shapes from Composio responses', async () => {
    composioState.requireAuth.mockResolvedValue({
      responseHeaders: new Headers(),
      user: { id: 'user_123' },
    });
    composioState.createComposioManagementSession.mockResolvedValue({
      toolkits: vi.fn().mockResolvedValue({
        data: {
          items: [
            {
              slug: 'github',
              name: 'GitHub',
              logoUrl: 'https://logos.composio.dev/api/github',
              connectedAccounts: [{ id: 'ca_456' }],
            },
          ],
        },
      }),
    });

    const response = await loader({
      request: new Request('https://bolt.local/api/connections'),
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as ConnectionsPayload;
    expect(payload.toolkits.find((toolkit: any) => toolkit.name === 'GitHub')).toEqual({
      slug: 'github',
      name: 'GitHub',
      logo: 'https://bolt.local/api/connections/logo?slug=github',
      isAvailable: true,
      isConnected: true,
      connectedAccountId: 'ca_456',
    });
  });
});

describe('connections helpers', () => {
  it('builds the curated catalog with live matches and unavailable placeholders', () => {
    const result = buildApprovedToolkitCatalog(
      new Request('https://bolt.local/api/connections'),
      [
        { slug: 'github', name: 'GitHub', meta: { logo: 'https://logos.composio.dev/api/github' } },
        { slug: 'tiktok', name: 'Tiktok', meta: { logo: 'https://logos.composio.dev/api/tiktok' } },
      ],
      new Map([['github', 'ca_123']]),
    );

    expect(result).toHaveLength(APPROVED_APP_CONNECTOR_NAMES.length);
    expect(result.find((toolkit) => toolkit.name === 'GitHub')).toEqual({
      slug: 'github',
      name: 'GitHub',
      logo: 'https://bolt.local/api/connections/logo?slug=github',
      isAvailable: true,
      isConnected: true,
      connectedAccountId: 'ca_123',
    });
    expect(result.find((toolkit) => toolkit.name === 'TikTok')).toMatchObject({
      slug: 'tiktok',
      name: 'TikTok',
      isAvailable: true,
    });
    expect(result.find((toolkit) => toolkit.name === 'Zoho CRM')).toEqual({
      slug: 'zohocrm',
      name: 'Zoho CRM',
      logo: undefined,
      isAvailable: false,
      isConnected: false,
      connectedAccountId: undefined,
    });
  });

  it('prefers meta.logo and falls back to top-level logo', () => {
    expect(getToolkitLogo({ meta: { logo: 'https://logos.composio.dev/api/github' } })).toBe(
      'https://logos.composio.dev/api/github',
    );
    expect(getToolkitLogo({ logo: 'https://logos.composio.dev/api/slack' })).toBe(
      'https://logos.composio.dev/api/slack',
    );
  });

  it('builds same-origin logo proxy URLs from the request origin', () => {
    expect(buildToolkitLogoProxyUrl(new Request('https://bolt.local/api/connections'), 'github')).toBe(
      'https://bolt.local/api/connections/logo?slug=github',
    );
  });

  it('normalizes connector names and slug variants consistently', () => {
    expect(normalizeAppConnectorKey('Google Search Console')).toBe('googlesearchconsole');
    expect(normalizeAppConnectorKey('Zoho CRM')).toBe('zohocrm');
    expect(normalizeAppConnectorKey('Hackernews')).toBe('hackernews');
  });

  it('approves only the configured connector set', () => {
    expect(isApprovedAppToolkit({ slug: 'googlesearchconsole', name: 'Google Search Console' })).toBe(true);
    expect(isApprovedAppToolkit({ slug: 'zohocrm', name: 'Zoho CRM' })).toBe(true);
    expect(isApprovedAppToolkit({ slug: 'youtube', name: 'YouTube' })).toBe(true);
    expect(isApprovedAppToolkit({ slug: 'ticktick', name: 'TickTick' })).toBe(false);
    expect(isApprovedAppToolkit({ slug: 'vercel', name: 'Vercel' })).toBe(true);
    expect(isApprovedAppToolkit({ slug: 'strava', name: 'Strava' })).toBe(false);
    expect(isApprovedAppToolkit({ slug: 'asana', name: 'Asana' })).toBe(false);
  });
});
