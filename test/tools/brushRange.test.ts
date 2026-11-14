import { beforeEach, describe, expect, it } from 'vitest';
import type { PixelDrawing } from '../../src/core/format';
import { resetStore, store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { brushRange, MIN_REACH, TYPED_MAX, typedSize } from '../../src/tools/brushRange';
import { curvePos, curveValue, keyStep, sliderValueAt } from '../../src/canvas/controls';
import { bresenham, brushOffsets, brushSpans, type PixelShape } from '../../src/canvas/pixels';
import { brushStep, stepSize } from '../../src/pixel/habits';
import { sanitizePreset } from '../../src/brushes/model';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { brushTool } from '../../src/tools/brush';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { asGrid } from '../helpers/grid';
import { MAX_HOLES, tipShapes } from '../../src/geometry/tipShapes';
import { strokeOutline } from '../../src/core/render';
import { defaultTip } from '../../src/geometry/tip';
import { ctx, drag, pixelStore } from './helpers';

describe('the brush slider range', () => {
  it('runs from 1 to the longer side of the canvas plus a tenth', () => {
    expect(brushRange(4000, 3000)).toEqual({ min: 1, max: 4400, typedMax: TYPED_MAX });
    expect(brushRange(1920, 1080).max).toBe(2112);
    expect(brushRange(800, 1200).max).toBe(1320);
  });
  it('uses the longer side whichever way round the canvas is', () => {
    expect(brushRange(300, 900).max).toBe(brushRange(900, 300).max);
  });
  it('counts a pixel layer in art pixels', () => {
    // A 256 stage with 8 stage pixels to an art pixel is a 32 pixel sprite: 35 at the top, not 281.
    expect(brushRange(256, 256, 8).max).toBe(36);
    expect(brushRange(2000, 2000, 1).max).toBe(2200);
    expect(brushRange(100, 60, 8).max).toBe(Math.ceil(13 * 1.1));
  });
  it('rounds up, so a whole number of pixels always reaches past the edge', () => {
    expect(brushRange(101, 50).max).toBe(112);
  });
  it('never leaves a tiny canvas with a slider too short to use', () => {
    expect(brushRange(4, 4).max).toBe(MIN_REACH);
    expect(brushRange(0, 0).max).toBe(MIN_REACH);
  });
  it('is not thrown by junk', () => {
    expect(brushRange(Number.NaN, 100).max).toBe(110);
    expect(brushRange(100, 100, 0).max).toBe(110);
    expect(brushRange(100, 100, -3).max).toBe(110);
  });
  it('never reaches past what the box accepts', () => {
    expect(brushRange(1e9, 1e9).max).toBe(TYPED_MAX);
  });
});

describe('typing a size', () => {
  it('lets a number past the slider through', () => {
    expect(typedSize(9000)).toBe(9000);
    expect(typedSize(4400.5)).toBe(4400.5);
  });
  it('rounds for pixel brushes, and keeps at least 1', () => {
    expect(typedSize(7.6, true)).toBe(8);
    expect(typedSize(0, true)).toBe(1);
    expect(typedSize(-5)).toBe(1);
  });
  it('holds only at the sanity limit', () => {
    expect(typedSize(1e12)).toBe(TYPED_MAX);
  });
});

describe('the curve under the slider', () => {
  it('gives the small sizes room: the old 120 cap sits about a third of the way on a 1920 canvas', () => {
    const pos = curvePos(120, 1, 2112);
    expect(pos).toBeGreaterThan(0.3);
    expect(pos).toBeLessThan(0.45);
  });
  it('round-trips, ends on the ends, and pins a value past the end', () => {
    for (const v of [1, 2, 10, 120, 999, 4400]) expect(curveValue(curvePos(v, 1, 4400), 1, 4400)).toBeCloseTo(v, 6);
    expect(curvePos(1, 1, 4400)).toBe(0);
    expect(curvePos(4400, 1, 4400)).toBe(1);
    expect(curvePos(9000, 1, 4400)).toBe(1);
    expect(curvePos(0, 1, 4400)).toBe(0);
  });
  it('keeps a pixel of slider worth a few pixels of brush at the small end', () => {
    const w = 200;
    const a = sliderValueAt({ x: 10, left: 0, width: w, min: 1, max: 4400, step: 1, fine: null, coarse: false, curve: true });
    const b = sliderValueAt({ x: 11, left: 0, width: w, min: 1, max: 4400, step: 1, fine: null, coarse: false, curve: true });
    expect(b - a).toBeLessThan(5);
    const linear = sliderValueAt({ x: 11, left: 0, width: w, min: 1, max: 4400, step: 1, fine: null, coarse: false }) - sliderValueAt({ x: 10, left: 0, width: w, min: 1, max: 4400, step: 1, fine: null, coarse: false });
    expect(linear).toBeGreaterThan(20);
  });
  it('reaches the end of the range at the end of the slider, and holds there', () => {
    expect(sliderValueAt({ x: 200, left: 0, width: 200, min: 1, max: 4400, step: 1, fine: null, coarse: false, curve: true })).toBe(4400);
    expect(sliderValueAt({ x: 999, left: 0, width: 200, min: 1, max: 4400, step: 1, fine: null, coarse: false, curve: true })).toBe(4400);
    expect(sliderValueAt({ x: -5, left: 0, width: 200, min: 1, max: 4400, step: 1, fine: null, coarse: false, curve: true })).toBe(1);
  });
  it('fine drag moves slowly from where it started', () => {
    const v = sliderValueAt({ x: 105, left: 0, width: 200, min: 1, max: 4400, step: 1, fine: { x: 100, value: 500 }, coarse: false, curve: true });
    expect(v).toBeGreaterThanOrEqual(500);
    expect(v).toBeLessThan(560);
  });
  it('arrow keys take bigger steps on a curve, one at a time on a plain slider', () => {
    expect(keyStep(3, 1, true)).toBe(1);
    expect(keyStep(2000, 1, true)).toBe(100);
    expect(keyStep(2000, 1, false)).toBe(1);
    expect(keyStep(2000, 0.5, true)).toBe(100);
  });
});

describe('the pixel brush on a big canvas', () => {
  it('has the same footprint as before, row by row', () => {
    const old = (size: number, shape: PixelShape) => {
      const n = Math.max(1, Math.round(size));
      const lo = -Math.floor((n - 1) / 2);
      const c = (n - 1) / 2;
      const r2 = (n / 2) * (n / 2) - 0.5;
      const out: string[] = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (shape === 'round' && n > 2 && (i - c) * (i - c) + (j - c) * (j - c) > r2) continue;
        out.push(`${lo + i},${lo + j}`);
      }
      return out;
    };
    for (const shape of ['square', 'round'] as const) {
      for (let n = 1; n <= 70; n++) expect(brushOffsets(n, shape).map((o) => `${o.x},${o.y}`), `${shape} ${n}`).toEqual(old(n, shape));
      for (const n of [97, 128, 301]) expect(brushOffsets(n, shape).map((o) => `${o.x},${o.y}`), `${shape} ${n}`).toEqual(old(n, shape));
    }
  });
  it('has a span for every row, so a row can be found by its offset', () => {
    const s = brushSpans(40, 'round');
    expect(s).toHaveLength(40);
    expect(s.every((r, i) => r.y === s[0].y + i && r.x1 >= r.x0)).toBe(true);
  });
  it('steps the size key in tenths once it is big, and back to the same place', () => {
    expect(brushStep(3, 1)).toBe(1);
    expect(brushStep(100, 1)).toBe(10);
    let n = 14;
    const up = [n];
    for (let i = 0; i < 6; i++) up.push((n += brushStep(n, 1)));
    for (let i = up.length - 2; i >= 0; i--) {
      n -= brushStep(n, -1);
      expect(n).toBe(up[i]);
    }
  });
  it('lets the size key go as far as the slider on this canvas, and no further', () => {
    const sizes = { pixelBrushSize: 30, eraserPixelSize: 1, ditherSize: 1, spraySize: 1 };
    expect(stepSize('brush', sizes, 1, 36)?.set.pixelBrushSize).toBe(33);
    expect(stepSize('brush', { ...sizes, pixelBrushSize: 36 }, 1, 36)).toBeNull();
    expect(stepSize('brush', { ...sizes, pixelBrushSize: 900 }, 1, 36)).toBeNull();
    expect(stepSize('brush', { ...sizes, pixelBrushSize: 900 }, -1, 36)?.set.pixelBrushSize).toBeLessThanOrEqual(36);
  });
});

