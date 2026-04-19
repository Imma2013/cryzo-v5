export type ServerEnv = Record<string, string | undefined>;

function normalizeServerEnvValue(value: string | undefined) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getProcessEnv(): ServerEnv {
  if (typeof process === 'undefined' || !process.env) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(process.env as ServerEnv).map(([key, value]) => [key, normalizeServerEnvValue(value)]),
  );
}

export function getServerEnv(context?: { cloudflare?: { env?: Record<string, string> } } | null): ServerEnv {
  const normalizedCloudflareEnv = Object.fromEntries(
    Object.entries(context?.cloudflare?.env ?? {}).map(([key, value]) => [key, normalizeServerEnvValue(value)]),
  );

  return {
    ...getProcessEnv(),
    ...normalizedCloudflareEnv,
  };
}

export { normalizeServerEnvValue };
