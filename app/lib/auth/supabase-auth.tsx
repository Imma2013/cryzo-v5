import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getSupabaseAuthClient,
  getSupabaseGoogleProvider,
  isSupabaseConfigured,
  waitForSupabaseAuthReady as waitForAuthClientReady,
} from './supabase-client';
import { getSupabaseAuthErrorMessage } from './supabase-errors';
import { buildGoogleAuthRedirectTo } from './redirect-path';

export interface AuthUser {
  displayName?: string;
  email?: string;
  photoURL?: string;
  uid: string;
}

export async function waitForSupabaseAuthReady() {
  return await waitForAuthClientReady();
}

let currentAccessToken: string | null = null;

export function getCurrentSupabaseAccessToken() {
  return currentAccessToken;
}

interface SupabaseAuthContextValue {
  error: string | null;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  isConfigured: boolean;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (nextPath?: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  user: AuthUser | null;
}

const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null);

const fallbackSupabaseAuthContextValue: SupabaseAuthContextValue = {
  error: null,
  getAccessToken: async () => null,
  isConfigured: isSupabaseConfigured,
  isLoading: false,
  signInWithEmail: async () => {
    throw new Error('Auth provider is not configured.');
  },
  signInWithGoogle: async () => {
    throw new Error('Google sign-in is disabled.');
  },
  signOutUser: async () => undefined,
  signUpWithEmail: async () => {
    throw new Error('Auth provider is not configured.');
  },
  user: null,
};

function normalizeAuthError(error: unknown) {
  return getSupabaseAuthErrorMessage(error);
}

