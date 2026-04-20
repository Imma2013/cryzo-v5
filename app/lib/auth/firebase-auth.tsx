import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { ensureFirebaseAuthPersistence, firebaseAuth, googleAuthProvider } from '~/lib/firebase/client';
import { isFirebaseConfigured } from '~/lib/firebase/config';
import { getFirebaseAuthErrorMessage } from './firebase-errors';
import {
  getCurrentHostname,
  getGoogleSignInMethod,
  shouldFallbackToRedirectFromPopupError,
  type GoogleSignInMethod,
} from './google-auth-flow';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('firebase-auth');
const SESSION_BOOTSTRAP_TIMEOUT_MS = 15000;
const GOOGLE_REDIRECT_PENDING_STORAGE_KEY = 'cryzo.firebase.googleRedirectPending';
export const SESSION_BOOTSTRAP_TIMEOUT_MESSAGE =
  'Session check took too long. You can keep using the app or retry sign-in if your account does not appear.';

function setGoogleRedirectPendingFlag() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_STORAGE_KEY, '1');
  } catch {
    // Ignore browser storage restrictions and continue with sign-in.
  }
}

function consumeGoogleRedirectPendingFlag() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }

  try {
    const isPending = window.sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_STORAGE_KEY) === '1';

    if (isPending) {
      window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_STORAGE_KEY);
    }

    return isPending;
  } catch {
    return false;
  }
}

function clearGoogleRedirectPendingFlag() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_STORAGE_KEY);
  } catch {
    // Ignore browser storage restrictions and continue with sign-in.
  }
}

export async function waitForFirebaseAuthReady(auth: Auth) {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
    return auth.currentUser;
  }

  await new Promise<void>((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      () => {
        unsubscribe();
        resolve();
      },
      reject,
    );
  });

  return auth.currentUser;
}

async function withFirebaseBootstrapTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(SESSION_BOOTSTRAP_TIMEOUT_MESSAGE)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

interface FirebaseAuthContextValue {
  error: string | null;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  googleSignInMethod: GoogleSignInMethod;
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
  googleSignInMethod: 'popup',
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
  const googleSignInMethod = getGoogleSignInMethod(getCurrentHostname());

  useEffect(() => {
    if (!firebaseAuth || !isFirebaseConfigured) {
      setIsLoading(false);

      return undefined;
    }

    let isMounted = true;
    let bootstrapSettled = false;

    const settleBootstrap = (reason: string) => {
      if (!isMounted || bootstrapSettled) {
        return;
      }

      bootstrapSettled = true;
      logger.info(`Firebase auth bootstrap settled: ${reason}`);
      setIsLoading(false);
    };

    logger.info('Firebase auth bootstrap started');

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      if (!isMounted) {
        return;
      }

      logger.info(`Firebase auth state changed: ${nextUser ? 'signed-in' : 'signed-out'}`);
      setUser(nextUser);
      setError(null);
    });

    (async () => {
      try {
        logger.info('Ensuring Firebase auth persistence');
        await ensureFirebaseAuthPersistence();
        logger.info('Firebase auth persistence ready');

        const shouldResolveRedirectResult = consumeGoogleRedirectPendingFlag() || googleSignInMethod === 'redirect';

        if (shouldResolveRedirectResult) {
          logger.info('Resolving Firebase redirect result');
          await getRedirectResult(firebaseAuth);
        }

        logger.info('Waiting for Firebase auth state readiness');
        const nextUser = await withFirebaseBootstrapTimeout(waitForFirebaseAuthReady(firebaseAuth), SESSION_BOOTSTRAP_TIMEOUT_MS);

        if (!isMounted) {
          return;
        }

        logger.info(`Firebase auth ready with ${nextUser ? 'signed-in' : 'signed-out'} user`);
        setUser(nextUser);
        setError(null);
        settleBootstrap('auth-state-ready');
      } catch (authError) {
        if (!isMounted) {
          return;
        }

        const message = getFirebaseAuthErrorMessage(authError);
        logger.error('Firebase auth bootstrap failed', authError);
        setUser(firebaseAuth.currentUser);
        setError(message);
        settleBootstrap(message === SESSION_BOOTSTRAP_TIMEOUT_MESSAGE ? 'timeout' : 'bootstrap-error');
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [googleSignInMethod]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseAuth || !googleAuthProvider) {
      throw new Error('Firebase Auth is not configured.');
    }

    setError(null);
    await ensureFirebaseAuthPersistence();

    if (googleSignInMethod === 'redirect') {
      setGoogleRedirectPendingFlag();

      try {
        await signInWithRedirect(firebaseAuth, googleAuthProvider);
      } catch (redirectError) {
        clearGoogleRedirectPendingFlag();
        throw redirectError;
      }

      return;
    }

    try {
      await signInWithPopup(firebaseAuth, googleAuthProvider);
      return;
    } catch (popupError) {
      if (!shouldFallbackToRedirectFromPopupError(popupError)) {
        throw popupError;
      }

      logger.warn('Google popup sign-in failed, falling back to redirect', popupError);
      setGoogleRedirectPendingFlag();
      await signInWithRedirect(firebaseAuth, googleAuthProvider);
    }
  }, [googleSignInMethod]);

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
        logger.info('Firebase access token requested without a signed-in user');
        return null;
      }

      logger.info(`Firebase access token requested for ${user.uid} (forceRefresh=${forceRefresh ? 'yes' : 'no'})`);
      return user.getIdToken(forceRefresh);
    },
    [user],
  );

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({
      error,
      getAccessToken,
      googleSignInMethod,
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
    [error, getAccessToken, googleSignInMethod, isLoading, signInWithEmail, signInWithGoogle, signOutUser, signUpWithEmail, user],
  );

  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  return context ?? fallbackFirebaseAuthContextValue;
}
