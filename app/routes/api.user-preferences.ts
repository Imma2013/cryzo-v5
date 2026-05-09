import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import {
  getCurrentUserRecord,
  upsertCurrentUserLlmPreferences,
  upsertCurrentUserProfile,
  type SupabaseLlmPreferences,
} from '~/lib/supabase/supabase-store.server';

function jsonResponse(payload: unknown, status = 200, responseHeaders?: Headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: withSupabaseAuthHeaders(
      {
        'Content-Type': 'application/json',
      },
      responseHeaders,
    ),
  });
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  let responseHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any);
    responseHeaders = auth.responseHeaders;
    const current = await getCurrentUserRecord(auth.supabase, auth.user.id);
    const metadata = (auth.user.user_metadata ?? {}) as Record<string, unknown>;

    return jsonResponse(
      {
        user: current ?? {
          uid: auth.user.id,
          email: auth.user.email ?? undefined,
          image:
            (typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined) ??
            (typeof metadata.picture === 'string' ? metadata.picture : undefined),
          name:
            (typeof metadata.full_name === 'string' ? metadata.full_name : undefined) ??
            (typeof metadata.name === 'string' ? metadata.name : undefined),
        },
      },
      200,
      responseHeaders,
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return jsonResponse(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Failed to load preferences.',
      },
      500,
      responseHeaders,
    );
  }
}

type UserPreferencesRequest = {
  llmPreferences?: SupabaseLlmPreferences;
  profile?: {
    email?: string;
    image?: string;
    name?: string;
  };
};

export async function action({ context, request }: ActionFunctionArgs) {
  if (request.method !== 'PATCH' && request.method !== 'POST') {
    return jsonResponse({ error: true, message: 'Method not allowed.' }, 405);
  }

  let responseHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any);
    responseHeaders = auth.responseHeaders;
    const body = (await request.json()) as UserPreferencesRequest;
    const metadata = (auth.user.user_metadata ?? {}) as Record<string, unknown>;

    await upsertCurrentUserProfile(auth.supabase, auth.user.id, {
      email: body.profile?.email ?? auth.user.email ?? undefined,
      image:
        body.profile?.image ??
        (typeof metadata.avatar_url === 'string' ? metadata.avatar_url : undefined) ??
        (typeof metadata.picture === 'string' ? metadata.picture : undefined),
      name:
        body.profile?.name ??
        (typeof metadata.full_name === 'string' ? metadata.full_name : undefined) ??
        (typeof metadata.name === 'string' ? metadata.name : undefined),
    });

    if (body.llmPreferences) {
      await upsertCurrentUserLlmPreferences(auth.supabase, auth.user.id, body.llmPreferences);
    }

    const current = await getCurrentUserRecord(auth.supabase, auth.user.id);
    return jsonResponse({ ok: true, user: current }, 200, responseHeaders);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return jsonResponse(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Failed to update preferences.',
      },
      500,
      responseHeaders,
    );
  }
}
