// Dry strokes through a real pixel session: the pigment is the stick's colour only, a light stroke is a thinning of a hard
// one on the same paper, a second pass builds up, a crisp grain is all or nothing, and a locked palette is kept.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { gridPixels } from '../../src/core/pixelBounds';
import { resetStore, store } from '../../src/core/store';
import { setLive } from '../../src/canvas/controller';
import { setPixelSettings } from '../../src/pixel/settings';
import { PixelSession } from '../../src/tools/pixelSession';
import { DryStroke, type DryParams } from '../../src/dry/stroke';
import { mediumInfo, type DryId, type Medium } from '../../src/dry/maths';
import type { PaperKind } from '../../src/dry/paper';
import type { EdgeMode } from '../../src/soft/maths';

const W = 96;
const H = 64;
type C = [number, number, number, number];
const start = () => resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
const layer = () => store().get().doc.layers[0] as PixelLayer;
const session = () => new PixelSession(store().get().doc, layer(), store().get().ui.frame, { adds: true });
const grid = () => {
  const d = Object.values(store().get().doc.drawings).find((x) => x.kind === 'pixel') as PixelDrawing | undefined;
  return d ? gridPixels(d, W, H) : new Uint8ClampedArray(W * H * 4);
};
const alphaAt = (g: Uint8ClampedArray, x: number, y: number) => g[(y * W + x) * 4 + 3];
const INK: C = [30, 28, 34, 255];

interface Opts {
  id?: DryId;
  medium?: Partial<Medium>;
  paper?: PaperKind;
  edge?: EdgeMode;
  press?: number;
  size?: number;
  hardness?: number;
  from?: [number, number];
  to?: [number, number];
  color?: C;
}

function paint(o: Opts = {}) {
  const s = session();
  const medium = { ...mediumInfo(o.id ?? 'compressed-charcoal'), streak: 0, ...o.medium };
  const p: DryParams = { medium, paper: o.paper ?? 'medium', color: o.color ?? INK, hardness: o.hardness ?? 1, edge: o.edge ?? 'smooth' };
  const stroke = new DryStroke(s, store().get().doc, layer(), p);
  const [x0, y0] = o.from ?? [12, 32];
  const [x1, y1] = o.to ?? [84, 32];
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) stroke.moveTo({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }, o.size ?? 12, o.press ?? 0.8);
  expect(s.commit('Dry')).toBe('ok');
}

/** The total see-through coverage of the picture, in pixels' worth. */
function ink(g: Uint8ClampedArray): number {
  let s = 0;
  for (let i = 3; i < g.length; i += 4) s += g[i] / 255;
  return s;
}

beforeEach(() => {
  start();
  setPixelSettings({ symmetry: 'off' });
});
afterEach(() => setLive(null));

describe('a dry stroke', () => {
  it('lays only the stick colour, with some pixels bare and some covered', () => {
    paint({ press: 0.5 });
    const g = grid();
    let bare = 0;
    let some = 0;
    for (let y = 26; y < 38; y++)
      for (let x = 20; x < 76; x++) {
        const a = alphaAt(g, x, y);
        if (a === 0) bare++;
        else {
          some++;
          expect([g[(y * W + x) * 4], g[(y * W + x) * 4 + 1], g[(y * W + x) * 4 + 2]]).toEqual([30, 28, 34]);
        }
      }
    expect(bare).toBeGreaterThan(50);
    expect(some).toBeGreaterThan(200);
  });

  it('leaves partial pixels, not just on and off: the grain is see-through', () => {
    paint({ press: 0.5 });
    const g = grid();
    let partial = 0;
    for (let i = 3; i < g.length; i += 4) if (g[i] > 20 && g[i] < 235) partial++;
    expect(partial).toBeGreaterThan(100);
  });

  it('stays inside the stick width, with a little dust at the edge', () => {
    paint({ size: 12, hardness: 1 });
    const g = grid();
    for (let x = 20; x < 76; x++) {
      expect(alphaAt(g, x, 32 - 9)).toBe(0);
      expect(alphaAt(g, x, 32 + 9)).toBe(0);
    }
  });

  it('is darker when pressed harder', () => {
    paint({ press: 0.25 });
    const light = ink(grid());
    start();
    paint({ press: 0.9 });
    expect(ink(grid())).toBeGreaterThan(light * 1.5);
  });

  it('catches the same bumps of paper at any pressure: a light stroke is a thinning of a hard one', () => {
    paint({ press: 0.3, from: [12, 20], to: [84, 20] });
    paint({ press: 0.9, from: [12, 44], to: [84, 44] });
    const g = grid();
    // The paper repeats every 256 pixels and is the same under both, but they sit on different rows, so compare through a
    // stroke laid on the same row twice instead.
    start();
    paint({ press: 0.3 });
    const light = grid();
    start();
    paint({ press: 0.9 });
    const hard = grid();
    let lightOnly = 0;
    let lightOn = 0;
    for (let y = 26; y < 38; y++)
      for (let x = 20; x < 76; x++) {
        if (alphaAt(light, x, y) > 128) {
          lightOn++;
          if (alphaAt(hard, x, y) < 128) lightOnly++;
        }
      }
    expect(lightOn).toBeGreaterThan(40);
    expect(lightOnly / lightOn).toBeLessThan(0.03);
    expect(g.length).toBe(W * H * 4);
  });

  it('builds up on a second pass over the same place, and fills pits the first skipped', () => {
    paint({ press: 0.4 });
    const one = ink(grid());
    paint({ press: 0.4 });
    const two = ink(grid());
    expect(two).toBeGreaterThan(one * 1.15);
  });

  it('does not darken where one stroke crosses itself', () => {
    const s = session();
    const stroke = new DryStroke(s, store().get().doc, layer(), { medium: { ...mediumInfo('compressed-charcoal'), streak: 0 }, paper: 'medium', color: INK, hardness: 1, edge: 'smooth' });
    for (const p of [[16, 20], [80, 20], [80, 23], [16, 23], [16, 20]]) stroke.moveTo({ x: p[0], y: p[1] }, 10, 0.5);
    s.commit('Cross');
    const one = ink(grid());
    start();
    paint({ press: 0.5, size: 10, from: [16, 20], to: [80, 20] });
    paint({ press: 0.5, size: 10, from: [16, 23], to: [80, 23] });
    // Two passes as separate strokes build up more than one stroke crossing itself.
    expect(ink(grid())).toBeGreaterThan(one);
  });

  it('is the same wherever the pointer reports from, so a fast drag is as even as a slow one', () => {
    paint({ press: 0.6 });
    const fast = grid();
    start();
    const s = session();
    const stroke = new DryStroke(s, store().get().doc, layer(), { medium: { ...mediumInfo('compressed-charcoal'), streak: 0 }, paper: 'medium', color: INK, hardness: 1, edge: 'smooth' });
    for (let x = 12; x <= 84; x += 1) stroke.moveTo({ x, y: 32 }, 12, 0.6);
    s.commit('Slow');
    const slow = grid();
    let off = 0;
    for (let y = 26; y < 38; y++) for (let x = 20; x < 76; x++) if (Math.abs(alphaAt(fast, x, y) - alphaAt(slow, x, y)) > 8) off++;
    expect(off).toBeLessThan(25);
  });

  it('feels each paper differently', () => {
    paint({ press: 0.4, paper: 'smooth' });
    const a = grid();
    start();
    paint({ press: 0.4, paper: 'rough' });
    const b = grid();
    let differ = 0;
    for (let y = 26; y < 38; y++) for (let x = 20; x < 76; x++) if (Math.abs(alphaAt(a, x, y) - alphaAt(b, x, y)) > 40) differ++;
    expect(differ).toBeGreaterThan(80);
  });
});

