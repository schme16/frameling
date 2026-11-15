// Soft strokes through a real pixel session: the edge falls off, a crisp edge only uses colours that are already there,
// a locked palette is kept, strokes build up, the highlighter leaves lines showing, and smudge carries colour along.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { gridPixels } from '../../src/core/pixelBounds';
import { resetStore, store } from '../../src/core/store';
import { setLive } from '../../src/canvas/controller';
import { setPixelSettings } from '../../src/pixel/settings';
import { PixelSession } from '../../src/tools/pixelSession';
import { SmudgeStroke, SoftStroke, type SoftParams } from '../../src/soft/stroke';
import type { EdgeMode, SoftKind } from '../../src/soft/maths';

const W = 64;
const H = 48;
type C = [number, number, number, number];

const start = () => resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
const layer = () => store().get().doc.layers[0] as PixelLayer;
const session = () => new PixelSession(store().get().doc, layer(), store().get().ui.frame, { adds: true });
const grid = () => {
  const d = Object.values(store().get().doc.drawings).find((x) => x.kind === 'pixel') as PixelDrawing | undefined;
  return d ? gridPixels(d, W, H) : new Uint8ClampedArray(W * H * 4);
};
const at = (g: Uint8ClampedArray, x: number, y: number): C => [g[(y * W + x) * 4], g[(y * W + x) * 4 + 1], g[(y * W + x) * 4 + 2], g[(y * W + x) * 4 + 3]];

const RED: C = [220, 40, 40, 255];

function paint(kind: SoftKind, edge: EdgeMode, from: [number, number], to: [number, number], opts: { hardness?: number; flow?: number; size?: number; color?: C } = {}) {
  const s = session();
  const p: SoftParams = { kind, color: opts.color ?? RED, hardness: opts.hardness ?? 0, edge };
  const stroke = new SoftStroke(s, store().get().doc, layer(), p);
  const size = opts.size ?? 16;
  const flow = opts.flow ?? 1;
  stroke.moveTo({ x: from[0], y: from[1] }, size, flow);
  stroke.moveTo({ x: to[0], y: to[1] }, size, flow);
  expect(s.commit('Soft')).toBe('ok');
}

beforeEach(() => {
  start();
  setPixelSettings({ symmetry: 'off' });
});
afterEach(() => setLive(null));

