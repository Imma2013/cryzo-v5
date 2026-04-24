type ServerEnvRecord = Record<string, string | undefined>;

export type ServerEnvSourceName = 'meta' | 'process' | 'context' | 'cloudflare';

export type ServerEnvDiagnostics = {
  keys: Record<'SUPABASE_ANON_KEY' | 'SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY' | 'VITE_SUPABASE_URL', boolean>;
  sourceKeys: Record<ServerEnvSourceName, Partial<Record<keyof ServerEnvDiagnostics['keys'], boolean>>>;
  sources: Record<ServerEnvSourceName, boolean>;
};

const serverEnvDiagnosticsSymbol = Symbol.for('cryzo.serverEnvDiagnostics');

export type ServerEnv = ServerEnvRecord & {
  [serverEnvDiagnosticsSymbol]?: ServerEnvDiagnostics;
};

function normalizeServerEnvValue(value: string | undefined) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeServerEnvRecord(record?: Record<string, unknown> | null): ServerEnvRecord {
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      normalizeServerEnvValue(typeof value === 'string' ? value : undefined),
    ]),
  );
}

function hasAnyServerEnvValue(record: ServerEnvRecord) {
  return Object.values(record).some((value) => value !== undefined);
}

function buildSupabaseKeyDiagnostics(record: ServerEnvRecord) {
  return {
    SUPABASE_ANON_KEY: Boolean(record.SUPABASE_ANON_KEY),
    SUPABASE_URL: Boolean(record.SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: Boolean(record.VITE_SUPABASE_ANON_KEY),
    VITE_SUPABASE_URL: Boolean(record.VITE_SUPABASE_URL),
  };
}

function attachServerEnvDiagnostics(serverEnv: ServerEnvRecord, diagnostics: ServerEnvDiagnostics): ServerEnv {
  Object.defineProperty(serverEnv, serverEnvDiagnosticsSymbol, {
    configurable: false,
    enumerable: false,
    value: diagnostics,
    writable: false,
  });

  return serverEnv as ServerEnv;
}

export function getImportMetaEnv(metaEnv?: Record<string, unknown> | null): ServerEnvRecord {
  if (metaEnv) {
    return normalizeServerEnvRecord(metaEnv);
  }

  if (typeof import.meta === 'undefined' || typeof import.meta.env !== 'object' || import.meta.env === null) {
    return {};
  }

  return normalizeServerEnvRecord(import.meta.env as Record<string, unknown>);
}

export function getProcessEnv(processEnv?: Record<string, unknown> | null): ServerEnvRecord {
  if (processEnv) {
    return normalizeServerEnvRecord(processEnv);
  }

  if (typeof process === 'undefined' || !process.env) {
    return {};
  }

  return normalizeServerEnvRecord(process.env as Record<string, unknown>);
}

export function getServerEnv(
  context?: { cloudflare?: { env?: Record<string, string> }; env?: Record<string, string> } | null,
  options?: {
    metaEnv?: Record<string, unknown> | null;
    processEnv?: Record<string, unknown> | null;
  },
): ServerEnv {
  const normalizedMetaEnv = getImportMetaEnv(options?.metaEnv);
  const normalizedProcessEnv = getProcessEnv(options?.processEnv);
  const normalizedContextEnv = normalizeServerEnvRecord(context?.env);
  const normalizedCloudflareEnv = normalizeServerEnvRecord(context?.cloudflare?.env);
  const mergedEnv = {
    ...normalizedMetaEnv,
    ...normalizedProcessEnv,
    ...normalizedContextEnv,
    ...normalizedCloudflareEnv,
  };

  return attachServerEnvDiagnostics(mergedEnv, {
    keys: buildSupabaseKeyDiagnostics(mergedEnv),
    sourceKeys: {
      meta: buildSupabaseKeyDiagnostics(normalizedMetaEnv),
      process: buildSupabaseKeyDiagnostics(normalizedProcessEnv),
      context: buildSupabaseKeyDiagnostics(normalizedContextEnv),
      cloudflare: buildSupabaseKeyDiagnostics(normalizedCloudflareEnv),
    },
    sources: {
      meta: hasAnyServerEnvValue(normalizedMetaEnv),
      process: hasAnyServerEnvValue(normalizedProcessEnv),
      context: hasAnyServerEnvValue(normalizedContextEnv),
      cloudflare: hasAnyServerEnvValue(normalizedCloudflareEnv),
    },
  });
}

export function getServerEnvDiagnostics(serverEnv?: ServerEnv | null) {
  return serverEnv?.[serverEnvDiagnosticsSymbol];
}

export { normalizeServerEnvValue };
