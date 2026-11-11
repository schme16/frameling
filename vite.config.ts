import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The page (renderer) only. The main and preload processes are bundled by scripts/build-main.mjs.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  // The repo's public/ folder (help pictures and videos), not src/renderer/public.
  publicDir: '../../public',
  plugins: [react()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome140',
  },
  server: { port: 5199, strictPort: true },
});