describe('streaks along the stroke', () => {
  it('run with the way you drag: a stick with streaks varies across the stroke more than along it', () => {
    const across = (id: DryId, streak: number) => {
      start();
      paint({ id, medium: { streak, tooth: 0 }, press: 0.5, size: 14, hardness: 1 });
      const g = grid();
      // The grain is off (tooth 0), so what varies is the streaks: compare how much each row differs from the next with how much each column does.
      let rows = 0;
      let cols = 0;
      for (let y = 27; y < 37; y++) for (let x = 24; x < 72; x++) {
        rows += Math.abs(alphaAt(g, x, y) - alphaAt(g, x, y + 1));
        cols += Math.abs(alphaAt(g, x, y) - alphaAt(g, x + 1, y));
      }
      return { rows, cols };
    };
    const r = across('compressed-charcoal', 0.9);
    expect(r.rows).toBeGreaterThan(r.cols * 2);
    const flat = across('compressed-charcoal', 0);
    expect(flat.rows + flat.cols).toBeLessThan(r.rows);
  });
});

describe('a crisp grain', () => {
  it('uses the stick colour or nothing: no see-through pixels, no new colours', () => {
    paint({ edge: 'crisp', press: 0.5 });
    const g = grid();
    let on = 0;
    for (let i = 0; i < W * H; i++) {
      const a = g[i * 4 + 3];
      expect([0, 255]).toContain(a);
      if (a) {
        on++;
        expect([g[i * 4], g[i * 4 + 1], g[i * 4 + 2]]).toEqual([30, 28, 34]);
      }
    }
    expect(on).toBeGreaterThan(150);
  });

  it('still gets darker with pressure', () => {
    paint({ edge: 'crisp', press: 0.3 });
    const light = ink(grid());
    start();
    paint({ edge: 'crisp', press: 0.9 });
    expect(ink(grid())).toBeGreaterThan(light * 1.5);
  });
});

describe('a locked palette', () => {
  it('only ever gets palette colours', () => {
    store().update('lock', (d) => {
      const l = d.layers[0] as PixelLayer;
      l.paletteLock = true;
      d.palette = { name: 'two', colors: ['#1e1c22', '#e8e0d0'] } as never;
    });
    paint({ edge: 'crisp', press: 0.6, color: [30, 28, 34, 255] });
    const g = grid();
    for (let i = 0; i < W * H; i++) if (g[i * 4 + 3]) expect([g[i * 4], g[i * 4 + 1], g[i * 4 + 2]]).toEqual([30, 28, 34]);
  });
});

describe('every medium', () => {
  it('draws something with its own colour and leaves some paper showing at a light touch', () => {
    for (const id of ['vine-charcoal', 'compressed-charcoal', 'chalk', 'soft-pastel', 'oil-pastel', 'crayon', 'sketch-pencil', 'soft-pencil', 'colour-pencil'] as DryId[]) {
      start();
      const m = mediumInfo(id);
      paint({ id, size: Math.max(6, m.size), press: 0.3, hardness: m.hardness });
      const g = grid();
      expect(ink(g), id).toBeGreaterThan(5);
      let bare = 0;
      let total = 0;
      for (let y = 32 - Math.floor(m.size / 3); y <= 32 + Math.floor(m.size / 3); y++) for (let x = 24; x < 72; x++) {
        total++;
        if (alphaAt(g, x, y) < 40) bare++;
      }
      expect(bare / total, id).toBeGreaterThan(0.1);
    }
  });
});
