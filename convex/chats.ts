import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

const metadataValidator = v.optional(
  v.object({
    gitBranch: v.optional(v.string()),
    gitUrl: v.optional(v.string()),
    netlifySiteId: v.optional(v.string()),
  }),
);

function parseMessages(messagesJson: string) {
  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSnapshot(snapshotJson: string | undefined) {
  if (!snapshotJson) {
    return undefined;
  }

  try {
    return JSON.parse(snapshotJson);
  } catch {
    return undefined;
  }
}

function normalizeChatRecord(doc: any) {
  return {
    routeId: doc.routeId,
    description: doc.description ?? undefined,
    messages: parseMessages(doc.messagesJson),
    metadata: doc.metadata ?? undefined,
    snapshot: parseSnapshot(doc.snapshotJson),
    timestamp: doc.timestamp,
    lastUpdatedAt: doc.lastUpdatedAt,
  };
}

function normalizeFirebaseUid(firebaseUid: string) {
  const normalized = firebaseUid.trim();

  if (!normalized) {
    throw new Error('Unauthorized');
  }

  return normalized;
}

async function getCurrentChatDoc(ctx: any, firebaseUid: string, routeId: string) {
  return await ctx.db
    .query('userChats')
    .withIndex('by_firebase_uid_route_id', (q: any) => q.eq('firebaseUid', firebaseUid).eq('routeId', routeId))
    .unique();
}

export const listCurrentUserChats = queryGeneric({
  args: {
    firebaseUid: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const docs = await ctx.db
      .query('userChats')
      .withIndex('by_firebase_uid_last_updated_at', (q: any) => q.eq('firebaseUid', firebaseUid))
      .order('desc')
      .collect();

    return docs.map((doc: any) => normalizeChatRecord(doc));
  },
});

export const getCurrentUserChatByRouteId = queryGeneric({
  args: {
    firebaseUid: v.string(),
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const doc = await getCurrentChatDoc(ctx, firebaseUid, args.routeId);

    if (!doc) {
      return null;
    }

    return normalizeChatRecord(doc);
  },
});

export const upsertCurrentUserChat = mutationGeneric({
  args: {
    firebaseUid: v.string(),
    routeId: v.string(),
    description: v.optional(v.string()),
    messagesJson: v.string(),
    metadata: metadataValidator,
    snapshotJson: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const existing = await getCurrentChatDoc(ctx, firebaseUid, args.routeId);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.description !== undefined ? { description: args.description } : {}),
        firebaseUid,
        messagesJson: args.messagesJson,
        ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
        ...(args.snapshotJson !== undefined ? { snapshotJson: args.snapshotJson } : {}),
        timestamp: args.timestamp,
        updatedAt: nowIso,
        lastUpdatedAt: now,
      });
    } else {
      await ctx.db.insert('userChats', {
        firebaseUid,
        routeId: args.routeId,
        description: args.description,
        messagesJson: args.messagesJson,
        metadata: args.metadata,
        snapshotJson: args.snapshotJson,
        timestamp: args.timestamp,
        createdAt: args.timestamp,
        updatedAt: nowIso,
        lastUpdatedAt: now,
      });
    }

    const next = await getCurrentChatDoc(ctx, firebaseUid, args.routeId);

    if (!next) {
      throw new Error('Failed to load updated chat.');
    }

    return normalizeChatRecord(next);
  },
});

export const updateCurrentUserChatDescription = mutationGeneric({
  args: {
    firebaseUid: v.string(),
    routeId: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const existing = await getCurrentChatDoc(ctx, firebaseUid, args.routeId);

    if (!existing) {
      throw new Error('Chat not found');
    }

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      description: args.description,
      updatedAt: new Date(now).toISOString(),
      lastUpdatedAt: now,
    });

    return { ok: true };
  },
});

export const deleteCurrentUserChat = mutationGeneric({
  args: {
    firebaseUid: v.string(),
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const existing = await getCurrentChatDoc(ctx, firebaseUid, args.routeId);

    if (!existing) {
      return { ok: true };
    }

    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const duplicateCurrentUserChat = mutationGeneric({
  args: {
    firebaseUid: v.string(),
    routeId: v.string(),
    nextRouteId: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const source = await getCurrentChatDoc(ctx, firebaseUid, args.routeId);

    if (!source) {
      throw new Error('Chat not found');
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const description =
      typeof source.description === 'string' && source.description.trim().length > 0
        ? `${source.description} (copy)`
        : 'Chat copy';

    await ctx.db.insert('userChats', {
      firebaseUid,
      routeId: args.nextRouteId,
      description,
      messagesJson: source.messagesJson,
      metadata: source.metadata,
      snapshotJson: source.snapshotJson,
      timestamp: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastUpdatedAt: now,
    });

    return { routeId: args.nextRouteId };
  },
});

export const forkCurrentUserChat = mutationGeneric({
  args: {
    firebaseUid: v.string(),
    routeId: v.string(),
    nextRouteId: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const source = await getCurrentChatDoc(ctx, firebaseUid, args.routeId);

    if (!source) {
      throw new Error('Chat not found');
    }

    const sourceMessages = parseMessages(source.messagesJson);
    const messageIndex = sourceMessages.findIndex((message: any) => message?.id === args.messageId);

    if (messageIndex === -1) {
      throw new Error('Message not found');
    }

    const forkMessages = sourceMessages.slice(0, messageIndex + 1);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const description =
      typeof source.description === 'string' && source.description.trim().length > 0
        ? `${source.description} (fork)`
        : 'Forked chat';

    await ctx.db.insert('userChats', {
      firebaseUid,
      routeId: args.nextRouteId,
      description,
      messagesJson: JSON.stringify(forkMessages),
      metadata: source.metadata,
      snapshotJson: source.snapshotJson,
      timestamp: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastUpdatedAt: now,
    });

    return { routeId: args.nextRouteId };
  },
});

