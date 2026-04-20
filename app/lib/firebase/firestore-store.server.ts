import type { Message } from 'ai';
import { createConvexServerClient } from '~/lib/convex/server';

type ServerEnv = Record<string, string | undefined>;

export interface FirestoreLlmPreferences {
  providerSettings?: Record<string, unknown>;
  selectedProvider?: string;
  selectedModel?: string;
}

export interface FirestoreUserRecord {
  email?: string;
  image?: string;
  llmPreferences?: FirestoreLlmPreferences;
  name?: string;
  uid: string;
}

export interface FirestoreChatMetadata {
  gitUrl?: string;
  gitBranch?: string;
  netlifySiteId?: string;
}

export interface FirestoreChatRecord {
  routeId: string;
  description?: string;
  messages: Message[];
  metadata?: FirestoreChatMetadata;
  snapshot?: unknown;
  timestamp: string;
  lastUpdatedAt: number;
}

function createAuthenticatedConvexClient(serverEnv: ServerEnv, authToken: string) {
  const client = createConvexServerClient(serverEnv as any);
  client.setAuth(authToken);
  return client;
}

export async function listCurrentUserChats(serverEnv: ServerEnv, authToken: string): Promise<FirestoreChatRecord[]> {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  return (await convex.query('chats:listCurrentUserChats' as any, {})) as FirestoreChatRecord[];
}

export async function getCurrentUserChatByRouteId(
  serverEnv: ServerEnv,
  authToken: string,
  routeId: string,
): Promise<FirestoreChatRecord | null> {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  return (await convex.query('chats:getCurrentUserChatByRouteId' as any, { routeId })) as FirestoreChatRecord | null;
}

export async function upsertCurrentUserChat(
  serverEnv: ServerEnv,
  authToken: string,
  payload: {
    routeId: string;
    description?: string;
    messagesJson: string;
    metadata?: FirestoreChatMetadata;
    snapshotJson?: string;
    timestamp: string;
  },
) {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  return (await convex.mutation('chats:upsertCurrentUserChat' as any, payload)) as FirestoreChatRecord;
}

export async function updateCurrentUserChatDescription(
  serverEnv: ServerEnv,
  authToken: string,
  routeId: string,
  description: string,
) {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  await convex.mutation('chats:updateCurrentUserChatDescription' as any, { routeId, description });
}

export async function deleteCurrentUserChat(serverEnv: ServerEnv, authToken: string, routeId: string) {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  await convex.mutation('chats:deleteCurrentUserChat' as any, { routeId });
}

export async function duplicateCurrentUserChat(serverEnv: ServerEnv, authToken: string, routeId: string, nextRouteId: string) {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  const result = (await convex.mutation('chats:duplicateCurrentUserChat' as any, { routeId, nextRouteId })) as {
    routeId: string;
  };
  return result.routeId;
}

export async function forkCurrentUserChat(
  serverEnv: ServerEnv,
  authToken: string,
  routeId: string,
  nextRouteId: string,
  messageId: string,
) {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  const result = (await convex.mutation('chats:forkCurrentUserChat' as any, { routeId, nextRouteId, messageId })) as {
    routeId: string;
  };
  return result.routeId;
}

export async function upsertCurrentUserProfile(
  serverEnv: ServerEnv,
  authToken: string,
  payload: {
    email?: string;
    image?: string;
    name?: string;
  },
) {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  await convex.mutation('users:upsertCurrentUserProfile' as any, payload);
}

export async function getCurrentUserRecord(serverEnv: ServerEnv, authToken: string): Promise<FirestoreUserRecord | null> {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  return (await convex.query('users:getCurrentUserRecord' as any, {})) as FirestoreUserRecord | null;
}

export async function upsertCurrentUserLlmPreferences(
  serverEnv: ServerEnv,
  authToken: string,
  payload: FirestoreLlmPreferences,
) {
  const convex = createAuthenticatedConvexClient(serverEnv, authToken);
  await convex.mutation('users:upsertCurrentUserLlmPreferences' as any, { llmPreferences: payload });
}
