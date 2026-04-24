import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getServerEnv } from '~/lib/server-env';
import { createServerSupabaseClient, mergeResponseHeaders } from './supabase-server';

export type AuthenticatedRequest = {
  responseHeaders: Headers;
  supabase: SupabaseClient;
  user: User;
};

type RequireAuthOptions = {
  message?: string;
};

export function createAuthRequiredResponse(responseHeaders?: Headers, message = 'Authentication required.') {
  return new Response(
    JSON.stringify({
      error: true,
      errorType: 'auth_required',
      isRetryable: false,
      message,
      provider: 'Cryzo',
      statusCode: 401,
    }),
    {
      status: 401,
      headers: mergeResponseHeaders({ 'Content-Type': 'application/json' }, responseHeaders),
      statusText: 'Unauthorized',
    },
  );
}

export async function requireAuth(
  request: Request,
  context?: { cloudflare?: { env?: Record<string, string> }; env?: Record<string, string> } | null,
  options?: RequireAuthOptions,
): Promise<AuthenticatedRequest> {
  const serverEnv = getServerEnv(context);
  const { supabase, responseHeaders } = createServerSupabaseClient(request, serverEnv);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw createAuthRequiredResponse(responseHeaders, options?.message);
  }

  return { supabase, user, responseHeaders };
}

export function withSupabaseAuthHeaders(headersInit?: HeadersInit, responseHeaders?: Headers) {
  return mergeResponseHeaders(headersInit, responseHeaders);
}
