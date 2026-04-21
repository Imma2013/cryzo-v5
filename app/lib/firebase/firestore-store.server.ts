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

function createAdminConvexClient(serverEnv: ServerEnv) {
  return createConvexServerClient(serverEnv as any);
}

export async function listCurrentUserChats(serverEnv: ServerEnv, firebaseUid: string): Promise<FirestoreChatRecord[]> {
  const convex = createAdminConvexClient(serverEnv);
  return (await convex.query('chats:listCurrentUserChats' as any, { firebaseUid })) as FirestoreChatRecord[];
}

export async function getCurrentUserChatByRouteId(
  serverEnv: ServerEnv,
  firebaseUid: string,
  routeId: string,
): Promise<FirestoreChatRecord | null> {
  const convex = createAdminConvexClient(serverEnv);
  return (await convex.query('chats:getCurrentUserChatByRouteId' as any, { firebaseUid, routeId })) as FirestoreChatRecord | null;
}

export async function upsertCurrentUserChat(
  serverEnv: ServerEnv,
  firebaseUid: string,
  payload: {
    routeId: string;
    description?: string;
    messagesJson: string;
    metadata?: FirestoreChatMetadata;
    snapshotJson?: string;
    timestamp: string;
  },
) {
  const convex = createAdminConvexClient(serverEnv);
  return (await convex.mutation('chats:upsertCurrentUserChat' as any, { firebaseUid, ...payload })) as FirestoreChatRecord;
}

export async function updateCurrentUserChatDescription(
  serverEnv: ServerEnv,
  firebaseUid: string,
  routeId: string,
  description: string,
) {
  const convex = createAdminConvexClient(serverEnv);
  await convex.mutation('chats:updateCurrentUserChatDescription' as any, { firebaseUid, routeId, description });
}

export async function deleteCurrentUserChat(serverEnv: ServerEnv, firebaseUid: string, routeId: string) {
  const convex = createAdminConvexClient(serverEnv);
  await convex.mutation('chats:deleteCurrentUserChat' as any, { firebaseUid, routeId });
}

export async function duplicateCurrentUserChat(serverEnv: ServerEnv, firebaseUid: string, routeId: string, nextRouteId: string) {
  const convex = createAdminConvexClient(serverEnv);
  const result = (await convex.mutation('chats:duplicateCurrentUserChat' as any, {
    firebaseUid,
    nextRouteId,
    routeId,
  })) as {
    routeId: string;
  };
  return result.routeId;
}

export async function forkCurrentUserChat(
  serverEnv: ServerEnv,
  firebaseUid: string,
  routeId: string,
  nextRouteId: string,
  messageId: string,
) {
  const convex = createAdminConvexClient(serverEnv);
  const result = (await convex.mutation('chats:forkCurrentUserChat' as any, {
    firebaseUid,
    routeId,
    nextRouteId,
    messageId,
  })) as {
    routeId: string;
  };
  return result.routeId;
}

export async function upsertCurrentUserProfile(
  serverEnv: ServerEnv,
  firebaseUid: string,
  payload: {
    email?: string;
    image?: string;
    name?: string;
  },
) {
  const convex = createAdminConvexClient(serverEnv);
  await convex.mutation('users:upsertCurrentUserProfile' as any, { firebaseUid, ...payload });
}

export async function getCurrentUserRecord(serverEnv: ServerEnv, firebaseUid: string): Promise<FirestoreUserRecord | null> {
  const convex = createAdminConvexClient(serverEnv);
  return (await convex.query('users:getCurrentUserRecord' as any, { firebaseUid })) as FirestoreUserRecord | null;
}

export async function upsertCurrentUserLlmPreferences(
  serverEnv: ServerEnv,
  firebaseUid: string,
  payload: FirestoreLlmPreferences,
) {
  const convex = createAdminConvexClient(serverEnv);
  await convex.mutation('users:upsertCurrentUserLlmPreferences' as any, { firebaseUid, llmPreferences: payload });
}
