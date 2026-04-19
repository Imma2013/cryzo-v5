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

function hydrateChat(chat: any) {
  return {
    ...chat,
    messages: parseJson(chat.messagesJson, []),
    snapshot: parseJson(chat.snapshotJson, undefined),
  };
}

export const listCurrentUserChats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_userId_lastUpdatedAt', (q) => q.eq('userId', identity.subject))
      .collect();

    return chats
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
      .map((chat) => hydrateChat(chat));
  },
});

export const getCurrentUserChatByRouteId = query({
  args: {
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const chat = await ctx.db
      .query('chats')
      .withIndex('by_routeId', (q) => q.eq('routeId', args.routeId))
      .unique();

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
    const existingChat = await ctx.db
      .query('chats')
      .withIndex('by_routeId', (q) => q.eq('routeId', args.routeId))
      .unique();

    const nextChat = {
      description: args.description,
      lastUpdatedAt: Date.now(),
      messagesJson: args.messagesJson,
      metadata: args.metadata,
      routeId: args.routeId,
      snapshotJson: args.snapshotJson,
      timestamp: args.timestamp,
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
    const existingChat = await ctx.db
      .query('chats')
      .withIndex('by_routeId', (q) => q.eq('routeId', args.routeId))
      .unique();

    if (!existingChat || existingChat.userId !== identity.subject) {
      throw new Error('Chat not found');
    }

    await ctx.db.patch(existingChat._id, {
      description: args.description,
      lastUpdatedAt: Date.now(),
    });
  },
});

export const deleteCurrentUserChat = mutation({
  args: {
    routeId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existingChat = await ctx.db
      .query('chats')
      .withIndex('by_routeId', (q) => q.eq('routeId', args.routeId))
      .unique();

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
    const existingChat = await ctx.db
      .query('chats')
      .withIndex('by_routeId', (q) => q.eq('routeId', args.routeId))
      .unique();

    if (!existingChat || existingChat.userId !== identity.subject) {
      throw new Error('Chat not found');
    }

    await ctx.db.insert('chats', {
      description: existingChat.description ? `${existingChat.description} (copy)` : 'Chat copy',
      lastUpdatedAt: Date.now(),
      messagesJson: existingChat.messagesJson,
      metadata: existingChat.metadata,
      routeId: args.nextRouteId,
      snapshotJson: existingChat.snapshotJson,
      timestamp: new Date().toISOString(),
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
    const existingChat = await ctx.db
      .query('chats')
      .withIndex('by_routeId', (q) => q.eq('routeId', args.routeId))
      .unique();

    if (!existingChat || existingChat.userId !== identity.subject) {
      throw new Error('Chat not found');
    }

    const messages = parseJson<Array<{ id?: string }>>(existingChat.messagesJson, []);
    const messageIndex = messages.findIndex((message) => message?.id === args.messageId);

    if (messageIndex === -1) {
      throw new Error('Message not found');
    }

    await ctx.db.insert('chats', {
      description: existingChat.description ? `${existingChat.description} (fork)` : 'Forked chat',
      lastUpdatedAt: Date.now(),
      messagesJson: JSON.stringify(messages.slice(0, messageIndex + 1)),
      metadata: existingChat.metadata,
      routeId: args.nextRouteId,
      snapshotJson: existingChat.snapshotJson,
      timestamp: new Date().toISOString(),
      userId: identity.subject,
    });

    return args.nextRouteId;
  },
});
