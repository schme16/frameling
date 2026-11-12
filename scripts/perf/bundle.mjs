// Bundle composition: builds the renderer to a private folder and lists what the initial chunk holds, by source
// folder and by biggest module, so you can see what is worth making lazy.
//   node scripts/perf/bundle.mjs [--top 40] [--web]
import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const top = Number(args[args.indexOf('--top') + 1]) || 40;
const web = args.includes('--web');
const root = new URL('../..', import.meta.url).pathname;
const out = mkdtempSync(join(tmpdir(), 'frameling-bundle-'));
let report;
const only = args.includes('--folder') ? args[args.indexOf('--folder') + 1] : null;
const analyse = {
  name: 'analyse',
  generateBundle(_o, bundle) {
    const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
    const entry = chunks.find((c) => c.isEntry);
    const sum = (c) => ({ name: c.fileName, bytes: Buffer.byteLength(c.code), gzip: gzipSync(c.code).length });
    const folders = new Map();
    const mods = [];
    for (const [id, m] of Object.entries(entry.modules)) {
      const rel = id.replace(root, '').replace(/^.*node_modules\//, 'node_modules/');
      const key = rel.startsWith('node_modules/') ? rel.split('/').slice(0, rel.split('/')[1].startsWith('@') ? 3 : 2).join('/') : rel.split('/').slice(0, 2).join('/');
      folders.set(key, (folders.get(key) ?? 0) + m.renderedLength);
      mods.push([rel, m.renderedLength]);
    }
    // Dominator sizes: for each module, the bytes that load only because of it (everything reachable only through it),
    // i.e. what making every static import of it lazy would take out of the initial chunk.
    const ids = Object.keys(entry.modules);
    const inChunk = new Set(ids);
    const size = new Map(ids.map((id) => [id, entry.modules[id].renderedLength]));
    const edges = new Map(ids.map((id) => [id, (this.getModuleInfo(id)?.importedIds ?? []).filter((i) => inChunk.has(i))]));
    const rootId = this.getModuleInfo(entry.facadeModuleId)?.id ?? entry.facadeModuleId;
    const order = [];
    const seen = new Set();
    const dfs = (id) => { seen.add(id); for (const n of edges.get(id) ?? []) if (!seen.has(n)) dfs(n); order.push(id); };
    dfs(rootId);
    const rpo = order.reverse();
    const idx = new Map(rpo.map((id, i) => [id, i]));
    const preds = new Map(rpo.map((id) => [id, []]));
    for (const id of rpo) for (const n of edges.get(id)) preds.get(n)?.push(id);
    const idom = new Map([[rootId, rootId]]);
    const inter = (a, b) => { while (a !== b) { while (idx.get(a) > idx.get(b)) a = idom.get(a); while (idx.get(b) > idx.get(a)) b = idom.get(b); } return a; };
    for (let changed = true; changed; ) {
      changed = false;
      for (const id of rpo.slice(1)) {
        let d = null;
        for (const p of preds.get(id)) if (idom.has(p)) d = d === null ? p : inter(p, d);
        if (d !== null && idom.get(id) !== d) { idom.set(id, d); changed = true; }
      }
    }
    const dom = new Map(rpo.map((id) => [id, size.get(id)]));
    for (const id of [...rpo].reverse()) if (id !== rootId && idom.has(id)) dom.set(idom.get(id), dom.get(idom.get(id)) + dom.get(id));
    const rel = (id) => id.replace(root, '').replace(/^.*node_modules\//, 'node_modules/');
    const dominated = rpo.filter((id) => id !== rootId).map((id) => [rel(id), dom.get(id), size.get(id), rel(idom.get(id))]).sort((a, b) => b[1] - a[1]);
    report = { dominated, entry: sum(entry), chunks: chunks.length, folders: [...folders].sort((a, b) => b[1] - a[1]), mods: mods.sort((a, b) => b[1] - a[1]), all: chunks.map(sum) };
  },
};
process.chdir(root);
await build({ configFile: join(root, web ? 'vite.web.config.ts' : 'vite.config.ts'), logLevel: 'error', plugins: [analyse], build: { outDir: join(out, 'r'), emptyOutDir: true, reportCompressedSize: false } });
const k = (n) => (n / 1024).toFixed(1).padStart(8) + ' kB';
console.log(`entry ${report.entry.name}: ${k(report.entry.bytes)} raw, ${k(report.entry.gzip)} gzip; ${report.chunks} chunks\n`);
console.log('by folder (rendered bytes, pre-minify)');
for (const [f, n] of report.folders.slice(0, top)) console.log(k(n), f);
console.log('\nmodules that only load because of one importer, by total bytes they pull in (total, own, loaded through)');
for (const [f, n, own, by] of report.dominated.slice(0, top * 2)) console.log(k(n), k(own), f.padEnd(48), '<-', by);
console.log('\nbiggest modules');
if (only) { for (const [f, n] of report.mods.filter(([f]) => f.startsWith(only))) console.log(k(n), f); }
for (const [f, n] of report.mods.slice(0, top)) console.log(k(n), f);
