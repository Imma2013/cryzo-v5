import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getBearerTokenFromAuthorizationHeader, verifySupabaseAccessToken } from '~/lib/auth/supabase-server';
import {
  deleteCurrentUserChat,
  duplicateCurrentUserChat,
  forkCurrentUserChat,
  getCurrentUserChatByRouteId,
  listCurrentUserChats,
  upsertCurrentUserChat,
  updateCurrentUserChatDescription,
} from '~/lib/supabase/supabase-store.server';
import { getServerEnv } from '~/lib/server-env';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function requireSupabaseSession(request: Request, serverEnv: Record<string, string | undefined>) {
  const token = getBearerTokenFromAuthorizationHeader(request.headers.get('Authorization'));

  if (!token) {
    throw new Response(
      JSON.stringify({
        error: true,
        errorType: 'auth_required',
        message: 'Sign in before accessing chats.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }

  try {
    const verified = await verifySupabaseAccessToken(token, serverEnv as any);
    return { accessToken: token, uid: verified.uid };
  } catch {
    throw new Response(
      JSON.stringify({
        error: true,
        errorType: 'auth_required',
        message: 'Sign in before accessing chats.',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const serverEnv = getServerEnv(context as any);

  try {
    const session = await requireSupabaseSession(request, serverEnv);
    const url = new URL(request.url);
    const routeId = url.searchParams.get('routeId');

    if (routeId) {
      const chat = await getCurrentUserChatByRouteId(serverEnv, session.uid, session.accessToken, routeId);
      return jsonResponse({ chat });
    }

    const chats = await listCurrentUserChats(serverEnv, session.uid, session.accessToken);
    return jsonResponse({ chats });
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

  const serverEnv = getServerEnv(context as any);

  try {
    const session = await requireSupabaseSession(request, serverEnv);
    const payload = (await request.json()) as ChatsMutationRequest;

    if (payload.operation === 'upsert') {
      const chat = await upsertCurrentUserChat(serverEnv, session.uid, session.accessToken, payload);
      return jsonResponse({ ok: true, chat });
    }

    if (payload.operation === 'delete') {
      await deleteCurrentUserChat(serverEnv, session.uid, session.accessToken, payload.routeId);
      return jsonResponse({ ok: true });
    }

    if (payload.operation === 'duplicate') {
      const routeId = await duplicateCurrentUserChat(
        serverEnv,
        session.uid,
        session.accessToken,
        payload.routeId,
        payload.nextRouteId,
      );
      return jsonResponse({ ok: true, routeId });
    }

    if (payload.operation === 'fork') {
      const routeId = await forkCurrentUserChat(
        serverEnv,
        session.uid,
        session.accessToken,
        payload.routeId,
        payload.nextRouteId,
        payload.messageId,
      );
      return jsonResponse({ ok: true, routeId });
    }

    if (payload.operation === 'updateDescription') {
      await updateCurrentUserChatDescription(
        serverEnv,
        session.uid,
        session.accessToken,
        payload.routeId,
        payload.description,
      );
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: true, message: 'Unsupported operation.' }, 400);
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
    );
  }
}
