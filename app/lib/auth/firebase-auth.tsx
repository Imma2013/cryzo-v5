import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { ensureFirebaseAuthPersistence, firebaseAuth, googleAuthProvider } from '~/lib/firebase/client';
import { isFirebaseConfigured } from '~/lib/firebase/config';
import { getFirebaseAuthErrorMessage } from './firebase-errors';

interface FirebaseAuthContextValue {
  error: string | null;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  isConfigured: boolean;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  user: User | null;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

const unconfiguredAuthAction = async () => {
  throw new Error('FirebaseAuthProvider is not mounted yet.');
};

const fallbackFirebaseAuthContextValue: FirebaseAuthContextValue = {
  error: null,
  getAccessToken: async () => null,
  isConfigured: isFirebaseConfigured,
  isLoading: false,
  signInWithEmail: unconfiguredAuthAction,
  signInWithGoogle: unconfiguredAuthAction,
  signOutUser: async () => undefined,
  signUpWithEmail: unconfiguredAuthAction,
  user: null,
};

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseAuth || !isFirebaseConfigured) {
      setIsLoading(false);

      return undefined;
    }

    let isMounted = true;

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (!isMounted) {
        return;
      }

      setUser(nextUser);
      setIsLoading(false);
    });

    ensureFirebaseAuthPersistence().catch((authError) => {
      if (isMounted) {
        setError(getFirebaseAuthErrorMessage(authError));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseAuth || !googleAuthProvider) {
      throw new Error('Firebase Auth is not configured.');
    }

    setError(null);
    await ensureFirebaseAuthPersistence();
    await signInWithPopup(firebaseAuth, googleAuthProvider);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) {
      throw new Error('Firebase Auth is not configured.');
    }

    setError(null);
    await ensureFirebaseAuthPersistence();
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (name: string, email: string, password: string) => {
    if (!firebaseAuth) {
      throw new Error('Firebase Auth is not configured.');
    }

    setError(null);
    await ensureFirebaseAuthPersistence();

    const credentials = await createUserWithEmailAndPassword(firebaseAuth, email, password);

    if (name.trim()) {
      await updateProfile(credentials.user, { displayName: name.trim() });
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!firebaseAuth) {
      return;
    }

    setError(null);
    await signOut(firebaseAuth);
  }, []);

  const getAccessToken = useCallback(
    async (forceRefresh = false) => {
      if (!user) {
        return null;
      }

      return user.getIdToken(forceRefresh);
    },
    [user],
  );

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({
      error,
      getAccessToken,
      isConfigured: isFirebaseConfigured,
      isLoading,
      signInWithEmail: async (email, password) => {
        try {
          await signInWithEmail(email, password);
        } catch (authError) {
          const message = getFirebaseAuthErrorMessage(authError);
          setError(message);
          throw new Error(message);
        }
      },
      signInWithGoogle: async () => {
        try {
          await signInWithGoogle();
        } catch (authError) {
          const message = getFirebaseAuthErrorMessage(authError);
          setError(message);
          throw new Error(message);
        }
      },
      signOutUser: async () => {
        try {
          await signOutUser();
        } catch (authError) {
          const message = getFirebaseAuthErrorMessage(authError);
          setError(message);
          throw new Error(message);
        }
      },
      signUpWithEmail: async (name, email, password) => {
        try {
          await signUpWithEmail(name, email, password);
        } catch (authError) {
          const message = getFirebaseAuthErrorMessage(authError);
          setError(message);
          throw new Error(message);
        }
      },
      user,
    }),
    [error, getAccessToken, isLoading, signInWithEmail, signInWithGoogle, signOutUser, signUpWithEmail, user],
  );

  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  return context ?? fallbackFirebaseAuthContextValue;
}
