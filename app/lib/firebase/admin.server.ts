import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { normalizeServerEnvValue } from '~/lib/server-env';

type FirebaseAdminEnv = Record<string, string | undefined>;

const FIREBASE_ADMIN_PROJECT_ID = 'FIREBASE_ADMIN_PROJECT_ID';
const FIREBASE_ADMIN_CLIENT_EMAIL = 'FIREBASE_ADMIN_CLIENT_EMAIL';
const FIREBASE_ADMIN_PRIVATE_KEY = 'FIREBASE_ADMIN_PRIVATE_KEY';

let cachedApp: App | null = null;
let cachedFirestore: Firestore | null = null;

function getRequiredEnvValue(serverEnv: FirebaseAdminEnv, key: string) {
  const value = normalizeServerEnvValue(serverEnv[key]) ?? normalizeServerEnvValue(process.env[key]);

  if (!value) {
    throw new Error(`Missing required Firebase Admin environment variable: ${key}`);
  }

  return value;
}

export function getFirebaseAdminApp(serverEnv: FirebaseAdminEnv): App {
  if (cachedApp) {
    return cachedApp;
  }

  const projectId = getRequiredEnvValue(serverEnv, FIREBASE_ADMIN_PROJECT_ID);
  const clientEmail = getRequiredEnvValue(serverEnv, FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = getRequiredEnvValue(serverEnv, FIREBASE_ADMIN_PRIVATE_KEY).replace(/\\n/g, '\n');

  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  cachedApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
  });

  return cachedApp;
}

export function getFirebaseFirestore(serverEnv: FirebaseAdminEnv): Firestore {
  if (cachedFirestore) {
    return cachedFirestore;
  }

  cachedFirestore = getFirestore(getFirebaseAdminApp(serverEnv));
  return cachedFirestore;
}

