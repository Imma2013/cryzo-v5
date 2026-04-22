import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  type Auth,
  type Persistence,
} from 'firebase/auth';

function readEnvValue(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHostCandidate(value: string | undefined) {
  const trimmed = readEnvValue(value);

  if (!trimmed) {
    return undefined;
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  const host = withoutProtocol.split('/')[0]?.split(':')[0]?.trim().toLowerCase();
  return host && host.length > 0 ? host : undefined;
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isFirebaseHostedDomain(hostname: string) {
  return hostname.endsWith('.firebaseapp.com') || hostname.endsWith('.web.app');
}

function resolveFirebaseAuthDomain(configuredAuthDomain: string | undefined) {
  const normalizedConfiguredDomain = normalizeHostCandidate(configuredAuthDomain);

  if (typeof window === 'undefined') {
    return normalizedConfiguredDomain;
  }

  const currentHost = normalizeHostCandidate(window.location.hostname);

  if (!currentHost) {
    return normalizedConfiguredDomain;
  }

  if (!normalizedConfiguredDomain) {
    return currentHost;
  }

  // Keep localhost behavior stable in development while pinning production auth flows to the app domain.
  if (isFirebaseHostedDomain(normalizedConfiguredDomain) && !isLocalHost(currentHost)) {
    return currentHost;
  }

  return normalizedConfiguredDomain;
}

const resolvedAuthDomain = resolveFirebaseAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);

const firebaseConfig = {
  apiKey: readEnvValue(import.meta.env.VITE_FIREBASE_API_KEY),
  appId: readEnvValue(import.meta.env.VITE_FIREBASE_APP_ID),
  authDomain: resolvedAuthDomain,
  messagingSenderId: readEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  projectId: readEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.appId &&
    firebaseConfig.authDomain &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.projectId,
);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let persistenceSetupPromise: Promise<void> | null = null;
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account',
});

function getFirebaseAppInstance() {
  if (!isFirebaseConfigured) {
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig as Required<typeof firebaseConfig>);
  }

  return firebaseApp;
}

export function getFirebaseAuthInstance() {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const app = getFirebaseAppInstance();

  if (!app) {
    return null;
  }

  firebaseAuth = getAuth(app);
  return firebaseAuth;
}

export function getFirebaseGoogleProvider() {
  return googleProvider;
}

async function applyBestEffortPersistence(auth: Auth) {
  const persistenceModes: Persistence[] = [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence];
  let lastError: unknown = null;

  for (const mode of persistenceModes) {
    try {
      await setPersistence(auth, mode);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
}

export async function waitForFirebaseAuthReady() {
  const auth = getFirebaseAuthInstance();

  if (!auth) {
    return;
  }

  if (!persistenceSetupPromise) {
    persistenceSetupPromise = applyBestEffortPersistence(auth);
  }

  await persistenceSetupPromise;
}
