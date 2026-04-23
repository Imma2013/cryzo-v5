import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function readEnvValue(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

const supabaseUrl = readEnvValue(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = readEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseAuthClient() {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }

  return supabaseClient;
}

export function getSupabaseGoogleProvider() {
  return 'google' as const;
}

export async function waitForSupabaseAuthReady() {
  const client = getSupabaseAuthClient();

  if (!client) {
    return;
  }

  await client.auth.getSession();
}
