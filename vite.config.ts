import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { lean as leanWords } from './scripts/words/vite-plugin';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

// A beta build talks to the board to send reports, so it needs that one host in its content security policy. An
// ordinary build has no key, never calls out, and keeps the strict policy it has always had.
const ingestKey = process.env.FRAMELING_INGEST_KEY ?? '';
const ingestUrl = process.env.FRAMELING_INGEST_URL || 'https://project-boards.shanegadsby.com';
// FRAMELING_BETA=1 says this is meant to be a beta build. Without a key it would quietly be an ordinary one that
// cannot send, which a tester then reads as their own internet failing, so it stops here instead.
if (process.env.FRAMELING_BETA && !ingestKey) throw new Error('FRAMELING_BETA is set but FRAMELING_INGEST_KEY is not: this would be a build that cannot send reports. Set the key and build again.');
const ingestOrigin = ingestKey ? new URL(ingestUrl).origin : '';

const allowIngest = {
  name: 'frameling-allow-ingest',
  transformIndexHtml(html: string) {
    if (!ingestOrigin) return html;
    return html.replace("default-src 'self';", `default-src 'self'; connect-src 'self' ${ingestOrigin};`);
  },
};

// The page (renderer) only. The main and preload processes are bundled by scripts/build-main.mjs.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  // The repo's public/ folder (help pictures and videos), not src/renderer/public.
  publicDir: '../../public',
  plugins: [react(), allowIngest, leanWords],
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
