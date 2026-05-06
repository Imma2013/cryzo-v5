import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { requireAuth, withSupabaseAuthHeaders } from '~/lib/auth/require-auth.server';
import {
  getGoogleApiKeyFingerprint,
  inspectGoogleImageModelAccess,
  runGoogleImageProbe,
} from '~/lib/llm/google-image-diagnostics';
import { resolveGoogleServerApiKeyForRuntime } from '~/lib/llm/google-server-runtime';
import { logGoogleServerKeyResolution } from '~/lib/llm/provider-setup';
import { withSecurity } from '~/lib/security';
import { getServerEnv } from '~/lib/server-env';

async function googleImageDiagnosticsLoader({ context, request }: LoaderFunctionArgs) {
  let responseHeaders: Headers | undefined;

  try {
    const auth = await requireAuth(request, context as any, {
      message: 'Sign in before running Google image diagnostics.',
    });
    responseHeaders = auth.responseHeaders;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }

  const serverEnv = getServerEnv(context as any);
  const resolution = resolveGoogleServerApiKeyForRuntime(serverEnv);
  logGoogleServerKeyResolution('api.google-image-diagnostics', resolution);

  if (!resolution.key) {
    return json(
      {
        configured: false,
        message: 'GOOGLE_GENERATIVE_AI_API_KEY is missing on the server.',
        source: resolution.source,
      },
      {
        headers: withSupabaseAuthHeaders({ 'Cache-Control': 'no-store' }, responseHeaders),
        status: 503,
      },
    );
  }

  const url = new URL(request.url);
  const shouldProbe = url.searchParams.get('probe') === 'true';
  const keyFingerprint = await getGoogleApiKeyFingerprint(resolution.key);
  const modelAccess = await inspectGoogleImageModelAccess(resolution.key);
  const probe = shouldProbe ? await runGoogleImageProbe(resolution.key) : undefined;

  return json(
    {
      configured: true,
      keyFingerprint,
      modelAccess,
      probe,
      probeRan: shouldProbe,
      source: resolution.source,
    },
    {
      headers: withSupabaseAuthHeaders({ 'Cache-Control': 'no-store' }, responseHeaders),
      status: modelAccess.ok && (!probe || probe.ok) ? 200 : 502,
    },
  );
}

export const loader = withSecurity(googleImageDiagnosticsLoader, {
  allowedMethods: ['GET'],
});
