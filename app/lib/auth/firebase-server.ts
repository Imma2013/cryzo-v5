import type { JWTPayload } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { ServerEnv } from '~/lib/server-env';

export type VerifiedFirebaseAuth = {
  claims: JWTPayload;
  email?: string;
  image?: string;
  name?: string;
  uid: string;
};

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

const firebaseJwksByProject = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getFirebaseProjectId(serverEnv?: ServerEnv) {
  const candidates = [serverEnv?.FIREBASE_PROJECT_ID, serverEnv?.VITE_FIREBASE_PROJECT_ID];

  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';

    if (value) {
      return value;
    }
  }

  throw new Error('Missing FIREBASE_PROJECT_ID on the server.');
}

function getFirebaseJwks(projectId: string) {
  const existing = firebaseJwksByProject.get(projectId);

  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  );
  firebaseJwksByProject.set(projectId, jwks);
  return jwks;
}

export async function verifyFirebaseIdToken(token: string, serverEnv?: ServerEnv): Promise<VerifiedFirebaseAuth> {
  const projectId = getFirebaseProjectId(serverEnv);
  const issuer = `https://securetoken.google.com/${projectId}`;
  const audience = projectId;
  const { payload } = await jwtVerify(token, getFirebaseJwks(projectId), {
    audience,
    issuer,
  });
  const uid = typeof payload.sub === 'string' ? payload.sub : undefined;

  if (!uid) {
    throw new Error('Invalid authentication token.');
  }

  return {
    claims: payload,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    image: typeof payload.picture === 'string' ? payload.picture : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    uid,
  };
}
