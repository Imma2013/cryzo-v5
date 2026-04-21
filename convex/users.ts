import { mutationGeneric, queryGeneric } from 'convex/server';
import { v, type Infer } from 'convex/values';

const llmPreferencesValidator = v.object({
  providerSettings: v.optional(v.any()),
  selectedModel: v.optional(v.string()),
  selectedProvider: v.optional(v.string()),
});

type LlmPreferences = Infer<typeof llmPreferencesValidator>;

function normalizeFirebaseUid(firebaseUid: string) {
  const normalized = firebaseUid.trim();

  if (!normalized) {
    throw new Error('Unauthorized');
  }

  return normalized;
}

async function getCurrentProfileDoc(ctx: any, firebaseUid: string) {
  return await ctx.db.query('userProfiles').withIndex('by_firebase_uid', (q: any) => q.eq('firebaseUid', firebaseUid)).unique();
}

async function getCurrentUserRecordInternal(ctx: any, firebaseUid: string) {
  const profile = await getCurrentProfileDoc(ctx, firebaseUid);

  return {
    uid: firebaseUid,
    email: profile?.email ?? undefined,
    image: profile?.image ?? undefined,
    name: profile?.name ?? undefined,
    llmPreferences: profile?.llmPreferences ?? undefined,
  };
}

export const getCurrentUserRecord = queryGeneric({
  args: {
    firebaseUid: v.string(),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    return await getCurrentUserRecordInternal(ctx, firebaseUid);
  },
});

export const upsertCurrentUserProfile = mutationGeneric({
  args: {
    firebaseUid: v.string(),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const existing = await getCurrentProfileDoc(ctx, firebaseUid);
    const now = Date.now();
    const updatedAt = new Date(now).toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.email !== undefined ? { email: args.email } : {}),
        ...(args.image !== undefined ? { image: args.image } : {}),
        ...(args.name !== undefined ? { name: args.name } : {}),
        firebaseUid,
        lastSeenAt: now,
        updatedAt,
      });
    } else {
      await ctx.db.insert('userProfiles', {
        firebaseUid,
        email: args.email ?? undefined,
        image: args.image ?? undefined,
        name: args.name ?? undefined,
        lastSeenAt: now,
        updatedAt,
      });
    }

    return await getCurrentUserRecordInternal(ctx, firebaseUid);
  },
});

export const upsertCurrentUserLlmPreferences = mutationGeneric({
  args: {
    firebaseUid: v.string(),
    llmPreferences: llmPreferencesValidator,
  },
  handler: async (ctx, args) => {
    const firebaseUid = normalizeFirebaseUid(args.firebaseUid);
    const existing = await getCurrentProfileDoc(ctx, firebaseUid);
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
        firebaseUid,
        llmPreferences: nextPreferences,
        lastSeenAt: now,
        updatedAt,
      });
    } else {
      await ctx.db.insert('userProfiles', {
        firebaseUid,
        llmPreferences: nextPreferences,
        lastSeenAt: now,
        updatedAt,
      });
    }

    return await getCurrentUserRecordInternal(ctx, firebaseUid);
  },
});

