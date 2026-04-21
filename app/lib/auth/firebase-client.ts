import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, inMemoryPersistence, setPersistence, type Auth } from 'firebase/auth';

function readEnvValue(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

const firebaseConfig = {
  apiKey: readEnvValue(import.meta.env.VITE_FIREBASE_API_KEY),
  appId: readEnvValue(import.meta.env.VITE_FIREBASE_APP_ID),
  authDomain: readEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
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

export async function waitForFirebaseAuthReady() {
  const auth = getFirebaseAuthInstance();

  if (!auth) {
    return;
  }

  if (!persistenceSetupPromise) {
    persistenceSetupPromise = setPersistence(auth, inMemoryPersistence);
  }

  await persistenceSetupPromise;
}

