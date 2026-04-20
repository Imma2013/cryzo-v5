import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import type { Value } from 'convex/values';

function readStringParam(params: Record<string, Value | undefined>, key: string) {
  const value = params[key];

  return typeof value === 'string' ? value.trim() : '';
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: (params: Record<string, Value | undefined>) => {
        const email = readStringParam(params, 'email').toLowerCase();

        if (!email) {
          throw new Error('Email is required.');
        }

        const name = readStringParam(params, 'name');

        return {
          email,
          ...(name ? { name } : {}),
        };
      },
    }),
  ],
});
