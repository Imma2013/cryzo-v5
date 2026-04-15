import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { createComposioClient } from '~/lib/.server/composio';
import { withSecurity } from '~/lib/security';
import { getToolkitLogo } from './api.connections';

const ALLOWED_LOGO_HOST = 'logos.composio.dev';
const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

function getToolkitSlug(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug')?.trim();

  if (!slug) {
    throw new Response('Missing toolkit slug.', { status: 400 });
  }

  return slug;
}

function validateLogoUrl(logoUrl: string) {
  const parsedUrl = new URL(logoUrl);

  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== ALLOWED_LOGO_HOST) {
    throw new Response('Unsupported logo host.', { status: 400 });
  }

  return parsedUrl;
}

async function logoLoader({ request, context }: LoaderFunctionArgs) {
  try {
    const toolkitSlug = getToolkitSlug(request);
    const composio = createComposioClient(context);
    const toolkit = await composio.toolkits.get(toolkitSlug);
    const logoUrl = getToolkitLogo(toolkit);

    if (!logoUrl) {
      return new Response('Toolkit logo not found.', { status: 404 });
    }

    const validatedLogoUrl = validateLogoUrl(logoUrl);
    const upstreamResponse = await fetch(validatedLogoUrl, {
      headers: {
        Accept: 'image/*',
      },
    });

    if (!upstreamResponse.ok) {
      return new Response('Failed to fetch toolkit logo.', { status: 502 });
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Cache-Control', CACHE_CONTROL);
    responseHeaders.set('Content-Type', upstreamResponse.headers.get('Content-Type') || 'image/svg+xml');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('Failed to proxy Composio logo', error);

    return new Response('Failed to load toolkit logo.', { status: 500 });
  }
}

export const loader = withSecurity(logoLoader, {
  rateLimit: false,
  allowedMethods: ['GET'],
});

export { getToolkitSlug, validateLogoUrl };