describe('a big pixel brush paints exactly what a plain stamp at every step would', () => {
  beforeEach(() => {
    setToolSettings({ ...DEFAULT_TOOL_SETTINGS, pixelPerfect: false });
    forgetLastPixelEnd();
  });
  const grid = () => {
    const { doc } = store().get();
    const cel = doc.layers[0].cels[0];
    return asGrid(doc.drawings[cel.drawingId] as PixelDrawing);
  };
  const alphas = (d: ReturnType<typeof grid>) => {
    const out: number[] = [];
    for (let i = 3; i < d.pixels.length; i += 4) out.push(d.pixels[i]);
    return out;
  };
  for (const shape of ['square', 'round'] as const) {
    it(`${shape}, size 9, along a wobbly drag`, () => {
      pixelStore(1);
      setToolSettings({ pixelBrushSize: 9, pixelBrushShape: shape });
      const path: [number, number][] = [[10, 10], [22, 17], [30, 33], [18, 40], [50, 12]];
      drag(brushTool, ctx(), path);
      const got = alphas(grid());
      // The same thing the slow way: the whole brush at every pixel along every leg.
      const w = 64;
      const want = new Set<number>();
      const offs = brushOffsets(9, shape);
      for (let i = 1; i < path.length; i++) {
        for (const q of bresenham(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1])) {
          for (const o of offs) {
            const x = q.x + o.x;
            const y = q.y + o.y;
            if (x >= 0 && y >= 0 && x < w && y < w) want.add(y * w + x);
          }
        }
      }
      expect(got.map((a, k) => (a > 0 ? k : -1)).filter((k) => k >= 0)).toEqual([...want].sort((a, b) => a - b));
    });
  }
  it('a size bigger than the old cap paints and does not shrink under pen pressure', () => {
    pixelStore(1);
    setToolSettings({ pixelBrushSize: 150 });
    drag(brushTool, ctx(), [[10, 10], [20, 10]], { hasPressure: true, pressure: 1 });
    const d = grid();
    expect(alphas(d).filter((a) => a > 0).length).toBe(64 * 64);
  });
});

