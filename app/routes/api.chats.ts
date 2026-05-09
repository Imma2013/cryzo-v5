import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import {
  deleteCurrentUserChat,
  duplicateCurrentUserChat,
  forkCurrentUserChat,
  getCurrentUserChatByRouteId,
  listCurrentUserChats,
  upsertCurrentUserChat,
  updateCurrentUserChatDescription,
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
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before accessing chats.',
    });
    responseHeaders = auth.responseHeaders;
    const url = new URL(request.url);
    const routeId = url.searchParams.get('routeId');

    if (routeId) {
      const chat = await getCurrentUserChatByRouteId(auth.supabase, auth.user.id, routeId);
      return jsonResponse({ chat }, 200, responseHeaders);
    }

    const chats = await listCurrentUserChats(auth.supabase, auth.user.id);
    return jsonResponse({ chats }, 200, responseHeaders);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return jsonResponse(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Failed to load chats.',
      },
      500,
      responseHeaders,
    );
  }
}

type ChatsMutationRequest =
  | {
      operation: 'upsert';
      routeId: string;
      description?: string;
      messagesJson: string;
      metadata?: {
        gitUrl?: string;
        gitBranch?: string;
        netlifySiteId?: string;
      };
      snapshotJson?: string;
      timestamp: string;
    }
  | { operation: 'delete'; routeId: string }
  | { operation: 'duplicate'; routeId: string; nextRouteId: string }
  | { operation: 'fork'; routeId: string; nextRouteId: string; messageId: string }
  | { operation: 'updateDescription'; routeId: string; description: string };

export async function action({ context, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: true, message: 'Method not allowed.' }, 405);
  }

  let responseHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before accessing chats.',
    });
    responseHeaders = auth.responseHeaders;
    const payload = (await request.json()) as ChatsMutationRequest;

    if (payload.operation === 'upsert') {
      const chat = await upsertCurrentUserChat(auth.supabase, auth.user.id, payload);
      return jsonResponse({ ok: true, chat }, 200, responseHeaders);
    }

    if (payload.operation === 'delete') {
      await deleteCurrentUserChat(auth.supabase, auth.user.id, payload.routeId);
      return jsonResponse({ ok: true }, 200, responseHeaders);
    }

    if (payload.operation === 'duplicate') {
      const routeId = await duplicateCurrentUserChat(auth.supabase, auth.user.id, payload.routeId, payload.nextRouteId);
      return jsonResponse({ ok: true, routeId }, 200, responseHeaders);
    }

    if (payload.operation === 'fork') {
      const routeId = await forkCurrentUserChat(
        auth.supabase,
        auth.user.id,
        payload.routeId,
        payload.nextRouteId,
        payload.messageId,
      );
      return jsonResponse({ ok: true, routeId }, 200, responseHeaders);
    }

    if (payload.operation === 'updateDescription') {
      await updateCurrentUserChatDescription(auth.supabase, auth.user.id, payload.routeId, payload.description);
      return jsonResponse({ ok: true }, 200, responseHeaders);
    }

    return jsonResponse({ error: true, message: 'Unsupported operation.' }, 400, responseHeaders);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return jsonResponse(
      {
        error: true,
        message: error instanceof Error ? error.message : 'Failed to update chats.',
      },
      500,
      responseHeaders,
    );
  }
}
