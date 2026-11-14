// Random operations on variations, artboards and the timeline, checked against three rules: undo and redo round-trip,
// a saved and reopened file gives the same pictures on every artboard, and editing a variation never touches its
// original. Seeded, so a failure repeats: the report names the seed and a shrunk list of operations.
// `npm test` runs a modest number of runs (a few seconds); FUZZ_RUNS=25000 npx vitest run test/artboards/fuzz.test.ts
// is the big one (see docs/testing.md). FUZZ_SEED=<n> repeats just that one run.
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newDoc, newPixelDrawing, newVectorLayer, newPixelLayer } from '../../src/core/doc';
import type { Doc, PathShape, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { setChoice } from '../../src/core/choices';
import { setGridPixels } from '../../src/core/pixelBounds';
import { changePaletteColor } from '../../src/pixel/commands';
import { makeVariation, resetVariation, settleVariations, detachVariation, setVariationSize, recolourOpenVariation, sourceOf } from '../../src/artboards/variations';
import { artboardDoc, artboardsOf, activeId, deleteArtboard, duplicateArtboard, findArtboard, switchArtboard, takeContent } from '../../src/artboards/model';
import { loadFile, saveFile } from '../../src/io/file';
import * as T from '../../src/timeline/edit-core';

const rect = (id: string, fill: string, x = 0): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }] }], fill, stroke: null, opacity: 1 });

function build(): Doc {
  const doc = newDoc({ name: 'F', width: 16, height: 16, length: 8, fps: 12 });
  const v = { ...newVectorLayer('V'), id: 'LV' };
  const p = { ...newPixelLayer('P', 1), id: 'LP' };
  const d1: VectorDrawing = { id: 'd1', kind: 'vector', shapes: [rect('s1', '#ff0000'), rect('s2', '#00ff00', 3)] };
  const d2: VectorDrawing = { id: 'd2', kind: 'vector', shapes: [rect('s3', '#0000ff')] };
  const mk = (id: string, dots: [number, number, number[]][]) => { const d = newPixelDrawing(16, 16); d.id = id; const g = new Uint8ClampedArray(16 * 16 * 4); for (const [x, y, c] of dots) g.set(c, (y * 16 + x) * 4); setGridPixels(d, g, 16, 16); return d; };
  const t1 = mk('t1', [[5, 5, [255, 0, 0, 255]], [6, 5, [0, 255, 0, 255]]]);
  const t2 = mk('t2', [[2, 9, [0, 0, 255, 255]]]);
  doc.drawings = { d1, d2, t1, t2 };
  v.cels = [{ id: 'c1', start: 0, length: 4, drawingId: 'd1' }, { id: 'c2', start: 4, length: 4, drawingId: 'd2' }];
  p.cels = [{ id: 'c3', start: 0, length: 4, drawingId: 't1' }, { id: 'c4', start: 4, length: 4, drawingId: 't2' }];
  doc.layers = [p, v];
  doc.palette = { name: 'P', colors: ['#ff0000', '#00ff00', '#0000ff'] };
  return doc;
}
const INITIAL = build();

const canon = (x: any): any => {
  if (ArrayBuffer.isView(x)) return { ta: Array.from(x as unknown as ArrayLike<number>) };
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => [k, canon(x[k])]));
  return x;
};
const ser = (v: unknown) => JSON.stringify(canon(v));
const doc = () => store().get().doc;
const update = (label: string, fn: (d: Doc) => void) => store().update(label, (d) => fn(d as Doc));

type Op = { a: string; n: number; m: number };
const COLS = ['#101010', '#aa00aa', '#00aaaa', '#ff00ff'];

