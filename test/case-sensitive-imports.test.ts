// Windows and macOS find files whatever their letter case, Linux doesn't. So an import spelled ./Modal for modal.tsx
// works on the first two and breaks the Linux build (or the other way round). This checks every relative import in
// src/ and test/ names the file exactly as it is on disk. (On Linux a wrong case can't be found at all, so the build
// fails there anyway; this catches it on Windows and macOS before it gets that far.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '/index.ts', '/index.tsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (n.name === 'node_modules' || n.name.startsWith('.')) continue;
    const f = path.join(dir, n.name);
    if (n.isDirectory()) walk(f, out);
    else if (/\.(ts|tsx|mts|mjs)$/.test(n.name)) out.push(f);
  }
  return out;
}

// True when every piece of the path is spelled the way the folder listing spells it.
function exactCase(file: string): boolean {
  const rel = path.relative(root, file).split(path.sep);
  let dir = root;
  for (const part of rel) {
    if (part === '..') return true;
    if (!fs.readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}

it('spells every relative import with the same letter case as the file', () => {
  const bad: string[] = [];
  for (const file of [...walk(path.join(root, 'src')), ...walk(path.join(root, 'test'))]) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"?]+)['"]/g)) {
      const spec = m[1];
      const base = path.resolve(path.dirname(file), spec);
      const hit = EXTS.map((e) => base + e).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (hit && !exactCase(hit)) bad.push(`${path.relative(root, file).split(path.sep).join('/')}: ${spec}`);
    }
  }
  expect(bad).toEqual([]);
});

// Windows and macOS see "rulers.ts" and "Rulers.tsx" as the same module, so `./Rulers` picks the wrong one there.
it('has no two script files in a folder whose names differ only by letter case', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { join, parse } = await import('node:path');
  const clashes: string[] = [];
  const walk = (dir: string) => {
    const seen = new Map<string, string>();
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      const { name, ext } = parse(f);
      if (!/^\.(ts|tsx|js|mjs|cjs)$/.test(ext)) continue;
      const key = name.toLowerCase();
      const other = seen.get(key);
      if (other && other !== name) clashes.push(`${dir}: ${other} / ${name}`);
      seen.set(key, name);
    }
  };
  walk(path.join(root, 'src'));
  expect(clashes).toEqual([]);
});
