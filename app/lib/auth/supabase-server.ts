import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCookies } from '~/lib/api/cookies';
import { getServerEnvDiagnostics, type ServerEnv } from '~/lib/server-env';

function readServerEnvValue(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function getSupabaseServerConfig(serverEnv?: ServerEnv) {
  const url = readServerEnvValue(serverEnv?.SUPABASE_URL) ?? readServerEnvValue(serverEnv?.VITE_SUPABASE_URL);
  const anonKey =
    readServerEnvValue(serverEnv?.SUPABASE_ANON_KEY) ?? readServerEnvValue(serverEnv?.VITE_SUPABASE_ANON_KEY);

  if (!url) {
    logMissingSupabaseServerConfig('SUPABASE_URL', serverEnv);
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL on the server.');
  }

  if (!anonKey) {
    logMissingSupabaseServerConfig('SUPABASE_ANON_KEY', serverEnv);
    throw new Error('Missing SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY on the server.');
  }

  return { anonKey, url };
}

function logMissingSupabaseServerConfig(
  missingKey: 'SUPABASE_ANON_KEY' | 'SUPABASE_URL',
  serverEnv?: ServerEnv,
) {
  const diagnostics = getServerEnvDiagnostics(serverEnv);

  console.error('Supabase server configuration is missing required env keys.', {
    keys: diagnostics?.keys ?? {
      SUPABASE_ANON_KEY: Boolean(serverEnv?.SUPABASE_ANON_KEY),
      SUPABASE_URL: Boolean(serverEnv?.SUPABASE_URL),
      VITE_SUPABASE_ANON_KEY: Boolean(serverEnv?.VITE_SUPABASE_ANON_KEY),
      VITE_SUPABASE_URL: Boolean(serverEnv?.VITE_SUPABASE_URL),
    },
    missingKey,
    sourceKeys: diagnostics?.sourceKeys,
    sources: diagnostics?.sources,
  });
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}) {
  const encodedName = encodeURIComponent(name);
  const encodedValue = encodeURIComponent(value);
  const segments = [`${encodedName}=${encodedValue}`];

  if (typeof options.maxAge === 'number') {
    segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    segments.push('HttpOnly');
  }

  if (options.secure) {
    segments.push('Secure');
  }

  if (options.sameSite) {
    const sameSiteValue =
      typeof options.sameSite === 'string' ? options.sameSite : options.sameSite === true ? 'Strict' : undefined;

    if (sameSiteValue) {
      segments.push(`SameSite=${sameSiteValue.charAt(0).toUpperCase()}${sameSiteValue.slice(1).toLowerCase()}`);
    }
  }

  if (options.priority) {
    segments.push(`Priority=${options.priority}`);
  }

  if (options.partitioned) {
    segments.push('Partitioned');
  }

  return segments.join('; ');
}

function appendResponseHeaders(target: Headers, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    target.set(key, value);
  }
}

export function mergeResponseHeaders(headersInit?: HeadersInit, responseHeaders?: Headers) {
  const merged = new Headers(headersInit);

  if (!responseHeaders) {
    return merged;
  }

  const maybeGetSetCookie = (responseHeaders as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const hasGetSetCookie = typeof maybeGetSetCookie === 'function';

  if (hasGetSetCookie) {
    for (const cookieValue of maybeGetSetCookie.call(responseHeaders)) {
      merged.append('Set-Cookie', cookieValue);
    }
  }

  for (const [key, value] of responseHeaders.entries()) {
    if (hasGetSetCookie && key.toLowerCase() === 'set-cookie') {
      continue;
    }

    if (key.toLowerCase() === 'set-cookie') {
      merged.append(key, value);
      continue;
    }

    merged.set(key, value);
  }

  return merged;
}

export type ServerSupabaseClientResult = {
  responseHeaders: Headers;
  supabase: SupabaseClient;
};

export function createServerSupabaseClient(request: Request, serverEnv?: ServerEnv): ServerSupabaseClientResult {
  const { anonKey, url } = getSupabaseServerConfig(serverEnv);
  const responseHeaders = new Headers();
  const requestCookies = parseCookies(request.headers.get('Cookie'));
  const supabase = createServerClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    cookies: {
      getAll() {
        return Object.entries(requestCookies).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          responseHeaders.append('Set-Cookie', serializeCookie(cookie.name, cookie.value, cookie.options));
        }

        appendResponseHeaders(responseHeaders, headers);
      },
    },
  });

  return { supabase, responseHeaders };
}
