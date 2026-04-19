import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';
import type { IProviderSetting } from '~/types/model';

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export const isConvexConfigured = Boolean(convexUrl);

interface LlmPreferencesPayload {
  providerSettings?: Record<string, IProviderSetting>;
  selectedProvider?: string;
  selectedModel?: string;
}

interface ConvexUserRecord {
  email?: string;
  image?: string;
  llmPreferences?: LlmPreferencesPayload;
  name?: string;
  uid?: string;
}

interface ConvexUserPreferencesContextValue {
  currentUserRecord?: ConvexUserRecord | null;
  isSyncAvailable: boolean;
  saveLlmPreferences: (payload: LlmPreferencesPayload) => Promise<void>;
}

const fallbackConvexUserPreferencesContextValue: ConvexUserPreferencesContextValue = {
  currentUserRecord: undefined,
  isSyncAvailable: false,
  saveLlmPreferences: async () => {},
};

const ConvexUserPreferencesContext = createContext<ConvexUserPreferencesContextValue>(
  fallbackConvexUserPreferencesContextValue,
);

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

function ConvexUserPreferencesProvider({ children }: { children: ReactNode }) {
  const currentUserRecord = useQuery(api.users.current, {}) as ConvexUserRecord | null | undefined;
  const upsertCurrentUserLlmPreferences = useMutation(api.users.upsertCurrentUserLlmPreferences);

  const saveLlmPreferences = useCallback(
    async (payload: LlmPreferencesPayload) => {
      await upsertCurrentUserLlmPreferences(payload);
    },
    [upsertCurrentUserLlmPreferences],
  );

  const value = useMemo<ConvexUserPreferencesContextValue>(
    () => ({
      currentUserRecord,
      isSyncAvailable: true,
      saveLlmPreferences,
    }),
    [currentUserRecord, saveLlmPreferences],
  );

  return <ConvexUserPreferencesContext.Provider value={value}>{children}</ConvexUserPreferencesContext.Provider>;
}

export function useConvexUserPreferences() {
  return useContext(ConvexUserPreferencesContext);
}

export function ConvexAppProvider({ children }: { children: ReactNode }) {
  if (!convexClient || !isConvexConfigured) {
    return (
      <ConvexUserPreferencesContext.Provider value={fallbackConvexUserPreferencesContextValue}>
        {children}
      </ConvexUserPreferencesContext.Provider>
    );
  }

  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useFirebaseConvexAuth}>
      <ConvexProfileSync />
      <ConvexUserPreferencesProvider>{children}</ConvexUserPreferencesProvider>
    </ConvexProviderWithAuth>
  );
}
