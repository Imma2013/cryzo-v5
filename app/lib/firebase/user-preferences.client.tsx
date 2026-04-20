import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFirebaseAuth } from '~/lib/auth/firebase-auth';
import { isFirebaseConfigured } from '~/lib/firebase/config';
import type { IProviderSetting } from '~/types/model';

export const isFirebaseSyncConfigured = isFirebaseConfigured;

interface LlmPreferencesPayload {
  providerSettings?: Record<string, IProviderSetting>;
  selectedProvider?: string;
  selectedModel?: string;
}

interface FirebaseUserRecord {
  email?: string;
  image?: string;
  llmPreferences?: LlmPreferencesPayload;
  name?: string;
  uid?: string;
}

interface FirebaseUserPreferencesContextValue {
  currentUserRecord?: FirebaseUserRecord | null;
  isSyncAvailable: boolean;
  saveLlmPreferences: (payload: LlmPreferencesPayload) => Promise<void>;
}

const fallbackFirebaseUserPreferencesContextValue: FirebaseUserPreferencesContextValue = {
  currentUserRecord: undefined,
  isSyncAvailable: false,
  saveLlmPreferences: async () => {},
};

const FirebaseUserPreferencesContext = createContext<FirebaseUserPreferencesContextValue>(
  fallbackFirebaseUserPreferencesContextValue,
);

function FirebaseUserPreferencesProvider({ children }: { children: ReactNode }) {
  const { getAccessToken, isLoading, user } = useFirebaseAuth();
  const [currentUserRecord, setCurrentUserRecord] = useState<FirebaseUserRecord | null | undefined>(undefined);

  const saveLlmPreferences = useCallback(
    async (payload: LlmPreferencesPayload) => {
      const token = await getAccessToken();

      if (!token) {
        throw new Error('Sign in before saving model preferences.');
      }

      const response = await fetch('/api/user-preferences', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llmPreferences: payload,
          profile: {
            uid: user?.uid,
            email: user?.email ?? undefined,
            image: user?.photoURL ?? undefined,
            name: user?.displayName ?? undefined,
          },
        }),
      });

      const result = (await response.json()) as { message?: string; user?: FirebaseUserRecord };

      if (!response.ok) {
        throw new Error(result.message || 'Failed to save preferences.');
      }

      setCurrentUserRecord(result.user ?? null);
    },
    [getAccessToken, user],
  );

  useEffect(() => {
    let cancelled = false;

    if (isLoading) {
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setCurrentUserRecord(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const token = await getAccessToken();

        if (!token) {
          if (!cancelled) {
            setCurrentUserRecord(null);
          }
          return;
        }

        const response = await fetch('/api/user-preferences', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = (await response.json()) as { message?: string; user?: FirebaseUserRecord };

        if (!response.ok) {
          throw new Error(result.message || 'Failed to load user preferences.');
        }

        if (!cancelled) {
          setCurrentUserRecord(result.user ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load Firebase user preferences:', error);
          setCurrentUserRecord(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isLoading, user]);

  const value = useMemo<FirebaseUserPreferencesContextValue>(
    () => ({
      currentUserRecord,
      isSyncAvailable: isFirebaseConfigured,
      saveLlmPreferences,
    }),
    [currentUserRecord, saveLlmPreferences],
  );

  return <FirebaseUserPreferencesContext.Provider value={value}>{children}</FirebaseUserPreferencesContext.Provider>;
}

export function useFirebaseUserPreferences() {
  return useContext(FirebaseUserPreferencesContext);
}

export function FirebaseAppProvider({ children }: { children: ReactNode }) {
  return <FirebaseUserPreferencesProvider>{children}</FirebaseUserPreferencesProvider>;
}
