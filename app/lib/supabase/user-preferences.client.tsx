import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSupabaseAuth } from '~/lib/auth/supabase-auth';
import { isSupabaseConfigured } from '~/lib/auth/supabase-client';
import type { IProviderSetting } from '~/types/model';

export const isSupabaseSyncConfigured = isSupabaseConfigured;

interface LlmPreferencesPayload {
  providerSettings?: Record<string, IProviderSetting>;
  selectedProvider?: string;
  selectedModel?: string;
}

interface SupabaseUserRecord {
  email?: string;
  image?: string;
  llmPreferences?: LlmPreferencesPayload;
  name?: string;
  uid?: string;
}

interface SupabaseUserPreferencesContextValue {
  currentUserRecord?: SupabaseUserRecord | null;
  isSyncAvailable: boolean;
  saveLlmPreferences: (payload: LlmPreferencesPayload) => Promise<void>;
}

const fallbackSupabaseUserPreferencesContextValue: SupabaseUserPreferencesContextValue = {
  currentUserRecord: undefined,
  isSyncAvailable: false,
  saveLlmPreferences: async () => {},
};

const SupabaseUserPreferencesContext = createContext<SupabaseUserPreferencesContextValue>(
  fallbackSupabaseUserPreferencesContextValue,
);

function SupabaseUserPreferencesProvider({ children }: { children: ReactNode }) {
  const { isLoading, user } = useSupabaseAuth();
  const [currentUserRecord, setCurrentUserRecord] = useState<SupabaseUserRecord | null | undefined>(undefined);

  const saveLlmPreferences = useCallback(
    async (payload: LlmPreferencesPayload) => {
      const response = await fetch('/api/user-preferences', {
        method: 'PATCH',
        headers: {
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

      const result = (await response.json()) as { message?: string; user?: SupabaseUserRecord };

      if (response.status === 401) {
        setCurrentUserRecord(null);
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || 'Failed to save preferences.');
      }

      setCurrentUserRecord(result.user ?? null);
    },
    [user],
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
        const response = await fetch('/api/user-preferences', {
          method: 'GET',
        });

        const result = (await response.json()) as { message?: string; user?: SupabaseUserRecord };

        if (response.status === 401) {
          if (!cancelled) {
            setCurrentUserRecord(null);
          }
          return;
        }

        if (!response.ok) {
          throw new Error(result.message || 'Failed to load user preferences.');
        }

        if (!cancelled) {
          setCurrentUserRecord(result.user ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load user preferences:', error);
          setCurrentUserRecord(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, user]);

  const value = useMemo<SupabaseUserPreferencesContextValue>(
    () => ({
      currentUserRecord,
      isSyncAvailable: isSupabaseSyncConfigured,
      saveLlmPreferences,
    }),
    [currentUserRecord, saveLlmPreferences],
  );

  return <SupabaseUserPreferencesContext.Provider value={value}>{children}</SupabaseUserPreferencesContext.Provider>;
}

export function useSupabaseUserPreferences() {
  return useContext(SupabaseUserPreferencesContext);
}

export function SupabaseAppProvider({ children }: { children: ReactNode }) {
  return <SupabaseUserPreferencesProvider>{children}</SupabaseUserPreferencesProvider>;
}