function apply(o: Op): void {
  const list = artboardsOf(doc());
  switch (o.a) {
    case 'make': update('make', (x) => void makeVariation(x, list.find((b) => !b.variationOf)!.id)); break;
    case 'open': update('open', (x) => void switchArtboard(x, list[o.n % list.length].id)); break;
    case 'recolourV':
      update('recolour', (x) => {
        const l = x.layers.find((q) => q.id === 'LV');
        if (!l) return;
        const c = l.cels[o.n % l.cels.length];
        if (!c) return;
        const dr = x.drawings[c.drawingId] as VectorDrawing;
        const s = dr?.kind === 'vector' ? (dr.shapes[0] as PathShape) : undefined;
        if (s) s.fill = COLS[o.m % COLS.length];
      });
      break;
    case 'paint':
      update('paint', (x) => {
        const l = x.layers.find((q) => q.id === 'LP');
        if (!l) return;
        const c = l.cels[o.n % l.cels.length];
        if (!c) return;
        const dr = x.drawings[c.drawingId] as PixelDrawing;
        if (dr?.kind !== 'pixel') return;
        const g = new Uint8ClampedArray(16 * 16 * 4);
        for (let yy = 0; yy < dr.height; yy++) g.set(dr.pixels.subarray(yy * dr.width * 4, (yy + 1) * dr.width * 4), ((yy + (dr.y ?? 0)) * 16 + (dr.x ?? 0)) * 4);
        g.set([o.m * 20 % 255, 200, 10, 255], ((o.m * 7) % 16 * 16 + (o.m * 3) % 16) * 4);
        setGridPixels(dr, g, 16, 16);
      });
      break;
    case 'newkey':
      update('newkey', (x) => {
        const l = x.layers.find((q) => q.id === 'LV');
        if (!l) return;
        const c = l.cels[0];
        if (!c || c.length < 2) return;
        const id = 'dn' + o.n;
        if (x.drawings[id] || x.layers.some((q) => q.cels.some((k) => k.id === 'cn' + o.n))) return;
        const src = x.drawings[c.drawingId] as VectorDrawing;
        x.drawings[id] = JSON.parse(JSON.stringify({ ...src, id }));
        const half = Math.floor(c.length / 2);
        l.cels.splice(1, 0, { id: 'cn' + o.n, start: c.start + half, length: c.length - half, drawingId: id });
        c.length = half;
      });
      break;
    case 'detach': { const vv = list.filter((b) => b.variationOf); if (vv.length) update('detach', (x) => void detachVariation(x, vv[o.n % vv.length].id)); break; }
    case 'size': { const vv = list.filter((b) => b.variationOf); if (vv.length) update('size', (x) => void setVariationSize(x, vv[o.n % vv.length].id, [8, 16, 24, 32][o.m % 4], [8, 16, 12][o.m % 3])); break; }
    case 'dup': update('dup', (x) => void duplicateArtboard(x, list[o.n % list.length].id)); break;
    case 'del': if (list.length > 1) update('del', (x) => void deleteArtboard(x, list[o.n % list.length].id)); break;
    case 'recolourVar': update('rv', (x) => void recolourOpenVariation(x, [{ from: ['#ff0000', '#00ff00', '#0000ff'][o.n % 3], to: COLS[o.m % 4] }])); break;
    case 'moveKey':
      update('move', (x) => { const l = x.layers.find((q) => q.id === 'LV'); if (l && l.cels.length > 1) { const c = l.cels[l.cels.length - 1]; c.start = Math.max(l.cels[l.cels.length - 2].start + 1, Math.min(7, c.start + (o.m % 2 ? 1 : -1))); } });
      break;
    case 'clipdir':
      update('clip', (x) => { x.clips = [{ id: 'k1', name: 'a', start: 0, end: [2, 3, 5][o.n % 3], loop: o.m % 2 === 0, ...(o.m % 3 === 0 ? { direction: 'pingpong' as const } : {}), ...(o.m % 5 === 0 ? { repeat: 3 } : {}) }]; });
      break;
    case 'addlayer':
      update('addlayer', (x) => { const id = 'LX' + o.n; if (x.layers.some((q) => q.id === id)) return; const l = { ...newVectorLayer('X'), id }; const did = 'dx' + o.n; x.drawings[did] = { id: did, kind: 'vector', shapes: [rect('sx' + o.n, '#ff0000', 2)] } as VectorDrawing; l.cels = [{ id: 'cx' + o.n, start: 0, length: 8, drawingId: did }]; x.layers.splice(o.m % (x.layers.length + 1), 0, l as never); });
      break;
    case 'rmlayer':
      update('rmlayer', (x) => { if (x.layers.length > 1) x.layers.splice(o.n % x.layers.length, 1); });
      break;
    case 'tl': {
      update('tl', (x) => {
        const ls = x.layers; if (!ls.length) return;
        const l = ls[o.n % ls.length];
        const f = o.m % Math.max(1, x.length);
        switch (o.n % 17) {
          case 0: T.newBlankKey(x, l.id, f, false); break;
          case 1: T.newBlankKey(x, l.id, f, true); break;
          case 2: T.duplicateKey(x, l.id, f); break;
          case 3: T.clearKey(x, l.id, f); break;
          case 4: T.deleteKey(x, l.id, f); break;
          case 5: T.insertFrame(x, l.id, f); break;
          case 6: T.removeFrame(x, l.id, f); break;
          case 7: T.setExposure(x, l.id, f, 1 + (o.m % 4)); break;
          case 8: T.duplicateLayer(x, l.id); break;
          case 9: T.deleteLayer(x, l.id); break;
          case 10: T.addVectorLayer(x, l.id); break;
          case 11: T.addPixelLayer(x, l.id, 'p', 1); break;
          case 12: T.setDocLength(x, 4 + (o.m % 8)); break;
          case 13: T.reorderLayer(x, l.id, o.m % ls.length); break;
          case 14: { const c = l.cels[o.m % Math.max(1, l.cels.length)]; if (c) T.moveCel(x, l.id, c.id, (c.start + 1 + (o.m % 3)) % x.length, 'push'); break; }
          case 15: T.addClip(x, 0, Math.min(x.length - 1, 1 + (o.m % 5)), 'k' + o.m, o.m % 2 === 0); break;
          case 16: { const c = x.clips[o.m % Math.max(1, x.clips.length)]; if (c) { if (o.m % 3 === 0) T.setClipDirection(x, c.id, 'pingpong'); else if (o.m % 3 === 1) T.setClipRepeat(x, c.id, 3); else T.removeClip(x, c.id); } break; }
        }
      });
      break;
    }
    case 'undo': store().undo(); break;
    case 'redo': store().redo(); break;
    case 'palette': {
      const cur = doc().palette?.colors ?? [];
      changePaletteColor(o.n % cur.length, COLS[o.m % COLS.length]);
      break;
    }
    case 'reset': {
      const vv = list.filter((b) => b.variationOf);
      if (vv.length) update('reset', (x) => void resetVariation(x, vv[o.n % vv.length].id));
      break;
    }
    case 'layer':
      update('layer', (x) => { const l = x.layers[o.n % x.layers.length]; if (!l) return; l.opacity = [0.5, 1, 0.25][o.m % 3]; });
      break;
  }
}

