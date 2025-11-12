/// <reference types="vite/client" />

interface Window {
  __analyticsEnabled?: boolean;
}

interface ImportMetaEnv {
  readonly VITE_FEATURE_SG?: string;
}
