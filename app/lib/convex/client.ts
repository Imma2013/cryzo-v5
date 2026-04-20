import { ConvexReactClient } from 'convex/react';

const rawConvexUrl = import.meta.env.VITE_CONVEX_URL;
const normalizedConvexUrl = typeof rawConvexUrl === 'string' && rawConvexUrl.trim() ? rawConvexUrl.trim() : undefined;

export const convexUrl = normalizedConvexUrl;
export const isConvexConfigured = Boolean(convexUrl);
export const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;
