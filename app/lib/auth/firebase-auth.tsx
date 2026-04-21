import { useAuthActions, useAuthToken } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { convexClient } from '~/lib/convex/client';
import { isConvexConfigured } from '~/lib/convex/client';
import { getFirebaseAuthErrorMessage } from './firebase-errors';

export type GoogleSignInMethod = 'popup';
export const SESSION_BOOTSTRAP_TIMEOUT_MESSAGE = 'Session check took too long.';

export interface AuthUser {
  displayName?: string;
  email?: string;
  photoURL?: string;
  uid: string;
}

export async function waitForFirebaseAuthReady() {
  return null;
}

let currentAccessToken: string | null = null;

export function getCurrentAuthAccessToken() {
  return currentAccessToken;
}

interface FirebaseAuthContextValue {
  error: string | null;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  googleSignInMethod: GoogleSignInMethod;
  hostSupportMessage: string | null;
  isConfigured: boolean;
  isHostSupported: boolean;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  user: AuthUser | null;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

const fallbackFirebaseAuthContextValue: FirebaseAuthContextValue = {
  error: null,
  getAccessToken: async () => null,
  googleSignInMethod: 'popup',
  hostSupportMessage: null,
  isConfigured: isConvexConfigured,
  isHostSupported: true,
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
  return getFirebaseAuthErrorMessage(error);
}

function FirebaseAuthProviderConfigured({ children }: { children: ReactNode }) {
  const { signIn, signOut } = useAuthActions();
  const authToken = useAuthToken();
  const { isLoading: isConvexAuthLoading } = useConvexAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    currentAccessToken = authToken;
  }, [authToken]);

  useEffect(() => {
    let cancelled = false;

    if (!authToken) {
      setUser(null);
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
            setUser(null);
          }

          return;
        }

        if (!response.ok || !payload.user?.uid) {
          throw new Error(payload.message || 'Failed to load account profile.');
        }

        if (!cancelled) {
          setError(null);
          setUser({
            displayName: payload.user.name,
            email: payload.user.email,
            photoURL: payload.user.image,
            uid: payload.user.uid,
          });
        }
      } catch (profileError) {
        if (!cancelled) {
          setError(normalizeAuthError(profileError));
          setUser(null);
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
      await signIn('password', {
        email: email.trim(),
        flow: 'signIn',
        password,
      } as any);
    },
    [signIn],
  );

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      setError(null);
      const normalizedEmail = email.trim().toLowerCase();

      if (convexClient) {
        const exists = await convexClient.query('users:doesPasswordAccountExist' as any, {
          email: normalizedEmail,
        });

        if (exists) {
          throw new Error('An account with this email already exists. Sign in instead.');
        }
      }

      await signIn('password', {
        email: normalizedEmail,
        flow: 'signUp',
        name: name.trim(),
        password,
      } as any);
    },
    [signIn],
  );

  const signOutUser = useCallback(async () => {
    setError(null);
    await signOut();
  }, [signOut]);

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({
      error,
      getAccessToken: async () => authToken ?? null,
      googleSignInMethod: 'popup',
      hostSupportMessage: null,
      isConfigured: true,
      isHostSupported: true,
      isLoading: isConvexAuthLoading || (Boolean(authToken) && isProfileLoading),
      signInWithEmail: async (email, password) => {
        try {
          await signInWithEmail(email, password);
        } catch (authError) {
          const message = normalizeAuthError(authError);
          setError(message);
          throw new Error(message);
        }
      },
      signInWithGoogle: async () => {
        const message = 'Google sign-in is disabled. Use email and password.';
        setError(message);
        throw new Error(message);
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
    [authToken, error, isConvexAuthLoading, isProfileLoading, signInWithEmail, signOutUser, signUpWithEmail, user],
  );

  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  if (!isConvexConfigured) {
    return <FirebaseAuthContext.Provider value={fallbackFirebaseAuthContextValue}>{children}</FirebaseAuthContext.Provider>;
  }

  return <FirebaseAuthProviderConfigured>{children}</FirebaseAuthProviderConfigured>;
}

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  return context ?? fallbackFirebaseAuthContextValue;
}