const OPS = ['tl', 'tl', 'tl', 'tl', 'make', 'open', 'recolourV', 'paint', 'newkey', 'undo', 'redo', 'reset', 'layer', 'detach', 'size', 'dup', 'del', 'recolourVar', 'clipdir', 'addlayer', 'rmlayer', 'open', 'make', 'palette', 'palette'];
function rng(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Where two plain values first differ, with both sides. */
function firstDiff(a: any, b: any, at: string): string {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object')
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const r = firstDiff(a[k], b[k], at + '/' + k);
      if (r) return r;
    }
  return `${at}: ${JSON.stringify(a)?.slice(0, 200)} => ${JSON.stringify(b)?.slice(0, 200)}`;
}

/** The first problem a run has, or null. */
function run(ops: Op[]): string | null {
  resetStore(structuredClone(INITIAL));
  for (let i = 0; i < ops.length; i++) {
    const EDITS = ['tl', 'recolourV', 'paint', 'newkey', 'layer', 'recolourVar', 'size', 'clipdir', 'addlayer', 'rmlayer', 'palette'];
    const before = doc();
    const openA = findArtboard(before, activeId(before));
    const srcA = openA && sourceOf(before, openA);
    const snapOrig = (dd: Doc, id: string) => { const a = findArtboard(dd, id); if (!a) return ''; const c = id === activeId(dd) ? takeContent(dd) : a.content; return ser({ c, d: c && c.layers.flatMap((l) => l.cels.map((q) => dd.drawings[q.drawingId])) }); };
    const o0 = srcA && EDITS.includes(ops[i].a) ? snapOrig(before, srcA.id) : null;
    try {
      apply(ops[i]);
    } catch (e) {
      return `threw at ${i} (${ops[i].a}): ${(e as Error).message}`;
    }
    if (o0 !== null && findArtboard(doc(), srcA!.id) && activeId(doc()) === openA!.id) {
      const o1 = snapOrig(doc(), srcA!.id);
      if (o1 !== o0) return `edit in variation changed its original at ${i} (${ops[i].a})`;
    }
    const d = doc();
    const r = settleVariations(d);
    if (r && ser(produce(d, (x) => void r(x as never))) !== ser(d)) return `not in step after ${i} (${ops[i].a})`;
  }
  try {
    const loaded = loadFile(saveFile(doc())).doc;
    for (const b of artboardsOf(doc())) {
      const norm = (dd: Doc) => ser({ layers: dd.layers.map((l) => ({ ...l, cels: l.cels.map((c) => ({ ...c, drawing: dd.drawings[c.drawingId] && { ...dd.drawings[c.drawingId], id: undefined } })) })), w: dd.width, h: dd.height, len: dd.length, clips: dd.clips });
      const a1 = norm(artboardDoc(doc(), b.id));
      const a2 = norm(artboardDoc(loaded, b.id));
      if (a1 !== a2) {
        return `save/load differs on ${b.id.slice(-4)} at ${firstDiff(JSON.parse(a1), JSON.parse(a2), '')}`;
      }
    }
  } catch (e) {
    return 'save/load threw ' + (e as Error).message;
  }
  let n = 0;
  while (store().canRedo() && n++ < 200) store().redo();
  const top = ser(doc());
  n = 0;
  while (store().canUndo() && n++ < 200) store().undo();
  if (ser(doc()) !== ser(INITIAL)) return 'undo-all differs from the start';
  n = 0;
  while (store().canRedo() && n++ < 200) store().redo();
  if (ser(doc()) !== top) return 'redo-all differs from the top';
  return null;
}