describe('a soft brush stroke', () => {
  it('is solid in the middle, fades toward the edge and stops at the brush size', () => {
    paint('soft-brush', 'smooth', [32, 24], [32, 24], { hardness: 0, size: 20 });
    const g = grid();
    expect(at(g, 32, 24)[3]).toBeGreaterThan(240);
    const mid = at(g, 38, 24)[3];
    const edge = at(g, 41, 24)[3];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(at(g, 32, 24)[3]);
    expect(edge).toBeLessThan(mid);
    expect(at(g, 45, 24)[3]).toBe(0);
    // Every pixel it touched is the brush colour, only more or less see-through.
    for (let x = 22; x < 42; x++) if (at(g, x, 24)[3] > 0) expect(at(g, x, 24).slice(0, 3)).toEqual([220, 40, 40]);
  });

  it('a low flow is lighter than a full one', () => {
    paint('soft-brush', 'smooth', [20, 24], [20, 24], { flow: 0.3, size: 12, hardness: 1 });
    paint('soft-brush', 'smooth', [44, 24], [44, 24], { flow: 1, size: 12, hardness: 1 });
    const g = grid();
    expect(at(g, 20, 24)[3]).toBeGreaterThan(60);
    expect(at(g, 20, 24)[3]).toBeLessThan(at(g, 44, 24)[3]);
  });

  it('a stroke that crosses itself does not darken where it crosses', () => {
    const s = session();
    const stroke = new SoftStroke(s, store().get().doc, layer(), { kind: 'soft-brush', color: RED, hardness: 0.5, edge: 'smooth' });
    for (const p of [[16, 10], [48, 10], [48, 12], [16, 12], [16, 10]]) stroke.moveTo({ x: p[0], y: p[1] }, 10, 0.4);
    s.commit('Cross');
    const g = grid();
    // 0.4 of full, a little under at most (the fade), never more.
    for (let x = 16; x < 48; x++) expect(at(g, x, 11)[3]).toBeLessThanOrEqual(Math.round(0.4 * 255) + 1);
  });

  it('a second stroke over the first builds the colour up', () => {
    paint('soft-brush', 'smooth', [32, 24], [32, 24], { flow: 0.4, size: 10, hardness: 1 });
    const one = at(grid(), 32, 24)[3];
    paint('soft-brush', 'smooth', [32, 24], [32, 24], { flow: 0.4, size: 10, hardness: 1 });
    const two = at(grid(), 32, 24)[3];
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThan(255);
  });

  it('holding still builds the airbrush up', () => {
    const s = session();
    const stroke = new SoftStroke(s, store().get().doc, layer(), { kind: 'airbrush', color: RED, hardness: 0, edge: 'smooth' });
    stroke.moveTo({ x: 32, y: 24 }, 20, 0.3);
    const before = s.get(32, 24)[3];
    for (let i = 0; i < 12; i++) stroke.hold(20, 0.3);
    expect(s.get(32, 24)[3]).toBeGreaterThan(before);
    s.discard();
  });

  it('is the same wherever the pointer reports from, so a fast drag is as even as a slow one', () => {
    paint('soft-brush', 'smooth', [10, 24], [54, 24], { hardness: 0.3, size: 10 });
    const fast = grid();
    start();
    const s = session();
    const stroke = new SoftStroke(s, store().get().doc, layer(), { kind: 'soft-brush', color: RED, hardness: 0.3, edge: 'smooth' });
    for (let x = 10; x <= 54; x += 1) stroke.moveTo({ x, y: 24 }, 10, 1);
    s.commit('Slow');
    const slow = grid();
    for (let x = 16; x < 48; x++) expect(Math.abs(at(fast, x, 24)[3] - at(slow, x, 24)[3])).toBeLessThanOrEqual(3);
  });
});

describe('a crisp edge', () => {
  it('uses only the brush colour or nothing: no see-through pixels, no new colours', () => {
    paint('soft-brush', 'crisp', [32, 24], [40, 24], { hardness: 0, size: 20 });
    const g = grid();
    let on = 0;
    for (let i = 0; i < W * H; i++) {
      const a = g[i * 4 + 3];
      expect([0, 255]).toContain(a);
      if (a) {
        on++;
        expect([g[i * 4], g[i * 4 + 1], g[i * 4 + 2]]).toEqual([220, 40, 40]);
      }
    }
    expect(on).toBeGreaterThan(100);
  });

  it('still reads as soft: denser in the middle than at the edge', () => {
    paint('soft-brush', 'crisp', [32, 24], [32, 24], { hardness: 0, size: 30 });
    const g = grid();
    const count = (r0: number, r1: number) => {
      let n = 0;
      let total = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 24);
          if (d >= r0 && d < r1) {
            total++;
            if (g[(y * W + x) * 4 + 3]) n++;
          }
        }
      return n / total;
    };
    expect(count(0, 4)).toBeGreaterThan(0.8);
    expect(count(4, 9)).toBeGreaterThan(count(9, 14));
    expect(count(9, 14)).toBeGreaterThan(count(14, 15));
  });

  it('the soft eraser dithers away what is there instead of making half see-through pixels', () => {
    paint('soft-brush', 'crisp', [32, 24], [32, 24], { hardness: 1, size: 40 });
    paint('soft-eraser', 'crisp', [32, 24], [32, 24], { hardness: 0, size: 24 });
    const g = grid();
    let gone = 0;
    for (let i = 0; i < W * H; i++) expect([0, 255]).toContain(g[i * 4 + 3]);
    for (let y = 18; y < 31; y++) for (let x = 26; x < 39; x++) if (!g[(y * W + x) * 4 + 3]) gone++;
    expect(gone).toBeGreaterThan(40);
    expect(at(g, 32, 24)[3]).toBe(0);
    expect(at(g, 32, 6)[3]).toBe(255);
  });
});

