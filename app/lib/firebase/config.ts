const FIREBASE_HOSTED_DOMAIN_SUFFIX = '.firebaseapp.com';
const VERCEL_DOMAIN_SUFFIX = '.vercel.app';

export function normalizeFirebaseAuthDomain(
  authDomain: string | null | undefined,
  projectId: string | null | undefined,
): { authDomain: string; fallbackApplied: boolean } {
  const trimmedAuthDomain = authDomain?.trim() ?? '';
  const trimmedProjectId = projectId?.trim().toLowerCase() ?? '';

  if (!trimmedAuthDomain) {
    return { authDomain: '', fallbackApplied: false };
  }

  const normalizedAuthDomain = trimmedAuthDomain.toLowerCase();

  if (normalizedAuthDomain.endsWith(VERCEL_DOMAIN_SUFFIX) && trimmedProjectId) {
    return {
      authDomain: `${trimmedProjectId}${FIREBASE_HOSTED_DOMAIN_SUFFIX}`,
      fallbackApplied: true,
    };
  }

  return { authDomain: trimmedAuthDomain, fallbackApplied: false };
}

let warnedAboutFirebaseAuthDomainFallback = false;
const rawProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '';
const normalizedAuthDomain = normalizeFirebaseAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, rawProjectId);

if (normalizedAuthDomain.fallbackApplied && !warnedAboutFirebaseAuthDomainFallback) {
  warnedAboutFirebaseAuthDomainFallback = true;
  console.warn(
    '[firebase] VITE_FIREBASE_AUTH_DOMAIN was a Vercel hostname. Falling back to Firebase hosted auth domain.',
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: normalizedAuthDomain.authDomain,
  projectId: rawProjectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export { firebaseConfig };
