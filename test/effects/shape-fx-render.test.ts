// Drawing a shape with an effect, on recording stand-ins for the canvas: the shape goes through its effects on a canvas
// of its own and comes back as one picture, the shapes round it are painted straight on, a held drawing is blurred once,
// and a layer's own effects still run on top afterwards.
import { beforeEach, describe, expect, it } from 'vitest';
import type { LayerEffect } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { drawDrawing, drawingBox } from '../../src/core/render';
import { shapeFxStats } from '../../src/effects/composite';
import { setFilterOverride } from '../../src/effects/filterSupport';
import { defaultValues } from '../../src/effects/model';
import { ellipsePath, fill, rectPath, vectorDrawing } from '../../src/templates/build';

type Call = [string, ...unknown[]];

/** A canvas context that remembers what it was asked to do, and every setting it was given. */
function recorder(canvas: object, shared?: Call[]): { g: never; calls: Call[]; names: () => string[] } {
  const calls: Call[] = shared ?? [];
  const state: Record<string, unknown> = { globalAlpha: 1, filter: 'none', globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, canvas };
  const g = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'getTransform') return () => ({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 });
      return (...a: unknown[]) => void calls.push([k, ...a]);
    },
    set(t, k: string, v) {
      if (k === 'filter' && v !== 'none') calls.push(['filter', v]);
      t[k] = v;
      return true;
    },
  });
  return { g: g as never, calls, names: () => calls.map((c) => c[0]) };
}

// Everything done on any scratch canvas, in order. (The compositor keeps its scratch canvases between calls, so the log is
// shared and cleared between tests rather than made new with them.)
const scratch: Call[] = [];

class FakeOffscreen {
  private rec: ReturnType<typeof recorder>;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.rec = recorder(this, scratch);
  }
  getContext() {
    return this.rec.g;
  }
}

class FakePath2D {
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
}

const g = globalThis as unknown as Record<string, unknown>;
g.Path2D = FakePath2D;
g.OffscreenCanvas = FakeOffscreen;

const fx = (kind: LayerEffect['kind'], values: Record<string, number | string> = {}): LayerEffect => ({ id: `e-${kind}`, kind, values: { ...defaultValues(kind), ...values } });

function target(w = 300, h = 200) {
  return recorder({ width: w, height: h });
}

/** The filters set on any scratch canvas so far, in order. */
const filters = () => scratch.filter((c) => c[0] === 'filter').map((c) => c[1]);

beforeEach(() => {
  scratch.length = 0;
  setFilterOverride('native');
});

describe('a shape with an effect, drawn', () => {
  const doc = newDoc({ width: 150, height: 100 });

  it('is painted on a canvas of its own, put through the effect and put on as one picture; the shapes round it are painted straight on', () => {
    const plainA = fill([rectPath(0, 0, 10, 10)], '#111111');
    const soft = { ...fill([ellipsePath(50, 50, 20, 8)], '#000000'), effects: [fx('blur', { radius: 5 })] };
    const plainB = fill([rectPath(60, 0, 10, 10)], '#222222');
    const d = vectorDrawing(doc, [plainA, soft, plainB]);
    const t = target();
    drawDrawing(t.g, d, 1, { doc, frame: 0 });
    // Two plain fills painted on the target, and one picture drawn onto it (the soft shape's own fill went elsewhere).
    expect(t.names().filter((n) => n === 'fill')).toHaveLength(2);
    expect(t.names().filter((n) => n === 'drawImage')).toHaveLength(1);
    expect(t.names().filter((n) => n === 'fill' || n === 'drawImage')).toEqual(['fill', 'drawImage', 'fill']);
    expect(scratch.filter((c) => c[0] === 'fill')).toHaveLength(1);
    // 5 document pixels of blur at the transform's scale of 2.
    expect(filters()).toEqual(['blur(10px)']);
  });

  it('runs a shape\'s effects first to last, and leaves out one that is off', () => {
    const s = { ...fill([rectPath(0, 0, 10, 10)], '#000000'), effects: [fx('blur', { radius: 1 }), { ...fx('shadow'), on: false }, fx('adjust', { hue: 40 })] };
    drawDrawing(target().g, vectorDrawing(doc, [s]), 1, { doc, frame: 0 });
    expect(filters().map((f) => String(f).split('(')[0])).toEqual(['blur', 'hue-rotate']);
  });

  it('draws a shape whose effects do nothing like any other', () => {
    const s = { ...fill([rectPath(0, 0, 10, 10)], '#000000'), effects: [fx('blur', { radius: 0 })] };
    const t = target();
    drawDrawing(t.g, vectorDrawing(doc, [s]), 1, { doc, frame: 0 });
    expect(filters()).toEqual([]);
    expect(t.names()).toContain('fill');
    expect(t.names()).not.toContain('drawImage');
  });

  it('is blurred once while the drawing holds still, and again when the effect changes', () => {
    const soft = { ...fill([ellipsePath(50, 50, 20, 8)], '#000000'), effects: [fx('blur', { radius: 5 })] };
    const d = vectorDrawing(doc, [soft]);
    const before = shapeFxStats();
    for (let i = 0; i < 4; i++) drawDrawing(target().g, d, 1, { doc, frame: i });
    expect(filters()).toHaveLength(1);
    expect(shapeFxStats().reused - before.reused).toBe(3);
    // A new setting is a new shape object (edits never change one in place), so it is made again.
    const changed = { ...soft, effects: [fx('blur', { radius: 9 })] };
    drawDrawing(target().g, vectorDrawing(doc, [changed]), 1, { doc, frame: 0 });
    expect(filters()).toEqual(['blur(10px)', 'blur(18px)']);
  });

  it('lets the box of a drawing grow with the effect, for symbols and exports that need the room', () => {
    const soft = { ...fill([rectPath(10, 10, 20, 20)], '#000000'), effects: [fx('shadow', { x: 6, y: 6, softness: 4 })] };
    const plain = fill([rectPath(10, 10, 20, 20)], '#000000');
    const a = drawingBox(vectorDrawing(doc, [plain]));
    const b = drawingBox(vectorDrawing(doc, [soft]));
    expect(b.x1 - a.x1).toBeGreaterThanOrEqual(6 + 4 * 3 - 1e-9);
  });
});
