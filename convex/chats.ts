import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const chatMetadataValidator = v.object({
  gitUrl: v.optional(v.string()),
  gitBranch: v.optional(v.string()),
  netlifySiteId: v.optional(v.string()),
});

async function requireIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error('User is not authenticated.');
  }

  return identity;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeMessages(chat: any) {
  if (chat.messagesJson) {
    return parseJson(chat.messagesJson, []);
  }

  return Array.isArray(chat.messages) ? chat.messages : [];
}

function normalizeDescription(chat: any) {
  return chat.description ?? chat.title;
}

function normalizeTimestamp(chat: any) {
  return chat.timestamp ?? chat.updatedAt ?? chat.createdAt ?? new Date(chat._creationTime).toISOString();
}

function normalizeLastUpdatedAt(chat: any) {
  if (typeof chat.lastUpdatedAt === 'number') {
    return chat.lastUpdatedAt;
  }

  const candidate = chat.updatedAt ?? chat.timestamp ?? chat.createdAt;
  const parsedTimestamp = candidate ? Date.parse(candidate) : NaN;

  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : chat._creationTime;
}

function normalizeRouteId(chat: any) {
  return chat.routeId ?? chat._id;
}

function hydrateChat(chat: any) {
  return {
    ...chat,
    description: normalizeDescription(chat),
    lastUpdatedAt: normalizeLastUpdatedAt(chat),
    messages: normalizeMessages(chat),
    routeId: normalizeRouteId(chat),
    snapshot: parseJson(chat.snapshotJson, undefined),
    timestamp: normalizeTimestamp(chat),
  };
}

async function findChatForUserByRouteId(ctx: any, userId: string, routeId: string) {
  const indexedMatch = await ctx.db
    .query('chats')
    .withIndex('by_routeId', (q: any) => q.eq('routeId', routeId))
    .unique();

  if (indexedMatch?.userId === userId) {
    return indexedMatch;
  }

  const userChats = await ctx.db.query('chats').withIndex('by_userId', (q: any) => q.eq('userId', userId)).collect();
  return userChats.find((chat: any) => normalizeRouteId(chat) === routeId) ?? null;
}

export const listCurrentUserChats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .collect();

    return chats
      .sort((a, b) => normalizeLastUpdatedAt(b) - normalizeLastUpdatedAt(a))
      .map((chat) => hydrateChat(chat));
  },
});

export const getCurrentUserChatByRouteId = query({
  args: {
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const chat = await findChatForUserByRouteId(ctx, identity.subject, args.routeId);

    if (!chat || chat.userId !== identity.subject) {
      return null;
    }

    return hydrateChat(chat);
  },
});

export const upsertCurrentUserChat = mutation({
  args: {
    description: v.optional(v.string()),
    messagesJson: v.string(),
    metadata: v.optional(chatMetadataValidator),
    routeId: v.string(),
    snapshotJson: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existingChat = await findChatForUserByRouteId(ctx, identity.subject, args.routeId);
    const normalizedMessages = parseJson(args.messagesJson, []);

    const nextChat = {
      createdAt: existingChat?.createdAt ?? args.timestamp,
      description: args.description,
      lastUpdatedAt: Date.now(),
      messages: normalizedMessages,
      messagesJson: args.messagesJson,
      metadata: args.metadata,
      routeId: args.routeId,
      snapshotJson: args.snapshotJson,
      timestamp: args.timestamp,
      title: args.description,
      updatedAt: new Date().toISOString(),
      userId: identity.subject,
    };

    if (existingChat) {
      if (existingChat.userId !== identity.subject) {
        throw new Error('Chat does not belong to the authenticated user.');
      }

      await ctx.db.patch(existingChat._id, nextChat);
      return existingChat._id;
    }

    return ctx.db.insert('chats', nextChat);
  },
});

export const updateCurrentUserChatDescription = mutation({
  args: {
    description: v.string(),
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existingChat = await findChatForUserByRouteId(ctx, identity.subject, args.routeId);

    if (!existingChat || existingChat.userId !== identity.subject) {
      throw new Error('Chat not found');
    }

    await ctx.db.patch(existingChat._id, {
      description: args.description,
      lastUpdatedAt: Date.now(),
      title: args.description,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const deleteCurrentUserChat = mutation({
  args: {
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existingChat = await findChatForUserByRouteId(ctx, identity.subject, args.routeId);

    if (!existingChat || existingChat.userId !== identity.subject) {
      throw new Error('Chat not found');
    }

    await ctx.db.delete(existingChat._id);
  },
});

export const duplicateCurrentUserChat = mutation({
  args: {
    routeId: v.string(),
    nextRouteId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existingChat = await findChatForUserByRouteId(ctx, identity.subject, args.routeId);

    if (!existingChat || existingChat.userId !== identity.subject) {
      throw new Error('Chat not found');
    }

    await ctx.db.insert('chats', {
      createdAt: new Date().toISOString(),
      description: existingChat.description ? `${existingChat.description} (copy)` : 'Chat copy',
      lastUpdatedAt: Date.now(),
      messages: normalizeMessages(existingChat),
      messagesJson: existingChat.messagesJson ?? JSON.stringify(normalizeMessages(existingChat)),
      metadata: existingChat.metadata,
      routeId: args.nextRouteId,
      snapshotJson: existingChat.snapshotJson,
      timestamp: new Date().toISOString(),
      title: existingChat.description ? `${existingChat.description} (copy)` : 'Chat copy',
      updatedAt: new Date().toISOString(),
      userId: identity.subject,
    });

    return args.nextRouteId;
  },
});

export const forkCurrentUserChat = mutation({
  args: {
    messageId: v.string(),
    nextRouteId: v.string(),
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existingChat = await findChatForUserByRouteId(ctx, identity.subject, args.routeId);

    if (!existingChat || existingChat.userId !== identity.subject) {
      throw new Error('Chat not found');
    }

    const messages = normalizeMessages(existingChat) as Array<{ id?: string }>;
    const messageIndex = messages.findIndex((message) => message?.id === args.messageId);

    if (messageIndex === -1) {
      throw new Error('Message not found');
    }

    await ctx.db.insert('chats', {
      createdAt: new Date().toISOString(),
      description: existingChat.description ? `${existingChat.description} (fork)` : 'Forked chat',
      lastUpdatedAt: Date.now(),
      messages: messages.slice(0, messageIndex + 1),
      messagesJson: JSON.stringify(messages.slice(0, messageIndex + 1)),
      metadata: existingChat.metadata,
      routeId: args.nextRouteId,
      snapshotJson: existingChat.snapshotJson,
      timestamp: new Date().toISOString(),
      title: existingChat.description ? `${existingChat.description} (fork)` : 'Forked chat',
      updatedAt: new Date().toISOString(),
      userId: identity.subject,
    });

    return args.nextRouteId;
  },
});
