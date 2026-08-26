/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH0_DOMAIN: string;
  readonly VITE_AUTH0_CLIENT_ID: string;
  // Override the default same-origin endpoints (relative paths, proxied by
  // Vite/nginx) with absolute URLs -- used by the E2E harness to point the
  // built app directly at mock servers with no reverse proxy involved.
  readonly VITE_GRAPHQL_URL?: string;
  readonly VITE_LLM_LOOKUP_URL?: string;
  readonly VITE_LLM_UPLOAD_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
