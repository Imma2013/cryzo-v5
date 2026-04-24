import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import {
  APPROVED_APP_CONNECTOR_NAMES,
  APPS_VIEW_QUERY_KEY,
  APPS_VIEW_QUERY_VALUE,
  isApprovedAppToolkit,
  normalizeAppConnectorKey,
} from '~/components/apps/apps.constants';
import {
  createComposioManagementSession,
  extractComposioRedirectUrl,
  resolveComposioApiKey,
} from '~/lib/.server/composio';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import { withSecurity } from '~/lib/security';

export function buildToolkitLogoProxyUrl(request: Request, toolkitSlug: string) {
  const url = new URL('/api/connections/logo', request.url);
  url.searchParams.set('slug', toolkitSlug);

  return url.toString();
}

function requiresAuthentication(toolkit: { noAuth?: boolean; isNoAuth?: boolean }) {
  return toolkit.noAuth !== true && toolkit.isNoAuth !== true;
}

function getToolkitSlug(toolkit: any) {
  return typeof toolkit?.slug === 'string'
    ? toolkit.slug
    : typeof toolkit?.name === 'string'
      ? normalizeAppConnectorKey(toolkit.name)
      : undefined;
}

export function getToolkitLogo(toolkit: { logo?: string; meta?: { logo?: string } }) {
  return toolkit.meta?.logo ?? (toolkit as any)?.logoUrl ?? toolkit.logo;
}

function extractConnectedAccountId(toolkit: any): string | undefined {
  const directCandidates = [
    toolkit?.connection?.connectedAccount?.id,
    toolkit?.connection?.connectedAccountId,
    toolkit?.connectedAccount?.id,
    toolkit?.connected_account?.id,
    toolkit?.connectedAccountId,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  const groupedCandidates = [
    toolkit?.connection?.connectedAccounts,
    toolkit?.connectedAccounts,
    toolkit?.connected_accounts,
  ];

  for (const group of groupedCandidates) {
    if (!Array.isArray(group)) {
      continue;
    }

    const account = group.find((item) => typeof item?.id === 'string');

    if (account?.id) {
      return account.id;
    }
  }

  return undefined;
}

function isToolkitConnected(toolkit: any) {
  if (toolkit?.connection?.isActive === true || toolkit?.isConnected === true) {
    return true;
  }

  return Boolean(extractConnectedAccountId(toolkit));
}

function getToolkitItems(toolkitsResponse: any) {
  if (Array.isArray(toolkitsResponse)) {
    return toolkitsResponse;
  }

  const candidates = [
    toolkitsResponse?.items,
    toolkitsResponse?.toolkits,
    toolkitsResponse?.data?.items,
    toolkitsResponse?.data?.toolkits,
    toolkitsResponse?.response?.data?.items,
    toolkitsResponse?.response?.data?.toolkits,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function buildConnectionsErrorMessage(error: unknown, phase: 'env' | 'toolkits' | 'authorize' | 'disconnect') {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (message.includes('Missing COMPOSIO_API_KEY')) {
    return 'Missing COMPOSIO_API_KEY on the server runtime. Add it to the Vercel environment variables before using Apps.';
  }

  if (phase === 'authorize' && message) {
    return `Failed to start app connection: ${message}`;
  }

  if (phase === 'disconnect' && message) {
    return `Failed to disconnect app: ${message}`;
  }

  if (phase === 'toolkits' && message) {
    return `Failed to load app connections: ${message}`;
  }

  return message || 'Failed to load Composio connections.';
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

async function connectionsLoader({ request, context }: LoaderFunctionArgs) {
  let authHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before managing app connections.',
    });
    authHeaders = auth.responseHeaders;
    const userId = auth.user.id;
    const hasApiKey = Boolean(resolveComposioApiKey(context));

    console.info('[api.connections] creating management session', {
      hasApiKey,
      userId,
    });

    const session = await createComposioManagementSession(context, userId, {
      manageConnections: true,
    });
    const toolkitsResponse = await session.toolkits({
      limit: 200,
    });
    const toolkitItems = getToolkitItems(toolkitsResponse);
    const activeAccountsByToolkitSlug = new Map<string, string>(
      toolkitItems
        .map((toolkit: any) => {
          const slug = getToolkitSlug(toolkit);
          const connectedAccountId = extractConnectedAccountId(toolkit);

          return slug && isToolkitConnected(toolkit) && connectedAccountId
            ? ([slug, connectedAccountId] as const)
            : null;
        })
        .filter((entry: readonly [string, string] | null): entry is readonly [string, string] => Boolean(entry)),
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
        error: buildConnectionsErrorMessage(error, 'toolkits'),
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

    const session = await createComposioManagementSession(context, userId, {
      manageConnections: true,
    });
    const origin = new URL(request.url).origin;
    const callbackUrl = `${origin}/?${APPS_VIEW_QUERY_KEY}=${APPS_VIEW_QUERY_VALUE}`;
    const connectionRequest = await session.authorize(toolkit, {
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
        error: buildConnectionsErrorMessage(error, 'authorize'),
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

export { buildApprovedToolkitCatalog };
