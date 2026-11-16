// The plain parts of scripts/panels-sheet.cjs: which panels and documents, how crops are packed, what counts as a
// panel that failed to show. The Electron run itself is documented in docs/testing.md.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findTemplate } from '../../src/templates';

const require = createRequire(import.meta.url);
const root = path.join(__dirname, '../..');
const sheet = require(path.join(root, 'scripts/lib/sheet-layout.cjs')) as {
  SEEDS: Record<string, string>;
  DOCS: Record<string, string>;
  docFor: (id: string, forced?: string) => string;
  panelList: (all: string[], o?: { only?: string[]; skip?: string[] }) => { ids: string[]; missing: string[] };
  packRows: (boxes: { w: number; h: number }[], o?: { width?: number; gap?: number; margin?: number }) => { placed: { x: number; y: number }[]; width: number; height: number };
  judgePixels: (bitmap: Uint8Array) => 'blank' | 'ok';
  trimmedHeight: (bitmap: Uint8Array, w: number, h: number, o?: { pad?: number; minH?: number; edge?: number }) => number;
  problemOf: (facts: { error?: string; found?: boolean; broken?: string | null; pixels?: string }) => string | null;
};

/** A BGRA bitmap of one colour, with the given rows (y0 to y1) painted another colour across the middle. */
function bitmap(w: number, h: number, paint?: { y0: number; y1: number }): Uint8Array {
  const b = new Uint8Array(w * h * 4).fill(240);
  if (paint) for (let y = paint.y0; y < paint.y1; y++) for (let x = 20; x < w - 20; x++) b[(y * w + x) * 4] = 10;
  return b;
}

describe('panel list', () => {
  it('keeps the app order, once each', () => {
    expect(sheet.panelList(['a', 'b', 'a', 'c']).ids).toEqual(['a', 'b', 'c']);
  });
  it('narrows with only and skip, and names a panel that is not there', () => {
    expect(sheet.panelList(['a', 'b', 'c'], { only: ['c', 'a'] }).ids).toEqual(['a', 'c']);
    expect(sheet.panelList(['a', 'b', 'c'], { skip: ['b'] }).ids).toEqual(['a', 'c']);
    expect(sheet.panelList(['a', 'b'], { only: ['a', 'nope'] }).missing).toEqual(['nope']);
  });
});

describe('documents and seeds', () => {
  it('uses Bouncing ball unless a panel needs another, and --doc beats both', () => {
    expect(sheet.docFor('layers')).toBe('bouncing-ball');
    expect(sheet.docFor('lipsync')).toBe('lip-sync');
    expect(sheet.docFor('lipsync', 'blank-vector')).toBe('blank-vector');
  });
  it('every document it names is a real template', () => {
    for (const id of new Set(Object.values(sheet.DOCS))) expect(findTemplate(id), `${id} is not a template`).toBeTruthy();
  });
  it('every seed it names has a hook in the debug bundle', () => {
    const src = readFileSync(path.join(root, 'src/renderer/debug.ts'), 'utf8');
    const seed = src.slice(src.indexOf('seed: {'));
    for (const hook of new Set(Object.values(sheet.SEEDS))) expect(seed, `no seed.${hook}`).toMatch(new RegExp(`\\n      ${hook}: `));
  });
});

describe('packing', () => {
  it('fills a row, then starts the next under the tallest box', () => {
    const r = sheet.packRows([{ w: 300, h: 100 }, { w: 300, h: 250 }, { w: 300, h: 80 }], { width: 700, gap: 10, margin: 20 });
    expect(r.placed).toEqual([{ x: 20, y: 20 }, { x: 330, y: 20 }, { x: 20, y: 280 }]);
    expect(r.height).toBe(280 + 80 + 20);
  });
  it('gives a box wider than the sheet a row of its own and grows the sheet to hold it', () => {
    const r = sheet.packRows([{ w: 100, h: 50 }, { w: 900, h: 50 }], { width: 500, gap: 10, margin: 20 });
    expect(r.placed[1]).toEqual({ x: 20, y: 80 });
    expect(r.width).toBe(940);
  });
});

describe('what a crop looks like', () => {
  it('calls a flat crop blank and a drawn one ok', () => {
    expect(sheet.judgePixels(bitmap(100, 100))).toBe('blank');
    expect(sheet.judgePixels(bitmap(100, 100, { y0: 20, y1: 60 }))).toBe('ok');
  });
  it('cuts the empty space under a short panel, but not under the floor or past the top', () => {
    expect(sheet.trimmedHeight(bitmap(200, 800, { y0: 10, y1: 200 }), 200, 800)).toBe(214);
    expect(sheet.trimmedHeight(bitmap(200, 800, { y0: 10, y1: 20 }), 200, 800)).toBe(90);
    expect(sheet.trimmedHeight(bitmap(200, 100, { y0: 10, y1: 99 }), 200, 100)).toBe(100);
  });
  it('says plainly why a panel is not a picture', () => {
    expect(sheet.problemOf({ found: true, pixels: 'ok' })).toBeNull();
    expect(sheet.problemOf({ found: false })).toMatch(/no panel on screen/);
    expect(sheet.problemOf({ found: true, broken: 'the panel crashed' })).toMatch(/error screen/);
    expect(sheet.problemOf({ found: true, pixels: 'blank' })).toMatch(/drew nothing/);
    expect(sheet.problemOf({ error: 'could not render: boom' })).toBe('could not render: boom');
  });
});
