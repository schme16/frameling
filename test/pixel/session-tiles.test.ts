// The pixel session copies nothing when it starts and a tile at a time when painting: the result must match a whole-grid edit.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { PixelDrawing, PixelLayer } from '../../src/core/format';
import { gridPixels } from '../../src/core/pixelBounds';
import { resetStore, store } from '../../src/core/store';
import { getLive, setLive } from '../../src/canvas/controller';
import { PixelSession } from '../../src/tools/pixelSession';
import { solidInk } from '../../src/pixel/ink';

const W = 420;
const H = 300;
type C = [number, number, number, number];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const start = () => {
  const s = resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
  return s;
};
const session = () => {
  const { doc, ui } = store().get();
  return new PixelSession(doc, doc.layers[0] as PixelLayer, ui.frame);
};
const wholeGrid = () => gridPixels(Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing, W, H);

afterEach(() => {
  setLive(null);
  vi.unstubAllGlobals();
});

describe('tiled pixel session', () => {
  it('matches a whole-grid edit over many strokes across tile edges, with erasing and a reset', () => {
    start();
    const ref = new Uint8ClampedArray(W * H * 4);
    const r = rng(7);
    for (let stroke = 0; stroke < 12; stroke++) {
      const s = session();
      const mine = new Uint8ClampedArray(ref);
      const n = 40 + Math.floor(r() * 200);
      const pts: [number, number, C][] = [];
      // Strokes sit near a random spot so some stay inside one tile and some cross several.
      const cx = Math.floor(r() * W);
      const cy = Math.floor(r() * H);
      for (let i = 0; i < n; i++) {
        const x = Math.max(0, Math.min(W - 1, cx + Math.floor((r() - 0.5) * 260)));
        const y = Math.max(0, Math.min(H - 1, cy + Math.floor((r() - 0.5) * 200)));
        const c: C = r() < 0.2 ? [0, 0, 0, 0] : [Math.floor(r() * 256), 40, 200, 255];
        pts.push([x, y, c]);
      }
      if (stroke % 4 === 1) {
        // Paint, rubber-band back to the start, paint again.
        for (const [x, y, c] of pts) s.set(x, y, c);
        s.reset();
        for (const [x, y] of pts) expect(s.get(x, y)).toEqual([ref[(y * W + x) * 4], ref[(y * W + x) * 4 + 1], ref[(y * W + x) * 4 + 2], ref[(y * W + x) * 4 + 3]]);
        pts.length = Math.floor(pts.length / 3);
      }
      for (const [x, y, c] of pts) {
        s.set(x, y, c);
        mine.set(c, (y * W + x) * 4);
      }
      expect(s.commit('Stroke')).toBe(pts.length ? 'ok' : 'nothing');
      ref.set(mine);
      expect(Buffer.from(wholeGrid()).equals(Buffer.from(ref))).toBe(true);
    }
  });

  it('inks see the old picture, not what the session has painted', () => {
    start();
    const a = session();
    a.set(200, 100, [10, 20, 30, 255]);
    a.commit('One');
    const s = session();
    s.set(200, 100, [1, 2, 3, 255]);
    const seen: number[] = [];
    s.paint(200, 100, { color: (_x, _y, base, i, out) => (seen.push(base[i], base[i + 3]), (out[0] = 9), (out[1] = 9), (out[2] = 9), (out[3] = 255), true) });
    expect(seen).toEqual([10, 255]);
    expect(s.get(200, 100)).toEqual([9, 9, 9, 255]);
    s.restore(200, 100);
    expect(s.get(200, 100)).toEqual([10, 20, 30, 255]);
    s.set(5, 5, [1, 1, 1, 255]);
    s.stamp({ x: 0, y: 0 }, [{ x: 1, y: 1 }], [7, 7, 7, 255]);
    s.stampInk({ x: 0, y: 0 }, [{ x: 2, y: 2 }], solidInk([8, 8, 8, 255]));
    expect(s.get(1, 1)).toEqual([7, 7, 7, 255]);
    expect(s.get(2, 2)).toEqual([8, 8, 8, 255]);
  });

  it('nothing is made until a pixel is painted, and painting the old colour is not a change', () => {
    start();
    const s = session();
    expect(getLive()).toBeNull();
    s.set(3, 3, [0, 0, 0, 0]);
    expect(s.changed).toBe(false);
    s.flush();
    expect(s.commit('Nothing')).toBe('nothing');
  });

  it('the live canvas covers the old block and the painted area, growing as a stroke goes out', () => {
    const made: { w: number; h: number; puts: unknown[][]; draws: unknown[][] }[] = [];
    class FakeCanvas {
      w: number;
      h: number;
      rec: (typeof made)[number];
      constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.rec = { w, h, puts: [], draws: [] };
        made.push(this.rec);
      }
      getContext() {
        return { putImageData: (...a: unknown[]) => this.rec.puts.push(a), drawImage: (...a: unknown[]) => this.rec.draws.push(a) };
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    start();
    const a = session();
    for (let x = 300; x < 330; x++) a.set(x, 200, [255, 0, 0, 255]);
    a.commit('Block');
    made.length = 0;
    const s = session();
    expect(made.length).toBe(0);
    s.set(10, 10, [0, 255, 0, 255]);
    s.flush();
    const live = getLive();
    expect(live && live.kind === 'pixel').toBe(true);
    if (!live || live.kind !== 'pixel') return;
    // The old block is at (300, 200), the new pixel at (10, 10): the canvas holds both, and is smaller than the grid.
    expect(live.x ?? 0).toBeLessThanOrEqual(10);
    expect(live.y ?? 0).toBeLessThanOrEqual(10);
    expect((live.x ?? 0) + live.width).toBeGreaterThanOrEqual(330);
    expect((live.y ?? 0) + live.height).toBeGreaterThanOrEqual(201);
    const before = made.length;
    s.set(415, 295, [0, 0, 255, 255]);
    s.flush();
    expect(made.length).toBe(before + 1);
    const after = getLive();
    expect(after && after.kind === 'pixel' && after.x === 0 && after.y === 0 && after.width === W && after.height === H).toBe(true);
  });
});
