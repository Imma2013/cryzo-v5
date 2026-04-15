import type { AuthConfig } from 'convex/server';

const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;

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
