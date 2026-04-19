import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { ServerEnv } from '~/lib/server-env';

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const FIREBASE_JWKS = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));

type FirebaseTokenPayload = JWTPayload & {
  email?: string;
  user_id?: string;
};

export type VerifiedFirebaseAuth = {
  claims: FirebaseTokenPayload;
  email?: string;
  projectId: string;
  uid: string;
};

function getFirebaseProjectId(serverEnv?: ServerEnv) {
  return serverEnv?.FIREBASE_PROJECT_ID || serverEnv?.VITE_FIREBASE_PROJECT_ID;
}

export function getBearerTokenFromAuthorizationHeader(header: string | null) {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token.trim();
}

export async function verifyFirebaseIdToken(token: string, serverEnv?: ServerEnv): Promise<VerifiedFirebaseAuth> {
  const projectId = getFirebaseProjectId(serverEnv);

  if (!projectId) {
    throw new Error('Firebase project ID is missing on the server.');
  }

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });

  const claims = payload as FirebaseTokenPayload;
  const uid = claims.user_id || claims.sub;

  if (!uid) {
    throw new Error('Firebase token is missing uid/sub claim.');
  }

  return {
    claims,
    email: claims.email,
    projectId,
    uid,
  };
}
