import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  setPersistence,
} from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config';

const firebaseApp = isFirebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;

function createFirebaseAuth() {
  if (!firebaseApp) {
    return null;
  }

  try {
    return initializeAuth(firebaseApp, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const firebaseAuth = createFirebaseAuth();
export const googleAuthProvider = firebaseApp ? new GoogleAuthProvider() : null;

let persistenceReady = false;

export async function ensureFirebaseAuthPersistence() {
  if (!firebaseAuth || persistenceReady) {
    return;
  }

  await setPersistence(firebaseAuth, browserLocalPersistence);
  persistenceReady = true;
}
