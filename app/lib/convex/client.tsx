import { useEffect, useMemo, type ReactNode } from 'react';
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export const isConvexConfigured = Boolean(convexUrl);

function useFirebaseConvexAuth() {
  const { getAccessToken, isLoading, user } = useFirebaseAuth();

  return useMemo(
    () => ({
      fetchAccessToken: async ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
        getAccessToken(forceRefreshToken),
      isAuthenticated: Boolean(user),
      isLoading,
    }),
    [getAccessToken, isLoading, user],
  );
}

function ConvexProfileSync() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user } = useFirebaseAuth();
  const upsertCurrentUser = useMutation(api.users.upsertCurrentUser);

  useEffect(() => {
    if (!isConvexConfigured || isLoading || !isAuthenticated || !user) {
      return;
    }

    upsertCurrentUser({
      email: user.email ?? undefined,
      image: user.photoURL ?? undefined,
      name: user.displayName ?? undefined,
      uid: user.uid,
    }).catch((error) => {
      console.error('Failed to sync signed-in user to Convex:', error);
    });
  }, [isAuthenticated, isLoading, upsertCurrentUser, user]);

  return null;
}

export function ConvexAppProvider({ children }: { children: ReactNode }) {
  if (!convexClient || !isConvexConfigured) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useFirebaseConvexAuth}>
      <ConvexProfileSync />
      {children}
    </ConvexProviderWithAuth>
  );
}
