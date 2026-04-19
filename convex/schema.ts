import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const providerSettingValidator = v.object({
  enabled: v.optional(v.boolean()),
  baseUrl: v.optional(v.string()),
  OPENAI_LIKE_API_MODELS: v.optional(v.string()),
});

const llmPreferencesValidator = v.object({
  selectedModel: v.optional(v.string()),
  selectedProvider: v.optional(v.string()),
  providerSettings: v.optional(v.record(v.string(), providerSettingValidator)),
});

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    lastSeenAt: v.number(),
    llmPreferences: v.optional(llmPreferencesValidator),
    name: v.optional(v.string()),
    tokenIdentifier: v.string(),
    uid: v.optional(v.string()),
  })
    .index('by_email', ['email'])
    .index('by_tokenIdentifier', ['tokenIdentifier'])
    .index('by_uid', ['uid']),
});
