import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence } from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config';

const firebaseApp = isFirebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const googleAuthProvider = firebaseApp ? new GoogleAuthProvider() : null;

let persistenceReady = false;

export async function ensureFirebaseAuthPersistence() {
  if (!firebaseAuth || persistenceReady) {
    return;
  }

  await setPersistence(firebaseAuth, browserLocalPersistence);
  persistenceReady = true;
}
