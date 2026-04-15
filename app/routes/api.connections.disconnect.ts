import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createComposioClient } from '~/lib/.server/composio';
import { withSecurity } from '~/lib/security';

async function disconnectAction({ request, context }: ActionFunctionArgs) {
  try {
    const { connectedAccountId } = (await request.json()) as { connectedAccountId?: string };

    if (!connectedAccountId) {
      return json({ error: 'connectedAccountId is required.' }, { status: 400 });
    }

    const composio = createComposioClient(context);
    await composio.connectedAccounts.delete(connectedAccountId);

    return json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect Composio app', error);

    return json(
      {
        error: error instanceof Error ? error.message : 'Failed to disconnect Composio app.',
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(disconnectAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
