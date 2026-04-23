import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerEnv } from '~/lib/server-env';

export type VerifiedSupabaseAuth = {
  claims: Record<string, unknown>;
  email?: string;
  image?: string;
  name?: string;
  uid: string;
};

export function getBearerTokenFromAuthorizationHeader(header: string | null) {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token.trim();
}

function readServerEnvValue(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function getSupabaseServerConfig(serverEnv?: ServerEnv) {
  const url = readServerEnvValue(serverEnv?.SUPABASE_URL) ?? readServerEnvValue(serverEnv?.VITE_SUPABASE_URL);
  const anonKey =
    readServerEnvValue(serverEnv?.SUPABASE_ANON_KEY) ?? readServerEnvValue(serverEnv?.VITE_SUPABASE_ANON_KEY);

  if (!url) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL on the server.');
  }

  if (!anonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY on the server.');
  }

  return { anonKey, url };
}

const supabaseAuthClientByUrl = new Map<string, SupabaseClient>();

function getSupabaseAuthClient(serverEnv?: ServerEnv) {
  const { anonKey, url } = getSupabaseServerConfig(serverEnv);
  const existing = supabaseAuthClientByUrl.get(url);

  if (existing) {
    return existing;
  }

  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  supabaseAuthClientByUrl.set(url, client);
  return client;
}

export async function verifySupabaseAccessToken(token: string, serverEnv?: ServerEnv): Promise<VerifiedSupabaseAuth> {
  const authClient = getSupabaseAuthClient(serverEnv);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid authentication token.');
  }

  const uid = typeof user.id === 'string' ? user.id : undefined;

  if (!uid) {
    throw new Error('Invalid authentication token.');
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  return {
    claims: {
      app_metadata: user.app_metadata ?? {},
      user_metadata: metadata,
    },
    email: user.email ?? undefined,
    image:
      (typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined) ??
      (typeof metadata.picture === 'string' ? metadata.picture : undefined),
    name:
      (typeof metadata.full_name === 'string' ? metadata.full_name : undefined) ??
      (typeof metadata.name === 'string' ? metadata.name : undefined),
    uid,
  };
}
