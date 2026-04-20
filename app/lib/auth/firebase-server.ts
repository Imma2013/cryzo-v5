import type { JWTPayload } from 'jose';
import { createConvexServerClient } from '~/lib/convex/server';
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

export async function verifyFirebaseIdToken(token: string, serverEnv?: ServerEnv): Promise<VerifiedFirebaseAuth> {
  const convexClient = createConvexServerClient(serverEnv);
  convexClient.setAuth(token);
  const identity = await convexClient.query('users:getViewerIdentity' as any, {});
  const uid = identity?.uid;

  if (!uid) {
    throw new Error('Invalid authentication token.');
  }

  return {
    claims: {
      email: identity.email,
      name: identity.name,
      picture: identity.image,
      sub: uid,
    },
    email: identity.email,
    image: identity.image,
    name: identity.name,
    uid,
  };
}
