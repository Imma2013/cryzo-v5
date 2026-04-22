import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getFirebaseAuthInstance,
  getFirebaseGoogleProvider,
  isFirebaseConfigured,
  waitForFirebaseAuthReady as waitForFirebaseAuthClientReady,
} from './firebase-client';
import { getFirebaseAuthErrorMessage } from './firebase-errors';

export interface AuthUser {
  displayName?: string;
  email?: string;
  photoURL?: string;
  uid: string;
}

export async function waitForFirebaseAuthReady() {
  return await waitForFirebaseAuthClientReady();
}

let currentAccessToken: string | null = null;

export function getCurrentAuthAccessToken() {
  return currentAccessToken;
}

interface FirebaseAuthContextValue {
  error: string | null;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  isConfigured: boolean;
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
  isConfigured: isFirebaseConfigured,
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
        await waitForFirebaseAuthClientReady();
        const auth = getFirebaseAuthInstance();

        if (!auth) {
          if (!cancelled) {
            currentAccessToken = null;
            setAuthToken(null);
            setError(null);
            setUser(null);
            setIsAuthStateLoading(false);
          }
          return;
        }

        try {
          await getRedirectResult(auth);
        } catch (redirectError) {
          if (!cancelled) {
            setError(normalizeAuthError(redirectError));
          }
        }

        unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
          if (!nextUser) {
            if (!cancelled) {
              currentAccessToken = null;
              setAuthToken(null);
              setUser(null);
              setIsAuthStateLoading(false);
            }
            return;
          }

          try {
            const nextToken = await nextUser.getIdToken();

            if (!cancelled) {
              currentAccessToken = nextToken;
              setAuthToken(nextToken);
              setError(null);
              setUser({
                displayName: nextUser.displayName ?? undefined,
                email: nextUser.email ?? undefined,
                photoURL: nextUser.photoURL ?? undefined,
                uid: nextUser.uid,
              });
            }
          } catch (tokenError) {
            if (!cancelled) {
              currentAccessToken = null;
              setAuthToken(null);
              setError(normalizeAuthError(tokenError));
              setUser(null);
            }
          } finally {
            if (!cancelled) {
              setIsAuthStateLoading(false);
            }
          }
        });
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
      await waitForFirebaseAuthClientReady();

      const auth = getFirebaseAuthInstance();

      if (!auth) {
        throw new Error('Firebase auth is not configured.');
      }

      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      setError(null);
      const normalizedEmail = email.trim().toLowerCase();
      await waitForFirebaseAuthClientReady();

      const auth = getFirebaseAuthInstance();

      if (!auth) {
        throw new Error('Firebase auth is not configured.');
      }

      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const trimmedName = name.trim();

      if (trimmedName) {
        await updateProfile(credential.user, { displayName: trimmedName });
      }

      await credential.user.getIdToken(true);
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    await waitForFirebaseAuthClientReady();

    const auth = getFirebaseAuthInstance();

    if (!auth) {
      throw new Error('Firebase auth is not configured.');
    }

    await signInWithRedirect(auth, getFirebaseGoogleProvider());
  }, []);

  const signOutUser = useCallback(async () => {
    setError(null);
    const auth = getFirebaseAuthInstance();

    if (!auth) {
      currentAccessToken = null;
      setAuthToken(null);
      setUser(null);
      return;
    }

    await signOut(auth);
  }, []);

  const getAccessToken = useCallback(
    async (forceRefresh?: boolean) => {
      if (!isFirebaseConfigured) {
        currentAccessToken = null;
        return null;
      }

      await waitForFirebaseAuthClientReady();
      const auth = getFirebaseAuthInstance();
      const authUser = auth?.currentUser;

      if (!authUser) {
        currentAccessToken = null;
        return null;
      }

      const token = await authUser.getIdToken(Boolean(forceRefresh));
      currentAccessToken = token;
      setAuthToken(token);
      return token;
    },
    [setAuthToken],
  );

  const value = useMemo<FirebaseAuthContextValue>(
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
      signInWithGoogle: async () => {
        try {
          await signInWithGoogle();
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

  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  if (!isFirebaseConfigured) {
    return <FirebaseAuthContext.Provider value={fallbackFirebaseAuthContextValue}>{children}</FirebaseAuthContext.Provider>;
  }

  return <FirebaseAuthProviderConfigured>{children}</FirebaseAuthProviderConfigured>;
}

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  return context ?? fallbackFirebaseAuthContextValue;
}
