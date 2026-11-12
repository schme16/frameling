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

  /** Fake canvases that record what is put on them and drawn onto them. */
  const fakes = () => {
    const made: { w: number; h: number; puts: unknown[][]; draws: unknown[][]; ops: string[] }[] = [];
    class FakeCanvas {
      rec: (typeof made)[number];
      constructor(public w: number, public h: number) {
        this.rec = { w, h, puts: [], draws: [], ops: [] };
        made.push(this.rec);
      }
      getContext() {
        const self = this;
        const g = {
          globalCompositeOperation: 'source-over',
          putImageData: (...a: unknown[]) => self.rec.puts.push(a),
          drawImage: (...a: unknown[]) => self.rec.draws.push([...a, g.globalCompositeOperation]),
          save() {},
          restore() {},
          beginPath() {},
          rect() {},
          clip() {},
        };
        return g;
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    return made;
  };

  it('the live preview is sparse: only touched tiles go up (whole, once), over the drawing as it was', () => {
    const made = fakes();
    start();
    const a = session();
    for (let x = 300; x < 330; x++) a.set(x, 200, [255, 0, 0, 255]);
    a.commit('Block');
    const old = Object.values(store().get().doc.drawings).find((d) => d.kind === 'pixel') as PixelDrawing;
    made.length = 0;
    const s = session();
    expect(made.length).toBe(0);
    s.set(10, 10, [0, 255, 0, 255]);
    s.flush();
    const live = getLive();
    expect(live && live.kind === 'pixel').toBe(true);
    if (!live || live.kind !== 'pixel') return;
    // The old block (at 300, 200) is not put on the canvas: only the tile of the new pixel is, whole.
    expect(made.length).toBe(1);
    expect(made[0].puts).toHaveLength(1);
    expect(made[0].puts[0].slice(3)).toEqual([0, 0, 128, 128]);
    expect(live.sparse?.base).toBe(old);
    expect(live.sparse?.tiles).toEqual([{ x: 0, y: 0, w: 128, h: 128 }]);
    // Painting again in the same tile puts only what changed.
    s.set(11, 10, [0, 255, 0, 255]);
    s.flush();
    expect(made[0].puts[1].slice(3)).toEqual([11, 10, 1, 1]);
    // A tile that holds the old block goes up whole with the old pixels in it (the picture there is replaced, not added to).
    s.set(301, 201, [0, 0, 255, 255]);
    s.flush();
    const after = getLive();
    expect(after && after.kind === 'pixel' && after.sparse?.tiles.length).toBe(2);
    const reds = made.flatMap((m) => m.puts).filter((p) => {
      const data = (p[0] as { data: Uint8ClampedArray }).data;
      const o = ((200 & 127) * 128 + (300 & 127)) * 4;
      return data[o] === 255 && data[o + 3] === 255;
    });
    expect(reds.length).toBeGreaterThan(0);
    // The canvas grew as the stroke went out of it, and still holds tiles only.
    s.set(415, 295, [0, 0, 255, 255]);
    s.flush();
    const end = getLive();
    expect(end && end.kind === 'pixel' && end.sparse?.tiles.length).toBe(3);
    // The result is still the old block with the new pixels on it.
    expect(s.commit('Done')).toBe('ok');
    const d = Object.values(store().get().doc.drawings).find((x) => x.kind === 'pixel') as PixelDrawing;
    const grid = gridPixels(d, W, H);
    expect([...grid.slice((200 * W + 300) * 4, (200 * W + 300) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    expect([...grid.slice((10 * W + 10) * 4, (10 * W + 10) * 4 + 4)]).toEqual([0, 255, 0, 255]);
  });

  it('asking for the whole picture makes a canvas over the old block with the old drawing under the tiles, and it stays whole as it grows', () => {
    const made = fakes();
    start();
    const a = session();
    for (let x = 300; x < 330; x++) a.set(x, 200, [255, 0, 0, 255]);
    a.commit('Block');
    made.length = 0;
    const s = session();
    s.set(10, 10, [0, 255, 0, 255]);
    s.flush();
    const live = getLive();
    if (!live || live.kind !== 'pixel' || !live.sparse) throw new Error('expected a sparse preview');
    expect(live.width).toBeLessThan(W);
    live.sparse.fill();
    // A new canvas over the live tile and the old block, the old picture drawn on it (canvas to canvas), then the tile put on it whole.
    const whole = getLive();
    expect(whole && whole.kind === 'pixel' && whole.sparse).toBeUndefined();
    if (!whole || whole.kind !== 'pixel') return;
    const rec = made[1];
    expect(rec.w).toBe(whole.width);
    expect(whole.x ?? 0).toBe(0);
    expect((whole.x ?? 0) + whole.width).toBeGreaterThanOrEqual(330);
    expect((whole.y ?? 0) + whole.height).toBeGreaterThanOrEqual(201);
    expect(rec.draws).toHaveLength(1);
    expect(rec.puts).toHaveLength(1);
    expect(rec.puts[0].slice(3)).toEqual([0, 0, 128, 128]);
    // Growing keeps it whole: the new canvas gets the old picture and the old canvas put back over its own area.
    const before = made.length;
    s.set(415, 295, [0, 0, 255, 255]);
    s.flush();
    const grown = getLive();
    expect(grown && grown.kind === 'pixel' && grown.sparse).toBeUndefined();
    if (made.length > before) expect(made[before].draws.length).toBeGreaterThanOrEqual(2);
  });

  it('a stroke that starts on an empty frame has no old picture to show under the tiles', () => {
    fakes();
    start();
    const s = session();
    s.set(5, 5, [1, 2, 3, 255]);
    s.flush();
    const live = getLive();
    expect(live && live.kind === 'pixel' && live.sparse?.base).toBeNull();
  });
});
