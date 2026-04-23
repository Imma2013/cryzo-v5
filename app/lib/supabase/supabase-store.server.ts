import type { Message } from 'ai';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type ServerEnv = Record<string, string | undefined>;

export interface SupabaseLlmPreferences {
  providerSettings?: Record<string, unknown>;
  selectedProvider?: string;
  selectedModel?: string;
}

export interface SupabaseUserRecord {
  email?: string;
  image?: string;
  llmPreferences?: SupabaseLlmPreferences;
  name?: string;
  uid: string;
}

export interface SupabaseChatMetadata {
  gitUrl?: string;
  gitBranch?: string;
  netlifySiteId?: string;
}

export interface SupabaseChatRecord {
  routeId: string;
  description?: string;
  messages: Message[];
  metadata?: SupabaseChatMetadata;
  snapshot?: unknown;
  timestamp: string;
  lastUpdatedAt: number;
}

type UserProfileRow = {
  email: string | null;
  image: string | null;
  llm_preferences: SupabaseLlmPreferences | null;
  name: string | null;
  user_id: string;
};

type UserChatRow = {
  description: string | null;
  last_updated_at: number | null;
  messages_json: Message[] | null;
  metadata: SupabaseChatMetadata | null;
  route_id: string;
  snapshot_json: unknown | null;
  timestamp: string;
};

