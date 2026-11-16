// What the second window's feed costs the drawing window, per operation, in plain V8 (no windows). Only runs when asked for:
//   CAPTURE_LIVE_COST=1 npx vitest run test/popout/live-cost.test.ts
// The whole-app numbers (real mouse events, both windows) come from scripts/perf/capture-live.cjs.
import { describe, expect, it, vi } from 'vitest';
import { stubCanvas } from './canvas-stub';
import { newDoc } from '../../src/core/doc';
import type { PixelLayer } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { PixelSession } from '../../src/tools/pixelSession';
import { setPixelTap, type PixelFeed } from '../../src/popout/ink';

const on = !!process.env.CAPTURE_LIVE_COST;
const W = 1280;
const H = 720;

function time(fn: () => void, reps: number): number {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return (performance.now() - t0) / reps;
}

describe.skipIf(!on)('what feeding a second window costs', () => {
  it('prints the numbers', () => {
    stubCanvas(vi);
    const rows: string[] = [];
    const strokeOnce = (listen: boolean, size: number) => {
      resetStore(newDoc({ width: W, height: H, pixel: { pixelSize: 1 } }));
      const { doc, ui } = store().get();
      const s = new PixelSession(doc, doc.layers[0] as PixelLayer, ui.frame);
      let feed: PixelFeed | null = null;
      let flushes = 0;
      let bytes = 0;
      if (listen) setPixelTap((f) => void (feed = f));
      const r = size >> 1;
      const t0 = performance.now();
      for (let i = 0; i < 600; i++) {
        const cx = 100 + i * 1.7;
        const cy = 300 + Math.sin(i / 20) * 120;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) s.set(Math.round(cx + x), Math.round(cy + y), [200, 30, 90, 255]);
        s.flush();
        // The link asks once per screen frame: about every fourth flush at a 240 Hz pen.
        if (listen && ++flushes % 4 === 0) bytes += (feed as PixelFeed | null)?.take(false)?.data.byteLength ?? 0;
      }
      const ms = performance.now() - t0;
      setPixelTap(null);
      s.discard();
      return { ms, bytes };
    };
    for (const size of [4, 14, 40]) {
      const a = [0, 1, 2].map(() => strokeOnce(false, size).ms).sort((x, y) => x - y)[1];
      const b = [0, 1, 2].map(() => strokeOnce(true, size)).sort((x, y) => x.ms - y.ms)[1];
      rows.push(`pixel stroke, ${size}px brush, 600 dabs: ${a.toFixed(1)} ms alone, ${b.ms.toFixed(1)} ms with the feed (${(b.ms - a).toFixed(2)} ms more over the whole stroke, ${(b.bytes / 1024).toFixed(0)} KB handed over)`);
    }
    // Moving a picture: the link reads the grid and the port copies it.
    for (const [w, h] of [[1280, 720], [2048, 2048]]) {
      const px = new Uint8ClampedArray(w * h * 4);
      const patch = { layerId: 'L', width: w, height: h, start: true, base: false, x: 0, y: 0, w, h, data: px };
      rows.push(`whole ${w}x${h} picture, copying it onto the port (structuredClone): ${time(() => void structuredClone(patch), 8).toFixed(2)} ms`);
    }
    const dab = { layerId: 'L', width: W, height: H, start: false, base: false, x: 10, y: 10, w: 40, h: 40, data: new Uint8ClampedArray(40 * 40 * 4) };
    rows.push(`a 40x40 piece, copying it onto the port: ${(time(() => void structuredClone(dab), 2000) * 1000).toFixed(1)} microseconds`);
    console.log('\n' + rows.join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  });
});
