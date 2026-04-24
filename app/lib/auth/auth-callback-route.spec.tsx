import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerSupabaseClient, exchangeCodeForSession } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock('~/lib/auth/supabase-server', () => ({
  createServerSupabaseClient,
  mergeResponseHeaders: (headersInit?: HeadersInit, responseHeaders?: Headers) => {
    const headers = new Headers(headersInit);

    if (responseHeaders) {
      for (const [key, value] of responseHeaders.entries()) {
        headers.append(key, value);
      }
    }

    return headers;
  },
}));

import { parseAuthCallbackParams } from './auth-callback';
import { loader } from '~/routes/auth.callback';

describe('auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClient.mockReturnValue({
      responseHeaders: new Headers({
        'Set-Cookie': 'sb-test=token; Path=/; HttpOnly',
      }),
      supabase: {
        auth: {
          exchangeCodeForSession,
        },
      },
    });
  });

  it('parses callback params and sanitizes unsafe next path', () => {
    const params = parseAuthCallbackParams(
      new URL('https://cryzo.test/auth/callback?code=abc123&next=https://evil.com/pwned'),
    );

    expect(params.authCode).toBe('abc123');
    expect(params.nextPath).toBe('/');
  });

  it('exchanges a valid OAuth code and redirects to safe next path', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const request = new Request('https://cryzo.test/auth/callback?code=abc123&next=/chat/abc');

    const response = await loader({ request, context: {}, params: {} } as any);

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/chat/abc');
    expect(response.headers.get('Set-Cookie')).toContain('sb-test=token');
  });

  it('bypasses code exchange when auth error params are present', async () => {
    const request = new Request(
      'https://cryzo.test/auth/callback?error=access_denied&error_description=Denied&next=/settings',
    );

    const response = await loader({ request, context: {}, params: {} } as any);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/settings');
  });
});
