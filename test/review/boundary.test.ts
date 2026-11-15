// Read-only by construction, checked by looking at what the reviewer's window can reach. The window is the picture window's
// page; if nothing it loads can reach the store, a file writer or the app's desktop calls, then nothing in it can produce an
// edit of a drawing, whatever a reviewer does or a changed copy tries. Also: what the sharer's side accepts from the link
// cannot carry a patch or a document, and the wire list does not even import immer.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readFromReviewer } from '../../src/review/wire';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (existsSync(c) && /\.(tsx?)$/.test(c)) return c;
  return null;
}

/** Every file reachable from `entry` through value imports (an `import type` is gone when it is built, so it reaches nothing). */
function reach(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    const text = readFileSync(f, 'utf8');
    seen.set(f, text);
    const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'|(?:^|\n)\s*import\s+'([^']+)'/g;
    for (const m of text.matchAll(re)) {
      if (m[1]) continue;
      // `import { type A, type B } from` has no value in it either.
      if (m[2] && /^\{[^}]*\}$/.test(m[2].trim()) && m[2].replace(/[{}]/g, '').split(',').every((x) => !x.trim() || x.trim().startsWith('type '))) continue;
      const r = resolve(f, m[3] ?? m[4]);
      if (r) todo.push(r);
    }
  }
  return seen;
}

const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');

describe('the reviewer\'s window cannot reach anything that edits', () => {
  const files = reach(path.join(SRC, 'renderer/popout.tsx'));
  const names = [...files.keys()].map(rel);

  it('loads the picture window and the review layer, so this is looking at the right thing', () => {
    expect(names).toContain('popout/ReviewLayer.tsx');
    expect(names).toContain('popout/replica.ts');
    expect(names).toContain('review/wire.ts');
  });
  it('never reaches the store, the file writers, the desktop side or the share link', () => {
    const bad = names.filter((n) => n === 'core/store.ts' || n.startsWith('io/') || n.startsWith('main/') || n.startsWith('preload/') || n.startsWith('share/') || n.startsWith('livereview/') || n === 'popout/link.ts' || n === 'popout/mirror.ts' || n.startsWith('plugins/'));
    expect(bad).toEqual([]);
  });
  it('never touches the app\'s desktop calls', () => {
    const touching = [...files].filter(([, t]) => /window\.frameling|ipcRenderer|contextBridge/.test(t)).map(([f]) => rel(f));
    expect(touching).toEqual([]);
  });
  it('has no way to write a document: no store, undo, guard or update in anything it loads', () => {
    const hits = [...files].filter(([f, t]) => !rel(f).startsWith('core/') && /\bstore\(\)\s*\.\s*(update|load|undo|redo|setUi)|registerGuard|undoStack|redoStack/.test(t)).map(([f]) => rel(f));
    expect(hits).toEqual([]);
  });
});

describe('what the link can carry', () => {
  it('the list of what a reviewer can say names no patch, no document and no command', () => {
    const text = readFileSync(path.join(SRC, 'review/wire.ts'), 'utf8');
    const from = text.slice(text.indexOf('export type FromReviewer'), text.indexOf('/** Which ids a reviewer item carries'));
    expect(from).not.toMatch(/Patch|Doc\b|command|run\b/);
    expect(text).not.toMatch(/from 'immer'/);
  });
  it('everything that is not on the list is refused', () => {
    for (const t of ['patch', 'doc', 'load', 'save', 'undo', 'update', 'look', 'ink', 'pixels', 'live', 'admitted', 'ack', 'bye', 'pointer']) {
      expect(readFromReviewer({ t, patches: [{ op: 'replace', path: [], value: 1 }], doc: {} }, 1), t).toBeNull();
    }
  });
});
