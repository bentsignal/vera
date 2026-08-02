interface ImportMetaEnv {
  readonly VITE_HOME_A_CONVEX_URL: string;
  readonly VITE_HOME_A_SITE_URL: string;
  readonly VITE_HOME_B_CONVEX_URL: string;
  readonly VITE_HOME_B_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
