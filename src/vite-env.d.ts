/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONSENT_VERSION: string;
  readonly VITE_ENABLE_DEBUG_HUD: string;
  readonly VITE_DEMO_MODE_ENABLED: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
