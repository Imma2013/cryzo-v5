import { redirect, type LoaderFunctionArgs } from '@remix-run/node';
import { parseAuthCallbackParams } from '~/lib/auth/auth-callback';
import { createServerSupabaseClient, mergeResponseHeaders } from '~/lib/auth/supabase-server';
import { getServerEnv } from '~/lib/server-env';

export async function loader({ context, request }: LoaderFunctionArgs) {
  const serverEnv = getServerEnv(context as any);
  const { supabase, responseHeaders } = createServerSupabaseClient(request, serverEnv);
  const url = new URL(request.url);
  const { authCode, authError, authErrorDescription, nextPath } = parseAuthCallbackParams(url);

  if (authError || authErrorDescription) {
    return redirect(nextPath, {
      headers: mergeResponseHeaders(undefined, responseHeaders),
    });
  }

  if (authCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(authCode);

    if (error) {
      return redirect(nextPath, {
        headers: mergeResponseHeaders(undefined, responseHeaders),
      });
    }
  }

  return redirect(nextPath, {
    headers: mergeResponseHeaders(undefined, responseHeaders),
  });
}

export default function AuthCallbackRoute() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-bolt-elements-textPrimary">Finalizing your sign-in...</h1>
      <p className="mt-3 text-sm text-bolt-elements-textSecondary">
        We&apos;re finishing your authentication and sending you back to Cryzo.
      </p>
    </main>
  );
}
