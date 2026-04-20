import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  userProfiles: defineTable({
    userId: v.id('users'),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
    llmPreferences: v.optional(
      v.object({
        providerSettings: v.optional(v.any()),
        selectedModel: v.optional(v.string()),
        selectedProvider: v.optional(v.string()),
      }),
    ),
    lastSeenAt: v.number(),
    updatedAt: v.string(),
  }).index('by_user_id', ['userId']),
  userChats: defineTable({
    userId: v.id('users'),
    routeId: v.string(),
    description: v.optional(v.string()),
    messagesJson: v.string(),
    metadata: v.optional(
      v.object({
        gitBranch: v.optional(v.string()),
        gitUrl: v.optional(v.string()),
        netlifySiteId: v.optional(v.string()),
      }),
    ),
    snapshotJson: v.optional(v.string()),
    timestamp: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    lastUpdatedAt: v.number(),
  })
    .index('by_user_id_route_id', ['userId', 'routeId'])
    .index('by_user_id_last_updated_at', ['userId', 'lastUpdatedAt']),
});