describe('a typed size far past the canvas', () => {
  it('paints the whole picture without working through every pixel it covers', () => {
    pixelStore(1);
    setToolSettings({ ...DEFAULT_TOOL_SETTINGS, pixelPerfect: false, pixelBrushSize: 100000, pixelBrushShape: 'square' });
    const t0 = performance.now();
    drag(brushTool, ctx(), [[10, 10], [30, 20], [50, 40]]);
    expect(performance.now() - t0).toBeLessThan(3000);
    const { doc } = store().get();
    const d = asGrid(doc.drawings[doc.layers[0].cels[0].drawingId] as PixelDrawing);
    let filled = 0;
    for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i] > 0) filled++;
    expect(filled).toBe(64 * 64);
  });
});

describe('chalk and charcoal at a huge size', () => {
  const stroke = (size: number, kind: 'chalk' | 'charcoal') => {
    const points = Array.from({ length: 31 }, (_, i) => ({ x: 260 + (i / 30) * 3000, y: 1500 + Math.sin((i / 30) * 6.28) * 800, p: 0.5 }));
    return { id: 'a', type: 'stroke' as const, points, brush: { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true, tip: defaultTip(kind) }, color: '#000000', opacity: 1 };
  };
  for (const kind of ['chalk', 'charcoal'] as const) {
    it(`${kind}: the grain stays a fixed amount of work however big the brush, and an everyday size keeps its grain`, () => {
      const holes = (size: number) => ((tipShapes(stroke(size, kind), (st) => strokeOutline(st))![0] as { paths: unknown[] }).paths.length - 1);
      expect(holes(120)).toBeGreaterThan(300);
      expect(holes(4400)).toBeLessThan(MAX_HOLES * 1.3);
      expect(holes(20000)).toBeLessThan(MAX_HOLES * 1.3);
    });
  }
});

describe('old brushes and files', () => {
  it('a saved brush keeps its size, small or very big', () => {
    for (const size of [1, 24, 120, 400, 401, 4400, 90000]) {
      const p = sanitizePreset({ name: 'Mine', tool: 'brush', brush: { size } }, 'b1');
      expect(p?.brush.size).toBe(size);
    }
  });
  it('a canvas made smaller leaves the brush alone', () => {
    const s = resetStore(newDoc({ width: 4000, height: 3000 }));
    s.setUi({ brush: { ...s.get().ui.brush, size: 4000 } });
    store().update('Resize canvas', (d) => {
      d.width = 200;
      d.height = 200;
    });
    expect(store().get().ui.brush.size).toBe(4000);
    expect(brushRange(store().get().doc.width, store().get().doc.height).max).toBe(220);
  });
});
