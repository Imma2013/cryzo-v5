import type { Message } from 'ai';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseFirestore } from './admin.server';

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

function usersCollection(serverEnv: ServerEnv) {
  return getFirebaseFirestore(serverEnv).collection('users');
}

function chatsCollection(serverEnv: ServerEnv, uid: string) {
  return usersCollection(serverEnv).doc(uid).collection('chats');
}

function toIsoString(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function toMessages(value: unknown): Message[] {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as Message[]) : [];
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? (value as Message[]) : [];
}

function parseOptionalJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function normalizeChatRecord(routeId: string, raw: Record<string, unknown>): FirestoreChatRecord {
  const nowIso = new Date().toISOString();
  const lastUpdatedAt = typeof raw.lastUpdatedAt === 'number' ? raw.lastUpdatedAt : Date.now();

  return {
    routeId,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    messages: toMessages(raw.messagesJson ?? raw.messages),
    metadata: (raw.metadata ?? undefined) as FirestoreChatMetadata | undefined,
    snapshot: parseOptionalJson(raw.snapshotJson),
    timestamp: toIsoString(raw.timestamp, nowIso),
    lastUpdatedAt,
  };
}

export async function listCurrentUserChats(serverEnv: ServerEnv, uid: string): Promise<FirestoreChatRecord[]> {
  const snapshot = await chatsCollection(serverEnv, uid).orderBy('lastUpdatedAt', 'desc').get();

  return snapshot.docs.map((doc) => normalizeChatRecord(doc.id, doc.data() as Record<string, unknown>));
}

export async function getCurrentUserChatByRouteId(
  serverEnv: ServerEnv,
  uid: string,
  routeId: string,
): Promise<FirestoreChatRecord | null> {
  const chatSnapshot = await chatsCollection(serverEnv, uid).doc(routeId).get();

  if (!chatSnapshot.exists) {
    return null;
  }

  return normalizeChatRecord(routeId, chatSnapshot.data() as Record<string, unknown>);
}

export async function upsertCurrentUserChat(
  serverEnv: ServerEnv,
  uid: string,
  payload: {
    routeId: string;
    description?: string;
    messagesJson: string;
    metadata?: FirestoreChatMetadata;
    snapshotJson?: string;
    timestamp: string;
  },
) {
  const now = Date.now();
  const chatDoc = chatsCollection(serverEnv, uid).doc(payload.routeId);
  const existing = await chatDoc.get();

  await chatDoc.set(
    {
      createdAt: existing.exists ? existing.get('createdAt') : payload.timestamp,
      description: payload.description,
      lastUpdatedAt: now,
      messagesJson: payload.messagesJson,
      metadata: payload.metadata ?? null,
      routeId: payload.routeId,
      snapshotJson: payload.snapshotJson ?? null,
      timestamp: payload.timestamp,
      updatedAt: new Date(now).toISOString(),
    },
    { merge: true },
  );

  const nextSnapshot = await chatDoc.get();
  return normalizeChatRecord(payload.routeId, nextSnapshot.data() as Record<string, unknown>);
}

export async function updateCurrentUserChatDescription(
  serverEnv: ServerEnv,
  uid: string,
  routeId: string,
  description: string,
) {
  await chatsCollection(serverEnv, uid).doc(routeId).set(
    {
      description,
      lastUpdatedAt: Date.now(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function deleteCurrentUserChat(serverEnv: ServerEnv, uid: string, routeId: string) {
  await chatsCollection(serverEnv, uid).doc(routeId).delete();
}

export async function duplicateCurrentUserChat(
  serverEnv: ServerEnv,
  uid: string,
  routeId: string,
  nextRouteId: string,
) {
  const sourceDoc = await chatsCollection(serverEnv, uid).doc(routeId).get();

  if (!sourceDoc.exists) {
    throw new Error('Chat not found');
  }

  const sourceData = sourceDoc.data() as Record<string, unknown>;
  const description =
    typeof sourceData.description === 'string' && sourceData.description.trim().length > 0
      ? `${sourceData.description} (copy)`
      : 'Chat copy';

  await chatsCollection(serverEnv, uid).doc(nextRouteId).set({
    ...sourceData,
    createdAt: new Date().toISOString(),
    description,
    lastUpdatedAt: Date.now(),
    routeId: nextRouteId,
    timestamp: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return nextRouteId;
}

export async function forkCurrentUserChat(
  serverEnv: ServerEnv,
  uid: string,
  routeId: string,
  nextRouteId: string,
  messageId: string,
) {
  const sourceDoc = await chatsCollection(serverEnv, uid).doc(routeId).get();

  if (!sourceDoc.exists) {
    throw new Error('Chat not found');
  }

  const sourceData = sourceDoc.data() as Record<string, unknown>;
  const messages = toMessages(sourceData.messagesJson ?? sourceData.messages);
  const messageIndex = messages.findIndex((message) => message?.id === messageId);

  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const forkMessages = messages.slice(0, messageIndex + 1);
  const description =
    typeof sourceData.description === 'string' && sourceData.description.trim().length > 0
      ? `${sourceData.description} (fork)`
      : 'Forked chat';

  await chatsCollection(serverEnv, uid).doc(nextRouteId).set({
    ...sourceData,
    createdAt: new Date().toISOString(),
    description,
    lastUpdatedAt: Date.now(),
    messagesJson: JSON.stringify(forkMessages),
    routeId: nextRouteId,
    timestamp: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return nextRouteId;
}

export async function upsertCurrentUserProfile(
  serverEnv: ServerEnv,
  uid: string,
  payload: {
    email?: string;
    image?: string;
    name?: string;
  },
) {
  await usersCollection(serverEnv).doc(uid).set(
    {
      uid,
      email: payload.email ?? null,
      image: payload.image ?? null,
      name: payload.name ?? null,
      lastSeenAt: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getCurrentUserRecord(serverEnv: ServerEnv, uid: string): Promise<FirestoreUserRecord | null> {
  const userSnapshot = await usersCollection(serverEnv).doc(uid).get();

  if (!userSnapshot.exists) {
    return null;
  }

  const data = userSnapshot.data() as Record<string, unknown>;

  return {
    uid,
    email: typeof data.email === 'string' ? data.email : undefined,
    image: typeof data.image === 'string' ? data.image : undefined,
    name: typeof data.name === 'string' ? data.name : undefined,
    llmPreferences:
      data.llmPreferences && typeof data.llmPreferences === 'object'
        ? (data.llmPreferences as FirestoreLlmPreferences)
        : undefined,
  };
}

export async function upsertCurrentUserLlmPreferences(
  serverEnv: ServerEnv,
  uid: string,
  payload: FirestoreLlmPreferences,
) {
  const existing = await getCurrentUserRecord(serverEnv, uid);
  const nextPreferences = {
    ...(existing?.llmPreferences ?? {}),
    ...(payload.providerSettings ? { providerSettings: payload.providerSettings } : {}),
    ...(payload.selectedProvider !== undefined ? { selectedProvider: payload.selectedProvider } : {}),
    ...(payload.selectedModel !== undefined ? { selectedModel: payload.selectedModel } : {}),
  };

  await usersCollection(serverEnv).doc(uid).set(
    {
      uid,
      llmPreferences: nextPreferences,
      lastSeenAt: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

