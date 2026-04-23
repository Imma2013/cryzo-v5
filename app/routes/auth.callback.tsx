import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import { getSupabaseAuthClient, waitForSupabaseAuthReady } from '~/lib/auth/supabase-client';
import { sanitizeRelativeRedirectPath } from '~/lib/auth/redirect-path';

export default function AuthCallbackRoute() {
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const nextPath = useMemo(() => sanitizeRelativeRedirectPath(searchParams.get('next'), '/'), [searchParams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await waitForSupabaseAuthReady();
        const supabase = getSupabaseAuthClient();

        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          
          // If we have a session, wait a tiny bit for the auth state to propagate
          if (session) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        if (!cancelled && typeof window !== 'undefined') {
          window.location.replace(nextPath);
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('Unable to complete Google sign-in. Please close this page and try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nextPath]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-bolt-elements-textPrimary">Finalizing your sign-in...</h1>
      <p className="mt-3 text-sm text-bolt-elements-textSecondary">
        We&apos;re finishing your authentication and sending you back to Cryzo.
      </p>
      {errorMessage ? <p className="mt-4 text-sm text-red-500">{errorMessage}</p> : null}
    </main>
  );
}
