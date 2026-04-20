import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getBearerTokenFromAuthorizationHeader, verifyFirebaseIdToken } from '~/lib/auth/firebase-server';
import {
  getCurrentUserRecord,
  upsertCurrentUserLlmPreferences,
  upsertCurrentUserProfile,
  type FirestoreLlmPreferences,
} from '~/lib/firebase/firestore-store.server';
import { getServerEnv } from '~/lib/server-env';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function requireFirebaseAuth(request: Request, serverEnv: Record<string, string | undefined>) {
  const token = getBearerTokenFromAuthorizationHeader(request.headers.get('Authorization'));

  if (!token) {
    throw new Response(
      JSON.stringify({
        error: true,
        errorType: 'auth_required',
        message: 'Sign in before reading preferences.',
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
    const verified = await verifyFirebaseIdToken(token, serverEnv as any);
    return { token, verified };
  } catch {
    throw new Response(
      JSON.stringify({
        error: true,
        errorType: 'auth_required',
        message: 'Sign in before reading preferences.',
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
    const { token, verified } = await requireFirebaseAuth(request, serverEnv);
    const current = await getCurrentUserRecord(serverEnv, token);

    return jsonResponse({
      user: current ?? {
        uid: verified.uid,
        email: verified.email,
      },
    });
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
    );
  }
}

type UserPreferencesRequest = {
  llmPreferences?: FirestoreLlmPreferences;
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

  const serverEnv = getServerEnv(context as any);

  try {
    const { token, verified } = await requireFirebaseAuth(request, serverEnv);
    const body = (await request.json()) as UserPreferencesRequest;

    await upsertCurrentUserProfile(serverEnv, token, {
      email: body.profile?.email ?? verified.email,
      image: body.profile?.image ?? verified.image,
      name: body.profile?.name ?? verified.name,
    });

    if (body.llmPreferences) {
      await upsertCurrentUserLlmPreferences(serverEnv, token, body.llmPreferences);
    }

    const current = await getCurrentUserRecord(serverEnv, token);
    return jsonResponse({ ok: true, user: current });
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
    );
  }
}
