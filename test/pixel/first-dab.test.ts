// The first dab of a round or square pixel brush paints by whole rows. It must leave exactly what painting every pixel
// one at a time left: the same pixels, the same changed rectangle, the same tiles. The reference below is that old way.
import { afterEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { gridPixels } from '../../src/core/pixelBounds';
import { resetStore, store } from '../../src/core/store';
import { setLive } from '../../src/canvas/controller';
import { brushSpans, type PixelShape } from '../../src/canvas/pixels';
import { PixelSession } from '../../src/tools/pixelSession';
import { shadeInk, solidInk, type Ink } from '../../src/pixel/ink';
import { setPixelSettings } from '../../src/pixel/settings';
import { setPixelSelection } from '../../src/select/pixel-state';
import { PixelStroke } from '../../src/tools/pixelStroke';
import { setTileUi } from '../../src/tiles/state';

const W = 300;
const H = 220;
type C = [number, number, number, number];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

afterEach(() => {
  setLive(null);
  setPixelSettings({ symmetry: 'off', axisX: null, axisY: null });
});

/** A drawing that already has paint on it (blobs, the colour about to be painted, clear gaps), or an empty one. */
function start(busy: boolean, paint: C) {
  setPixelSettings({ symmetry: 'off', axisX: null, axisY: null });
  setPixelSelection(null);
  setTileUi({ tileMode: false });
  resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
  if (!busy) return;
  const r = rng(11);
  const s = new PixelSession(store().get().doc, store().get().doc.layers[0] as PixelLayer, 0);
  for (let i = 0; i < 400; i++) {
    const cx = Math.floor(r() * W);
    const cy = Math.floor(r() * H);
    const c: C = r() < 0.25 ? paint : r() < 0.3 ? [0, 0, 0, 0] : [Math.floor(r() * 256), Math.floor(r() * 256), 90, r() < 0.5 ? 255 : 128];
    for (let k = 0; k < 40; k++) s.set(cx + Math.floor((r() - 0.5) * 40), cy + Math.floor((r() - 0.5) * 30), c);
  }
  s.commit('Busy');
}

const session = () => new PixelSession(store().get().doc, store().get().doc.layers[0] as PixelLayer, 0);
const grid = () => {
  const d = Object.values(store().get().doc.drawings).find((x) => x.kind === 'pixel') as PixelDrawing | undefined;
  return d ? gridPixels(d, W, H) : new Uint8ClampedArray(W * H * 4);
};

/** What the session holds besides the pixels. */
const state = (s: PixelSession) => {
  const p = s as unknown as { changed: boolean; touched: unknown; dirty: unknown; tiles: unknown[] };
  return { changed: p.changed, touched: p.touched, dirty: p.dirty, tiles: p.tiles.map((t) => !!t) };
};
const tileBytes = (s: PixelSession) => (s as unknown as { tiles: (Uint8ClampedArray | undefined)[] }).tiles.map((t) => (t ? Buffer.from(t).toString('base64') : ''));

type Dab = { x: number; y: number; size: number; shape: PixelShape };

/** The old first dab: every pixel of every row through `paint`. */
function slow(s: PixelSession, d: Dab, ink: Ink) {
  const box = (s as unknown as { reach(): { x0: number; y0: number; x1: number; y1: number } }).reach();
  for (const sp of brushSpans(d.size, d.shape)) {
    const y = d.y + sp.y;
    if (y < box.y0 || y > box.y1) continue;
    for (let x = Math.max(box.x0, d.x + sp.x0); x <= Math.min(box.x1, d.x + sp.x1); x++) s.paint(x, y, ink);
  }
}

function same(d: Dab, mk: () => Ink, busy: boolean, paint: C, setUp?: () => void) {
  start(busy, paint);
  setUp?.();
  const a = session();
  slow(a, d, mk());
  const b = session();
  b.stampSpans({ x: d.x, y: d.y }, brushSpans(d.size, d.shape), mk(), null);
  expect(state(b)).toEqual(state(a));
  expect(tileBytes(b)).toEqual(tileBytes(a));
  a.commit('Slow');
  const want = Buffer.from(grid());
  setLive(null);
  start(busy, paint);
  setUp?.();
  const c = session();
  c.stampSpans({ x: d.x, y: d.y }, brushSpans(d.size, d.shape), mk(), null);
  c.commit('Fast');
  expect(Buffer.from(grid()).equals(want)).toBe(true);
}

const dabs: Dab[] = [];
for (const shape of ['square', 'round'] as const) {
  for (const size of [1, 2, 3, 4, 7, 24, 101, 200, 301, 1000]) {
    // Inside, hanging off each edge and corner, right in the middle of a tile, and far off the page.
    for (const [x, y] of [[150, 110], [127, 127], [128, 128], [0, 0], [W - 1, H - 1], [-30, 40], [W + 20, 10], [5, H + 50], [-400, -400], [128, 3]]) dabs.push({ x, y, size, shape });
  }
}

describe('the first dab, whole rows against one pixel at a time', () => {
  for (const [name, paint] of [['a plain colour', [214, 32, 74, 255]], ['a clear colour (the eraser)', [0, 0, 0, 0]], ['a half see-through colour', [10, 200, 60, 128]]] as [string, C][]) {
    it(`${name}, on an empty drawing and a busy one`, () => {
      for (const busy of [false, true]) for (const d of dabs) same(d, () => solidInk(paint), busy, paint);
    });
  }

  it('a colour that is already on the picture changes nothing there and makes no tiles for it', () => {
    const paint: C = [214, 32, 74, 255];
    start(true, paint);
    const s = session();
    // Painting over what was just painted, in one session: the second dab finds every pixel already that colour.
    const ink = solidInk(paint);
    const spans = brushSpans(60, 'round');
    s.stampSpans({ x: 100, y: 100 }, spans, ink, null);
    const before = state(s);
    const bytes = tileBytes(s);
    s.stampSpans({ x: 100, y: 100 }, spans, ink, null);
    expect(state(s)).toEqual(before);
    expect(tileBytes(s)).toEqual(bytes);
  });

  it('a mirror, a selection, an ink that reads the old pixel, and tile mode all still paint as before', () => {
    const paint: C = [30, 160, 220, 255];
    const mk = () => solidInk(paint);
    const d: Dab = { x: 140, y: 100, size: 90, shape: 'round' };
    for (const mode of ['h', 'v', 'both'] as const) same(d, mk, true, paint, () => setPixelSettings({ symmetry: mode, axisX: null, axisY: null }));
    same({ ...d, x: 20, y: 30 }, mk, true, paint, () => setPixelSettings({ symmetry: 'both', axisX: 60, axisY: 40 }));
    // A selection: only the pixels inside it.
    same(d, mk, true, paint, () => {
      const bits = new Uint8Array(W * H);
      for (let y = 60; y < 150; y++) for (let x = 90; x < 200; x++) if ((x + y) % 5 !== 0) bits[y * W + x] = 1;
      setPixelSelection({ width: W, height: H, bits });
    });
    setPixelSelection(null);
    // Tile mode: what goes off one edge comes back on the other.
    for (const at of [[5, 5], [W - 3, H - 2], [150, 100]]) same({ x: at[0], y: at[1], size: 41, shape: 'round' }, mk, true, paint, () => setTileUi({ tileMode: true }));
    setTileUi({ tileMode: false });
    // An ink that is not a plain colour.
    same(d, () => ({ color: (x, y, b, i, out) => ((out[0] = b[i] ^ x), (out[1] = y), (out[2] = 5), (out[3] = 255), (x + y) % 3 !== 0) }), true, paint);
    same(d, () => shadeInk({ colors: ['#d6204a', '#9b1d3a', '#ffffff'] } as never, true), true, paint);
  });

  it('a whole drag with a big brush gives what the same drag gave pixel by pixel', () => {
    const r = rng(5);
    for (const shape of ['square', 'round'] as const) {
      for (const size of [3, 40, 161]) {
        const path: [number, number][] = [[20, 20]];
        for (let i = 0; i < 12; i++) path.push([Math.floor(r() * W), Math.floor(r() * H)]);
        const run = (fast: boolean) => {
          start(true, [214, 32, 74, 255]);
          // The slow run hides the plain colour from the session (an ink that is only a function), so every pixel goes through `paint`.
          const c: C = [214, 32, 74, 255];
          const ink = fast ? undefined : { color: solidInk(c).color };
          const ps = new PixelStroke(store().get().doc, store().get().doc.layers[0] as PixelLayer, 0, { color: c, size, shape, perfect: false, ...(ink ? { ink } : {}) });
          ps.begin({ x: path[0][0], y: path[0][1] });
          for (const p of path.slice(1)) ps.moveTo({ x: p[0], y: p[1] });
          const st = state(ps.session);
          ps.commit('Drag');
          const out = Buffer.from(grid());
          setLive(null);
          return { st, out };
        };
        const a = run(false);
        const b = run(true);
        expect(b.st).toEqual(a.st);
        expect(b.out.equals(a.out)).toBe(true);
      }
    }
  });
});
