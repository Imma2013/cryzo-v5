import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createComposioClient, resolveComposioApiKey } from '~/lib/.server/composio';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import { withSecurity } from '~/lib/security';

async function disconnectAction({ request, context }: ActionFunctionArgs) {
  let authHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before managing app connections.',
    });
    authHeaders = auth.responseHeaders;
    const { connectedAccountId } = (await request.json()) as { connectedAccountId?: string };

    if (!connectedAccountId) {
      return json({ error: 'connectedAccountId is required.' }, { headers: withSupabaseAuthHeaders(undefined, authHeaders), status: 400 });
    }

    console.info('[api.connections.disconnect] deleting connected account', {
      connectedAccountId,
      hasApiKey: Boolean(resolveComposioApiKey(context)),
      userId: auth.user.id,
    });

    const composio = createComposioClient(context);
    await composio.connectedAccounts.delete(connectedAccountId);

    return json({ success: true }, { headers: withSupabaseAuthHeaders(undefined, authHeaders) });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('Failed to disconnect Composio app', error);

    return json(
      {
        error: error instanceof Error ? `Failed to disconnect app: ${error.message}` : 'Failed to disconnect app.',
      },
      { headers: withSupabaseAuthHeaders(undefined, authHeaders), status: 500 },
    );
  }
}

export const action = withSecurity(disconnectAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
