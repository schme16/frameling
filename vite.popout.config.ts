import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

// The picture window shares some of the app's drawing code, and that code can reach lazily loaded parts of the app (the
// export formats) that this window never opens. They are left out: only what the page loads from the start is kept.
const onlyWhatLoads: Plugin = {
  name: 'frameling-popout-only-what-loads',
  generateBundle(_o, bundle) {
    const keep = new Set<string>();
    const walk = (name: string) => {
      const c = bundle[name];
      if (!c || c.type !== 'chunk' || keep.has(name)) return;
      keep.add(name);
      for (const i of c.imports) walk(i);
    };
    for (const [name, c] of Object.entries(bundle)) if (c.type === 'chunk' && c.isEntry) walk(name);
    for (const [name, c] of Object.entries(bundle)) if (c.type === 'chunk' && !keep.has(name)) delete bundle[name];
  },
};

// The picture window (second window) is its own small page, built apart from the app so it loads none of the app's chunk.
// `npm run build` runs this after the app's own build. In development the Vite server serves popout.html itself.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: false,
  plugins: [react(), onlyWhatLoads],
  define: { __FRAMELING_VERSION__: JSON.stringify(version), __FRAMELING_INGEST__: JSON.stringify(null) },
  build: {
    outDir: '../../dist/popout',
    emptyOutDir: true,
    target: 'chrome140',
    rolldownOptions: { input: 'src/renderer/popout.html' },
  },
});
