export type ServerEnv = Record<string, string | undefined>;

export function getProcessEnv(): ServerEnv {
  if (typeof process === 'undefined' || !process.env) {
    return {};
  }

  return process.env as ServerEnv;
}

export function getServerEnv(context?: { cloudflare?: { env?: Record<string, string> } } | null): ServerEnv {
  return {
    ...getProcessEnv(),
    ...(context?.cloudflare?.env ?? {}),
  };
}
