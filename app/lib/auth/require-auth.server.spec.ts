import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('./supabase-server', () => ({
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

import { requireAuth } from './require-auth.server';

describe('requireAuth', () => {
  const getUser = vi.fn();
  const request = new Request('https://cryzo.test/api/chat');
  const responseHeaders = new Headers({
    'Cache-Control': 'private, no-store',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseClient.mockReturnValue({
      responseHeaders,
      supabase: {
        auth: {
          getUser,
        },
      },
    });
  });

  it('returns authenticated supabase client and user on success', async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user_123',
          email: 'user@example.com',
          user_metadata: { name: 'Cryzo User' },
        },
      },
      error: null,
    });

    const result = await requireAuth(request, null);

    expect(result.user.id).toBe('user_123');
    expect(result.user.email).toBe('user@example.com');
    expect(result.responseHeaders.get('Cache-Control')).toBe('private, no-store');
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('throws a standardized 401 response when user is missing', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    try {
      await requireAuth(request, null);
      throw new Error('Expected requireAuth to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(payload).toMatchObject({
        error: true,
        errorType: 'auth_required',
        message: 'Authentication required.',
      });
    }
  });

  it('throws a standardized 401 response when Supabase returns an auth error', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Auth session missing'),
    });

    try {
      await requireAuth(request, null, { message: 'Sign in before continuing.' });
      throw new Error('Expected requireAuth to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload).toMatchObject({
        error: true,
        errorType: 'auth_required',
        message: 'Sign in before continuing.',
      });
    }
  });
});
