/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the CiteVerify API (e.g. https://api.example.com). Empty in dev = Vite proxy. Required in production builds. */
  readonly VITE_API_BASE_URL?: string;
  /** @deprecated Older name for VITE_API_BASE_URL. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