function shrink(ops: Op[], why: string): Op[] {
  let cur = ops;
  const kind = why.replace(/\d+/g, '#').replace(/\(.*?\)/g, '').slice(0, 60);
  let again = true;
  while (again) {
    again = false;
    for (let i = 0; i < cur.length; i++) {
      const t = cur.filter((_, k) => k !== i);
      const w = run(t);
      if (w && w.replace(/\d+/g, '#').replace(/\(.*?\)/g, '').slice(0, 60) === kind.slice(0, 60)) { cur = t; again = true; break; }
    }
  }
  return cur;
}

const RUNS = Math.max(1, Number(process.env.FUZZ_RUNS) || 1000);
const LENGTH = 22;

describe('random operations', () => {
  it(`${RUNS} seeded runs keep undo, saving and variations in step`, { timeout: 30 * 60 * 1000 }, () => {
    setChoice('palette.recolour', 'recolour');
    const only = Number(process.env.FUZZ_SEED) || 0;
    const found = new Map<string, string>();
    for (let seed = only || 1; seed <= (only || RUNS); seed++) {
      const r = rng(seed);
      const ops: Op[] = Array.from({ length: LENGTH }, () => ({ a: OPS[Math.floor(r() * OPS.length)], n: Math.floor(r() * 18), m: Math.floor(r() * 12) }));
      const why = run(ops);
      if (!why) continue;
      const kind = why.replace(/\d+/g, '#').replace(/\(.*?\)/g, '').slice(0, 60);
      if (found.has(kind)) continue;
      const small = shrink(ops, why);
      found.set(kind, `seed ${seed}: ${run(small)}\n` + small.map((o) => `${o.a}(${o.n},${o.m})`).join(' '));
    }
    expect([...found.values()].join('\n----\n')).toBe('');
  });
});
