import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import {
  APPROVED_APP_CONNECTOR_NAMES,
  APPS_VIEW_QUERY_KEY,
  APPS_VIEW_QUERY_VALUE,
  isApprovedAppToolkit,
  normalizeAppConnectorKey,
} from '~/components/apps/apps.constants';
import {
  createComposioClient,
  createComposioConnectionRequest,
  extractComposioRedirectUrl,
} from '~/lib/.server/composio';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import { withSecurity } from '~/lib/security';

export function buildToolkitLogoProxyUrl(request: Request, toolkitSlug: string) {
  const url = new URL('/api/connections/logo', request.url);
  url.searchParams.set('slug', toolkitSlug);

  return url.toString();
}

function requiresAuthentication(toolkit: { noAuth?: boolean }) {
  return toolkit.noAuth !== true;
}

export function getToolkitLogo(toolkit: { logo?: string; meta?: { logo?: string } }) {
  return toolkit.meta?.logo ?? toolkit.logo;
}

function buildApprovedToolkitCatalog(
  request: Request,
  toolkitItems: any[],
  activeAccountsByToolkitSlug: Map<string, string>,
) {
  const liveToolkitsByKey = new Map<string, any>();

  for (const toolkit of toolkitItems.filter(requiresAuthentication).filter(isApprovedAppToolkit)) {
    for (const value of [toolkit.slug, toolkit.name]) {
      if (!value) {
        continue;
      }

      const key = normalizeAppConnectorKey(value);

      if (!liveToolkitsByKey.has(key)) {
        liveToolkitsByKey.set(key, toolkit);
      }
    }
  }

  return APPROVED_APP_CONNECTOR_NAMES.map((approvedName) => {
    const matchedToolkit = liveToolkitsByKey.get(normalizeAppConnectorKey(approvedName));
    const slug = matchedToolkit?.slug ?? normalizeAppConnectorKey(approvedName);

    return {
      slug,
      name: approvedName,
      logo: matchedToolkit && getToolkitLogo(matchedToolkit) ? buildToolkitLogoProxyUrl(request, matchedToolkit.slug) : undefined,
      isAvailable: Boolean(matchedToolkit),
      isConnected: activeAccountsByToolkitSlug.has(slug),
      connectedAccountId: activeAccountsByToolkitSlug.get(slug),
    };
  });
}

function getCollectionItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  for (const key of ['items', 'data', 'results', 'toolkits']) {
    const items = (value as Record<string, unknown>)[key];

    if (Array.isArray(items)) {
      return items as T[];
    }
  }

  return [];
}

async function connectionsLoader({ request, context }: LoaderFunctionArgs) {
  let authHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before managing app connections.',
    });
    authHeaders = auth.responseHeaders;
    const userId = auth.user.id;
    const composio = createComposioClient(context);
    const [toolkits, connectedAccounts] = await Promise.all([
      composio.toolkits.get({
        limit: 200,
      }),
      composio.connectedAccounts.list({
        userIds: [userId],
        statuses: ['ACTIVE'],
      }),
    ]);
    const toolkitItems = getCollectionItems<any>(toolkits);
    const connectedAccountItems = getCollectionItems<any>(connectedAccounts);

    const activeAccountsByToolkitSlug = new Map(
      connectedAccountItems
        .map((account: any) => [account.toolkit.slug, account.id] as const)
        .filter(([toolkitSlug]: readonly [string, string]) => Boolean(toolkitSlug)),
    );

    return json({
      toolkits: buildApprovedToolkitCatalog(request, toolkitItems, activeAccountsByToolkitSlug),
    }, {
      headers: withSupabaseAuthHeaders(undefined, authHeaders),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('Failed to load Composio connections', error);

    return json(
      {
        error: error instanceof Error ? error.message : 'Failed to load Composio connections.',
      },
      { headers: withSupabaseAuthHeaders(undefined, authHeaders), status: 500 },
    );
  }
}

async function connectionsAction({ request, context }: ActionFunctionArgs) {
  let authHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before managing app connections.',
    });
    authHeaders = auth.responseHeaders;
    const userId = auth.user.id;
    const { toolkit } = (await request.json()) as { toolkit?: string };

    if (!toolkit) {
      return json({ error: 'Toolkit is required.' }, { headers: withSupabaseAuthHeaders(undefined, authHeaders), status: 400 });
    }

    const composio = createComposioClient(context);
    const origin = new URL(request.url).origin;
    const callbackUrl = `${origin}/?${APPS_VIEW_QUERY_KEY}=${APPS_VIEW_QUERY_VALUE}`;
    const connectionRequest = await createComposioConnectionRequest(composio, userId, toolkit, {
      callbackUrl,
    });
    const redirectUrl = extractComposioRedirectUrl(connectionRequest);

    if (!redirectUrl) {
      return json(
        { error: `Composio did not return a redirect URL for toolkit "${toolkit}".` },
        { headers: withSupabaseAuthHeaders(undefined, authHeaders), status: 502 },
      );
    }

    return json({ redirectUrl }, { headers: withSupabaseAuthHeaders(undefined, authHeaders) });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('Failed to create Composio connection', error);

    return json(
      {
        error: error instanceof Error ? error.message : 'Failed to create Composio connection.',
      },
      { headers: withSupabaseAuthHeaders(undefined, authHeaders), status: 500 },
    );
  }
}

export const loader = withSecurity(connectionsLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

export const action = withSecurity(connectionsAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});

export { buildApprovedToolkitCatalog, getCollectionItems };
