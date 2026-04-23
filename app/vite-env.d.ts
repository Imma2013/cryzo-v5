declare const __COMMIT_HASH: string;
declare const __APP_VERSION: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_ACCESS_TOKEN?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
