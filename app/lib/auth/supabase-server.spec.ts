import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient,
}));

import { createServerSupabaseClient } from './supabase-server';

describe('createServerSupabaseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerClient.mockReturnValue({
      auth: {},
    });
  });

  it('creates a server client when only VITE Supabase env vars are present', () => {
    const request = new Request('https://cryzo.test/api/chats');

    createServerSupabaseClient(request, {
      VITE_SUPABASE_ANON_KEY: 'anon-key-from-vite',
      VITE_SUPABASE_URL: 'https://vite.supabase.co',
    });

    expect(createServerClient).toHaveBeenCalledWith(
      'https://vite.supabase.co',
      'anon-key-from-vite',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        }),
      }),
    );
  });

  it('throws a missing-url error when no Supabase url is available', () => {
    const request = new Request('https://cryzo.test/api/chats');

    expect(() =>
      createServerSupabaseClient(request, {
        SUPABASE_ANON_KEY: 'anon-key',
      }),
    ).toThrowError('Missing SUPABASE_URL or VITE_SUPABASE_URL on the server.');
  });

  it('throws a missing-anon-key error when no Supabase anon key is available', () => {
    const request = new Request('https://cryzo.test/api/chats');

    expect(() =>
      createServerSupabaseClient(request, {
        SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toThrowError('Missing SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY on the server.');
  });
});
