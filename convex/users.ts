import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    return ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();
  },
});

export const upsertCurrentUser = mutation({
  args: {
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
    uid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error('User is not authenticated.');
    }

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique();

    const userData = {
      email: args.email,
      image: args.image,
      lastSeenAt: Date.now(),
      name: args.name,
      tokenIdentifier: identity.tokenIdentifier,
      uid: args.uid ?? identity.subject,
    };

    if (existingUser) {
      await ctx.db.patch(existingUser._id, userData);
      return existingUser._id;
    }

    return ctx.db.insert('users', userData);
  },
});
