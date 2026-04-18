import type { AuthConfig } from 'convex/server';

const processEnv: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env;
const firebaseProjectId = processEnv.VITE_FIREBASE_PROJECT_ID ?? processEnv.FIREBASE_PROJECT_ID;

export default {
  providers: firebaseProjectId
    ? [
        {
          applicationID: firebaseProjectId,
          domain: `https://securetoken.google.com/${firebaseProjectId}`,
        },
      ]
    : [],
} satisfies AuthConfig;
