import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    lastSeenAt: v.number(),
    name: v.optional(v.string()),
    tokenIdentifier: v.string(),
    uid: v.optional(v.string()),
  })
    .index('by_email', ['email'])
    .index('by_tokenIdentifier', ['tokenIdentifier'])
    .index('by_uid', ['uid']),
});
