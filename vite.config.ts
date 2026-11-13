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
  // The beta build's write-only ingest key, from the environment at build time, never from the repository. An
  // ordinary build has none, so it simply has no Send button (src/beta/send.ts).
  define: {
    __FRAMELING_VERSION__: JSON.stringify(version),
    __FRAMELING_INGEST__: JSON.stringify(
      process.env.FRAMELING_INGEST_KEY ? { url: process.env.FRAMELING_INGEST_URL || 'https://project-boards.shanegadsby.com', key: process.env.FRAMELING_INGEST_KEY } : null,
    ),
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome140',
    rolldownOptions: {
      output: {
        // Everything start-up needs goes in one file next to the entry, rather than the dozens of little shared
        // pieces the splitter would make out of what the lazily loaded parts also use. The rest (export, dialogs,
        // most panels) loads on first use, see src/core/lazy.ts.
        codeSplitting: { groups: [{ name: 'app', tags: ['$initial'] }] },
      },
    },
  },
  server: { port: 5199, strictPort: true },
});
