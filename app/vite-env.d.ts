declare const __COMMIT_HASH: string;
declare const __APP_VERSION: string;

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
