import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

// The page (renderer) only. The main and preload processes are bundled by scripts/build-main.mjs.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  // The repo's public/ folder (help pictures and videos), not src/renderer/public.
  publicDir: '../../public',
  plugins: [react()],
  // The web build has no desktop side to ask for the version (src/platform).
  define: { __FRAMELING_VERSION__: JSON.stringify(version) },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome140',
  },
  server: { port: 5199, strictPort: true },
});
