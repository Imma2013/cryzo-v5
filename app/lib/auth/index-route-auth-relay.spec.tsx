import { describe, expect, it } from 'vitest';
import { loader as indexLoader } from '~/routes/_index';

describe('index route auth relay', () => {
  it('relays oauth callback params from root to /auth/callback', async () => {
    const request = new Request('https://cryzo.test/?code=abc123&state=xyz');

    const response = await indexLoader({ request, context: {}, params: {} } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('/auth/callback?');
    expect(response.headers.get('Location')).toContain('code=abc123');
    expect(response.headers.get('Location')).toContain('next=%2F');
  });

  it('does not redirect for regular root requests', async () => {
    const request = new Request('https://cryzo.test/');

    const response = await indexLoader({ request, context: {}, params: {} } as any);

    expect(response.status).toBe(200);
  });
});
