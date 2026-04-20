import { getAuthUserId } from '@convex-dev/auth/server';
import { mutationGeneric, queryGeneric } from 'convex/server';
import { v, type Infer } from 'convex/values';

const llmPreferencesValidator = v.object({
  providerSettings: v.optional(v.any()),
  selectedModel: v.optional(v.string()),
  selectedProvider: v.optional(v.string()),
});

type LlmPreferences = Infer<typeof llmPreferencesValidator>;

async function requireCurrentUserId(ctx: any) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return userId;
}

async function getCurrentProfileDoc(ctx: any, userId: any) {
  return await ctx.db.query('userProfiles').withIndex('by_user_id', (q: any) => q.eq('userId', userId)).unique();
}

async function getCurrentUserRecordInternal(ctx: any, userId: any) {
  const authUser = await ctx.db.get(userId);
  const profile = await getCurrentProfileDoc(ctx, userId);

  return {
    uid: String(userId),
    email: profile?.email ?? authUser?.email ?? undefined,
    image: profile?.image ?? authUser?.image ?? undefined,
    name: profile?.name ?? authUser?.name ?? undefined,
    llmPreferences: profile?.llmPreferences ?? undefined,
  };
}

export const getViewerIdentity = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    return await getCurrentUserRecordInternal(ctx, userId);
  },
});

export const getCurrentUserRecord = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    return await getCurrentUserRecordInternal(ctx, userId);
  },
});

export const upsertCurrentUserProfile = mutationGeneric({
  args: {
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const existing = await getCurrentProfileDoc(ctx, userId);
    const now = Date.now();
    const updatedAt = new Date(now).toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.email !== undefined ? { email: args.email } : {}),
        ...(args.image !== undefined ? { image: args.image } : {}),
        ...(args.name !== undefined ? { name: args.name } : {}),
        lastSeenAt: now,
        updatedAt,
      });
    } else {
      const authUser = await ctx.db.get(userId);

      await ctx.db.insert('userProfiles', {
        userId,
        email: args.email ?? authUser?.email ?? undefined,
        image: args.image ?? authUser?.image ?? undefined,
        name: args.name ?? authUser?.name ?? undefined,
        lastSeenAt: now,
        updatedAt,
      });
    }

    return await getCurrentUserRecordInternal(ctx, userId);
  },
});

export const upsertCurrentUserLlmPreferences = mutationGeneric({
  args: {
    llmPreferences: llmPreferencesValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireCurrentUserId(ctx);
    const existing = await getCurrentProfileDoc(ctx, userId);
    const currentPreferences = (existing?.llmPreferences ?? {}) as LlmPreferences;
    const nextPreferences = {
      ...currentPreferences,
      ...(args.llmPreferences.providerSettings !== undefined
        ? { providerSettings: args.llmPreferences.providerSettings }
        : {}),
      ...(args.llmPreferences.selectedProvider !== undefined
        ? { selectedProvider: args.llmPreferences.selectedProvider }
        : {}),
      ...(args.llmPreferences.selectedModel !== undefined ? { selectedModel: args.llmPreferences.selectedModel } : {}),
    } satisfies LlmPreferences;

    const now = Date.now();
    const updatedAt = new Date(now).toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        llmPreferences: nextPreferences,
        lastSeenAt: now,
        updatedAt,
      });
    } else {
      const authUser = await ctx.db.get(userId);

      await ctx.db.insert('userProfiles', {
        userId,
        email: authUser?.email ?? undefined,
        image: authUser?.image ?? undefined,
        name: authUser?.name ?? undefined,
        llmPreferences: nextPreferences,
        lastSeenAt: now,
        updatedAt,
      });
    }

    return await getCurrentUserRecordInternal(ctx, userId);
  },
});