describe('a palette-locked layer', () => {
  it('only ever ends up with palette colours', () => {
    store().get().doc.palette = { name: 'Two', colors: ['#dc2828', '#2828dc', '#ffffff'] };
    (layer() as PixelLayer).paletteLock = true;
    paint('soft-brush', 'crisp', [20, 24], [44, 24], { hardness: 0.2, size: 18, color: [200, 60, 60, 255] });
    paint('highlighter', 'crisp', [20, 28], [44, 28], { hardness: 0.9, size: 14, color: [240, 220, 40, 255] });
    const g = grid();
    const allowed = new Set(['220,40,40', '40,40,220', '255,255,255']);
    let seen = 0;
    for (let i = 0; i < W * H; i++) {
      if (!g[i * 4 + 3]) continue;
      seen++;
      expect(g[i * 4 + 3]).toBe(255);
      expect(allowed.has(`${g[i * 4]},${g[i * 4 + 1]},${g[i * 4 + 2]}`)).toBe(true);
    }
    expect(seen).toBeGreaterThan(50);
  });
});

describe('the highlighter', () => {
  it('leaves a dark line showing and tints what is light', () => {
    paint('soft-brush', 'smooth', [10, 20], [54, 20], { hardness: 1, size: 3, color: [0, 0, 0, 255] });
    paint('soft-brush', 'smooth', [10, 30], [54, 30], { hardness: 1, size: 12, color: [255, 255, 255, 255] });
    paint('highlighter', 'smooth', [10, 20], [54, 30], { hardness: 1, size: 14, flow: 1, color: [255, 230, 0, 255] });
    const g = grid();
    // On the white strip it is yellow, on the black line it stays black.
    expect(at(g, 32, 30).slice(0, 3)).toEqual([255, 230, 0]);
    expect(at(g, 10, 20).slice(0, 3)).toEqual([0, 0, 0]);
  });
});

describe('mirror drawing', () => {
  it('puts the soft dab on both sides of the line', () => {
    setPixelSettings({ symmetry: 'h' });
    paint('soft-brush', 'smooth', [10, 24], [14, 24], { hardness: 0.3, size: 10 });
    const g = grid();
    for (let x = 0; x < W / 2; x++) for (let y = 14; y < 34; y++) expect(at(g, x, y)[3]).toBe(at(g, W - 1 - x, y)[3]);
    expect(at(g, 12, 24)[3]).toBeGreaterThan(200);
    expect(at(g, W - 1 - 12, 24)[3]).toBeGreaterThan(200);
  });
});

function smudged(edge: EdgeMode) {
  start();
  // Red on the left, blue on the right, a hard seam at x = 32, over a band of rows.
  const bands = session();
  for (let y = 14; y < 34; y++) for (let x = 0; x < W; x++) bands.set(x, y, x < 32 ? [220, 40, 40, 255] : [40, 40, 220, 255]);
  bands.commit('Bands');
  const s = session();
  const sm = new SmudgeStroke(s, { kind: 'smudge', color: RED, hardness: 0.3, edge }, 16);
  for (let x = 20; x <= 50; x += 1) sm.moveTo({ x, y: 24 }, 12, 0.7);
  expect(s.commit('Smudge')).toBe('ok');
  return grid();
}

describe('smudge', () => {
  it('drags colour from where you press into where you drag', () => {
    const g = smudged('smooth');
    // Blue far to the right is untouched; just right of the seam the red has been pushed in.
    expect(at(g, 60, 24).slice(0, 3)).toEqual([40, 40, 220]);
    const near = at(g, 40, 24);
    expect(near[0]).toBeGreaterThan(40);
    expect(near[3]).toBe(255);
  });

  it('on a crisp layer only moves pixels about, so it never makes a colour', () => {
    const g = smudged('crisp');
    let moved = 0;
    for (let i = 0; i < W * H; i++) {
      if (!g[i * 4 + 3]) continue;
      const k = `${g[i * 4]},${g[i * 4 + 1]},${g[i * 4 + 2]}`;
      expect(['220,40,40', '40,40,220']).toContain(k);
      if (k === '220,40,40' && i % W > 33) moved++;
    }
    expect(moved).toBeGreaterThan(5);
  });
});
