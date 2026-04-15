import { afterEach, describe, expect, it, vi } from 'vitest';

const composioState = vi.hoisted(() => ({
  createComposioClient: vi.fn(),
}));

vi.mock('~/lib/.server/composio', () => ({
  createComposioClient: composioState.createComposioClient,
}));

import { getToolkitSlug, loader, validateLogoUrl } from '~/routes/api.connections.logo';

afterEach(() => {
  composioState.createComposioClient.mockReset();
  vi.unstubAllGlobals();
});

describe('/api/connections/logo loader', () => {
  it('loads a toolkit logo using toolkits.get', async () => {
    const upstreamBody = new TextEncoder().encode('<svg></svg>');

    composioState.createComposioClient.mockReturnValue({
      toolkits: {
        get: vi.fn().mockResolvedValue({
          meta: {
            logo: 'https://logos.composio.dev/api/github',
          },
        }),
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(upstreamBody, {
          status: 200,
          headers: {
            'Content-Type': 'image/svg+xml',
          },
        }),
      ),
    );

    const response = await loader({
      request: new Request('https://bolt.local/api/connections/logo?slug=github'),
      context: {} as never,
      params: {},
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    await expect(response.text()).resolves.toContain('<svg');
  });
});

describe('logo route helpers', () => {
  it('reads the toolkit slug from the query string', () => {
    expect(getToolkitSlug(new Request('https://bolt.local/api/connections/logo?slug=github'))).toBe('github');
  });

  it('allows only composio logo hosts', () => {
    expect(validateLogoUrl('https://logos.composio.dev/api/github').hostname).toBe('logos.composio.dev');
    expect(() => validateLogoUrl('https://example.com/logo.svg')).toThrow();
  });
});
