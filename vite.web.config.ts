// The web build: the same page as the desktop app, built into dist/web/ as plain static files that work from any
// folder of any web server (relative paths). It adds the bits a browser needs to install it and run it offline: a
// manifest, the Quill icons and a service worker that keeps a copy of the app.
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, PluginOption, UserConfig } from 'vite';
import base from './vite.config';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'dist/web');
const ICON_SIZES = [48, 64, 128, 256, 512];

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? listFiles(full, `${prefix}${n}/`) : [`${prefix}${n}`];
  });
}

function webApp(version: string): Plugin {
  return {
    name: 'frameling-web-app',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" type="image/png" sizes="32x32" href="./icons/32x32.png" />
    <link rel="apple-touch-icon" href="./icons/256x256.png" />
    <meta name="theme-color" content="#17151f" />
    <meta name="description" content="A friendly tool for drawing and animating 2D art, vector and pixel alike." />
  </head>`,
      );
    },
    closeBundle() {
      mkdirSync(path.join(out, 'icons'), { recursive: true });
      for (const s of [32, ...ICON_SIZES]) copyFileSync(path.join(root, `build/icons/${s}x${s}.png`), path.join(out, `icons/${s}x${s}.png`));
      const manifest = {
        name: 'Frameling',
        short_name: 'Frameling',
        description: 'A friendly tool for drawing and animating 2D art, vector and pixel alike.',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#17151f',
        theme_color: '#17151f',
        icons: ICON_SIZES.map((s) => ({ src: `icons/${s}x${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' })),
        file_handlers: [{ action: './', accept: { 'application/x-frameling': ['.frameling'], 'application/vnd.frameling.playable+zip': ['.flplay'] } }],
      };
      writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

      // The service worker keeps the app itself (everything but the help videos, which are fetched when watched).
      const files = listFiles(out).filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.endsWith('.mp4'));
      const cache = `frameling-${version}-${Date.now().toString(36)}`;
      writeFileSync(
        path.join(out, 'sw.js'),
        `// Written by vite.web.config.ts. Keeps a copy of Frameling so it opens offline.
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('frameling-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Pages: the network first, so an update shows up; the saved copy when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); } return res; }).catch(() => caches.match('./')));
    return;
  }
  // Everything else is versioned by name, so the saved copy wins; anything new (a help video) is saved once fetched.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`,
      );
    },
  };
}

const version = JSON.parse(String(base.define?.__FRAMELING_VERSION__ ?? '"0.0.0"')) as string;

// Spread rather than mergeConfig, which would add the targets to the desktop one instead of replacing it.
export default {
  ...base,
  plugins: [...((base.plugins ?? []) as PluginOption[]), webApp(version)],
  build: {
    ...base.build,
    outDir: '../../dist/web',
    // Browsers from about two years back, not only the Chrome inside the desktop app.
    target: ['chrome120', 'edge120', 'firefox121', 'safari17'],
  },
  preview: { port: 5198, strictPort: true },
} satisfies UserConfig;