function readServerEnvValue(value: string | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function getSupabaseClient(serverEnv: ServerEnv, accessToken: string) {
  const supabaseUrl = readServerEnvValue(serverEnv.SUPABASE_URL) ?? readServerEnvValue(serverEnv.VITE_SUPABASE_URL);
  const supabaseAnonKey =
    readServerEnvValue(serverEnv.SUPABASE_ANON_KEY) ?? readServerEnvValue(serverEnv.VITE_SUPABASE_ANON_KEY);

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL.');
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function parseMessages(value: unknown): Message[] {
  if (Array.isArray(value)) {
    return value as Message[];
  }

  return [];
}

function parseJsonString(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseSnapshot(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value;
}

function normalizeChatRecord(row: UserChatRow): SupabaseChatRecord {
  return {
    routeId: row.route_id,
    description: row.description ?? undefined,
    messages: parseMessages(row.messages_json),
    metadata: row.metadata ?? undefined,
    snapshot: parseSnapshot(row.snapshot_json),
    timestamp: row.timestamp,
    lastUpdatedAt: (row.last_updated_at ?? Date.parse(row.timestamp)) || Date.now(),
  };
}

async function getCurrentChatRow(
  supabase: SupabaseClient,
  uid: string,
  routeId: string,
): Promise<UserChatRow | null> {
  const { data, error } = await supabase
    .from('user_chats')
    .select('route_id, description, messages_json, metadata, snapshot_json, timestamp, last_updated_at')
    .eq('user_id', uid)
    .eq('route_id', routeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserChatRow | null) ?? null;
}

async function getCurrentProfileRow(supabase: SupabaseClient, uid: string): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email, image, name, llm_preferences')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserProfileRow | null) ?? null;
}

export async function listCurrentUserChats(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
): Promise<SupabaseChatRecord[]> {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const { data, error } = await supabase
    .from('user_chats')
    .select('route_id, description, messages_json, metadata, snapshot_json, timestamp, last_updated_at')
    .eq('user_id', userId)
    .order('last_updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as UserChatRow[]).map(normalizeChatRecord);
}

export async function getCurrentUserChatByRouteId(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  routeId: string,
): Promise<SupabaseChatRecord | null> {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const row = await getCurrentChatRow(supabase, userId, routeId);
  return row ? normalizeChatRecord(row) : null;
}

export async function upsertCurrentUserChat(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  payload: {
    routeId: string;
    description?: string;
    messagesJson: string;
    metadata?: SupabaseChatMetadata;
    snapshotJson?: string;
    timestamp: string;
  },
) {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const existing = await getCurrentChatRow(supabase, userId, payload.routeId);
  const parsedMessages = parseMessages(parseJsonString(payload.messagesJson));
  const parsedSnapshot = parseJsonString(payload.snapshotJson);
  const payloadData = {
    description: payload.description ?? null,
    last_updated_at: now,
    messages_json: Array.isArray(parsedMessages) ? parsedMessages : [],
    metadata: payload.metadata ?? null,
    snapshot_json: parsedSnapshot ?? null,
    timestamp: payload.timestamp,
    updated_at: nowIso,
  };

  if (existing) {
    const { error } = await supabase
      .from('user_chats')
      .update(payloadData)
      .eq('user_id', userId)
      .eq('route_id', payload.routeId);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase.from('user_chats').insert({
      ...payloadData,
      created_at: payload.timestamp,
      route_id: payload.routeId,
      user_id: userId,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  const next = await getCurrentChatRow(supabase, userId, payload.routeId);

  if (!next) {
    throw new Error('Failed to load updated chat.');
  }

  return normalizeChatRecord(next);
}

export async function updateCurrentUserChatDescription(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  routeId: string,
  description: string,
) {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const now = Date.now();
  const { error } = await supabase
    .from('user_chats')
    .update({
      description,
      last_updated_at: now,
      updated_at: new Date(now).toISOString(),
    })
    .eq('user_id', userId)
    .eq('route_id', routeId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteCurrentUserChat(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  routeId: string,
) {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const { error } = await supabase.from('user_chats').delete().eq('user_id', userId).eq('route_id', routeId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function duplicateCurrentUserChat(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  routeId: string,
  nextRouteId: string,
) {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const source = await getCurrentChatRow(supabase, userId, routeId);

  if (!source) {
    throw new Error('Chat not found');
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const nextDescription =
    source.description && source.description.trim().length > 0 ? `${source.description} (copy)` : 'Chat copy';
  const { error } = await supabase.from('user_chats').insert({
    user_id: userId,
    route_id: nextRouteId,
    description: nextDescription,
    messages_json: parseMessages(source.messages_json),
    metadata: source.metadata ?? null,
    snapshot_json: source.snapshot_json ?? null,
    timestamp: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    last_updated_at: now,
  });

  if (error) {
    throw new Error(error.message);
  }

  return nextRouteId;
}

export async function forkCurrentUserChat(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  routeId: string,
  nextRouteId: string,
  messageId: string,
) {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const source = await getCurrentChatRow(supabase, userId, routeId);

  if (!source) {
    throw new Error('Chat not found');
  }

  const sourceMessages = parseMessages(source.messages_json);
  const messageIndex = sourceMessages.findIndex((message: any) => message?.id === messageId);

  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  const forkMessages = sourceMessages.slice(0, messageIndex + 1);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const nextDescription =
    source.description && source.description.trim().length > 0 ? `${source.description} (fork)` : 'Forked chat';
  const { error } = await supabase.from('user_chats').insert({
    user_id: userId,
    route_id: nextRouteId,
    description: nextDescription,
    messages_json: forkMessages,
    metadata: source.metadata ?? null,
    snapshot_json: source.snapshot_json ?? null,
    timestamp: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    last_updated_at: now,
  });

  if (error) {
    throw new Error(error.message);
  }

  return nextRouteId;
}

export async function upsertCurrentUserProfile(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  payload: {
    email?: string;
    image?: string;
    name?: string;
  },
) {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  const existing = await getCurrentProfileRow(supabase, userId);

  if (existing) {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        email: payload.email ?? existing.email,
        image: payload.image ?? existing.image,
        name: payload.name ?? existing.name,
        last_seen_at: now,
        updated_at: updatedAt,
      })
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase.from('user_profiles').insert({
      user_id: userId,
      email: payload.email ?? null,
      image: payload.image ?? null,
      name: payload.name ?? null,
      last_seen_at: now,
      updated_at: updatedAt,
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function getCurrentUserRecord(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
): Promise<SupabaseUserRecord | null> {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const profile = await getCurrentProfileRow(supabase, userId);

  if (!profile) {
    return null;
  }

  return {
    uid: profile.user_id,
    email: profile.email ?? undefined,
    image: profile.image ?? undefined,
    llmPreferences: profile.llm_preferences ?? undefined,
    name: profile.name ?? undefined,
  };
}

export async function upsertCurrentUserLlmPreferences(
  serverEnv: ServerEnv,
  userId: string,
  accessToken: string,
  payload: SupabaseLlmPreferences,
) {
  const supabase = getSupabaseClient(serverEnv, accessToken);
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  const existing = await getCurrentProfileRow(supabase, userId);
  const currentPreferences = existing?.llm_preferences ?? {};
  const nextPreferences = {
    ...currentPreferences,
    ...(payload.providerSettings !== undefined ? { providerSettings: payload.providerSettings } : {}),
    ...(payload.selectedProvider !== undefined ? { selectedProvider: payload.selectedProvider } : {}),
    ...(payload.selectedModel !== undefined ? { selectedModel: payload.selectedModel } : {}),
  };

  if (existing) {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        llm_preferences: nextPreferences,
        last_seen_at: now,
        updated_at: updatedAt,
      })
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase.from('user_profiles').insert({
    user_id: userId,
    llm_preferences: nextPreferences,
    last_seen_at: now,
    updated_at: updatedAt,
  });

  if (error) {
    throw new Error(error.message);
  }
}