function SupabaseAuthProviderConfigured({ children }: { children: ReactNode }) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthStateLoading, setIsAuthStateLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    (async () => {
      try {
        await waitForAuthClientReady();
        const supabase = getSupabaseAuthClient();

        if (!supabase) {
          if (!cancelled) {
            currentAccessToken = null;
            setAuthToken(null);
            setError(null);
            setUser(null);
            setIsAuthStateLoading(false);
          }
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!cancelled) {
          const initialUser = session?.user ?? null;
          const initialToken = session?.access_token ?? null;
          currentAccessToken = initialToken;
          setAuthToken(initialToken);
          setUser(
            initialUser
              ? {
                  displayName:
                    (initialUser.user_metadata?.full_name as string | undefined) ??
                    (initialUser.user_metadata?.name as string | undefined) ??
                    undefined,
                  email: initialUser.email ?? undefined,
                  photoURL:
                    (initialUser.user_metadata?.avatar_url as string | undefined) ??
                    (initialUser.user_metadata?.picture as string | undefined) ??
                    undefined,
                  uid: initialUser.id,
                }
              : null,
          );
          setIsAuthStateLoading(false);
        }

        const { data: authListener } = supabase.auth.onAuthStateChange((_event: unknown, nextSession: any) => {
          const nextUser = nextSession?.user ?? null;
          const nextToken = nextSession?.access_token ?? null;

          if (!nextUser) {
            if (!cancelled) {
              currentAccessToken = null;
              setAuthToken(null);
              setUser(null);
              setIsAuthStateLoading(false);
            }
            return;
          }

          if (!cancelled) {
            currentAccessToken = nextToken;
            setAuthToken(nextToken);
            setError(null);
            setUser({
              displayName:
                (nextUser.user_metadata?.full_name as string | undefined) ??
                (nextUser.user_metadata?.name as string | undefined) ??
                undefined,
              email: nextUser.email ?? undefined,
              photoURL:
                (nextUser.user_metadata?.avatar_url as string | undefined) ??
                (nextUser.user_metadata?.picture as string | undefined) ??
                undefined,
              uid: nextUser.id,
            });
            setIsAuthStateLoading(false);
          }
        });

        unsubscribe = () => authListener.subscription.unsubscribe();
      } catch (authBootstrapError) {
        if (!cancelled) {
          currentAccessToken = null;
          setAuthToken(null);
          setError(normalizeAuthError(authBootstrapError));
          setUser(null);
          setIsAuthStateLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!authToken) {
      setIsProfileLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsProfileLoading(true);

    (async () => {
      try {
        const response = await fetch('/api/user-preferences', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        const payload = (await response.json()) as {
          errorType?: string;
          message?: string;
          user?: {
            email?: string;
            image?: string;
            name?: string;
            uid?: string;
          };
        };

        if (response.status === 401 || payload.errorType === 'auth_required') {
          if (!cancelled) {
            setError(null);
          }

          return;
        }

        if (!response.ok) {
          throw new Error(payload.message || 'Failed to load account profile.');
        }

        if (!cancelled && payload.user?.uid) {
          setError(null);
          setUser((currentUser) => ({
            uid: payload.user?.uid ?? currentUser?.uid ?? '',
            displayName: payload.user?.name ?? currentUser?.displayName,
            email: payload.user?.email ?? currentUser?.email,
            photoURL: payload.user?.image ?? currentUser?.photoURL,
          }));
        }
      } catch (profileError) {
        if (!cancelled) {
          setError(normalizeAuthError(profileError));
        }
      } finally {
        if (!cancelled) {
          setIsProfileLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      await waitForAuthClientReady();

      const supabase = getSupabaseAuthClient();

      if (!supabase) {
        throw new Error('Supabase auth is not configured.');
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        throw error;
      }
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      setError(null);
      const normalizedEmail = email.trim().toLowerCase();
      await waitForAuthClientReady();

      const supabase = getSupabaseAuthClient();

      if (!supabase) {
        throw new Error('Supabase auth is not configured.');
      }

      const trimmedName = name.trim();
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: trimmedName ? { name: trimmedName } : undefined,
        },
      });

      if (error) {
        throw error;
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(async (nextPath?: string) => {
    setError(null);
    await waitForAuthClientReady();

    const supabase = getSupabaseAuthClient();

    if (!supabase) {
      throw new Error('Supabase auth is not configured.');
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: getSupabaseGoogleProvider(),
      options: {
        redirectTo: buildGoogleAuthRedirectTo(nextPath),
      },
    });

    if (error) {
      throw error;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setError(null);
    const supabase = getSupabaseAuthClient();

    if (!supabase) {
      currentAccessToken = null;
      setAuthToken(null);
      setUser(null);
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }
  }, []);

  const getAccessToken = useCallback(
    async (forceRefresh?: boolean) => {
      if (!isSupabaseConfigured) {
        currentAccessToken = null;
        return null;
      }

      await waitForAuthClientReady();
      const supabase = getSupabaseAuthClient();

      if (!supabase) {
        currentAccessToken = null;
        return null;
      }

      if (forceRefresh) {
        const { error } = await supabase.auth.refreshSession();

        if (error) {
          throw error;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      currentAccessToken = token;
      setAuthToken(token);
      return token;
    },
    [setAuthToken],
  );

  const value = useMemo<SupabaseAuthContextValue>(
    () => ({
      error,
      getAccessToken,
      isConfigured: true,
      isLoading: isAuthStateLoading || (Boolean(authToken) && isProfileLoading),
      signInWithEmail: async (email, password) => {
        try {
          await signInWithEmail(email, password);
        } catch (authError) {
          const message = normalizeAuthError(authError);
          setError(message);
          throw new Error(message);
        }
      },
      signInWithGoogle: async (nextPath?: string) => {
        try {
          await signInWithGoogle(nextPath);
        } catch (authError) {
          const message = normalizeAuthError(authError);
          setError(message);
          throw new Error(message);
        }
      },
      signOutUser: async () => {
        try {
          await signOutUser();
        } catch (authError) {
          const message = normalizeAuthError(authError);
          setError(message);
          throw new Error(message);
        }
      },
      signUpWithEmail: async (name, email, password) => {
        try {
          await signUpWithEmail(name, email, password);
        } catch (authError) {
          const message = normalizeAuthError(authError);
          setError(message);
          throw new Error(message);
        }
      },
      user,
    }),
    [authToken, error, getAccessToken, isAuthStateLoading, isProfileLoading, signInWithEmail, signInWithGoogle, signOutUser, signUpWithEmail, user],
  );

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return <SupabaseAuthContext.Provider value={fallbackSupabaseAuthContextValue}>{children}</SupabaseAuthContext.Provider>;
  }

  return <SupabaseAuthProviderConfigured>{children}</SupabaseAuthProviderConfigured>;
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext);
  return context ?? fallbackSupabaseAuthContextValue;
}
