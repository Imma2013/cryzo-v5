import { ConvexHttpClient } from 'convex/browser';
import type { ServerEnv } from '~/lib/server-env';

export function getConvexDeploymentUrl(serverEnv?: ServerEnv) {
  const value = serverEnv?.CONVEX_URL || serverEnv?.VITE_CONVEX_URL;
  const normalized = typeof value === 'string' ? value.trim() : '';

  return normalized.length > 0 ? normalized : undefined;
}

export function createConvexServerClient(serverEnv?: ServerEnv) {
  const convexUrl = getConvexDeploymentUrl(serverEnv);

  if (!convexUrl) {
    throw new Error('Missing CONVEX_URL or VITE_CONVEX_URL on the server.');
  }

  return new ConvexHttpClient(convexUrl);
}
