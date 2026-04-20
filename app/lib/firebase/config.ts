const FIREBASE_PRODUCTION_AUTH_DOMAIN = 'cryzo-v5.vercel.app';

function getRuntimeFirebaseAuthDomain() {
  const configuredAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '';

  if (typeof window === 'undefined') {
    return configuredAuthDomain;
  }

  const hostname = window.location.hostname?.trim().toLowerCase();

  if (hostname === FIREBASE_PRODUCTION_AUTH_DOMAIN) {
    return hostname;
  }

  return configuredAuthDomain;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: getRuntimeFirebaseAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export { firebaseConfig };
