/// <reference types="vite/client" />

interface Window {
  frameling: {
    platform: string;
    versions: { app: string; electron: string; chrome: string };
  };
}
