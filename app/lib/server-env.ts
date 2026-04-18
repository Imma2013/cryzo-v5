export type ServerEnv = Record<string, string | undefined>;

export function getServerEnv(context?: { cloudflare?: { env?: Record<string, string> } } | null): ServerEnv {
  return {
    ...(process.env as ServerEnv),
    ...(context?.cloudflare?.env ?? {}),
  };
}
