import { describe, expect, it } from 'vitest';
import type { Doc, PathShape, StrokeShape } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { addVectorLayer, hold, linePath, pathShape, rectPath, stroke, vectorDrawing } from '../../src/templates/build';
import { drawLineOn } from '../../src/trim/model';
import { animatedSvg } from '../../src/export/svg-anim';
import { docToLottie } from '../../src/export/lottie';
import { drawingToSvg } from '../../src/export/svg';
import { carryOf, carryWarnings, docFeatures } from '../../src/export/carries';
import { nativeTrim, trimSpan } from '../../src/export/trimNative';

type Json = any;

function drawnOn(shape: PathShape | StrokeShape, frames = 12, way: 'on' | 'off' = 'on'): Doc {
  const doc = newDoc({ length: 24, fps: 12, width: 600, height: 300 });
  const layer = addVectorLayer(doc, 'Line');
  doc.layers = [layer];
  const d = vectorDrawing(doc, [shape]);
  hold(layer, d.id, 0, 24);
  const r = drawLineOn(doc, layer.id, 0, [shape.id], way, frames);
  if (typeof r === 'string') throw new Error(r);
  return doc;
}

const line = (extra: Partial<PathShape['stroke'] & object> = {}): PathShape => {
  const p = pathShape([linePath([[50, 150], [550, 150]])], null, { color: '#222222', width: 8 });
  p.stroke = { ...p.stroke!, ...extra };
  return p;
};
const ring = (): PathShape => pathShape([rectPath(100, 50, 200, 200)], null, { color: '#2255ff', width: 10 });

/** Every shape item of a Lottie group, found at any depth. */
function items(j: Json, ty: string): Json[] {
  const out: Json[] = [];
  const walk = (x: Json) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      if (x.ty === ty) out.push(x);
      Object.values(x).forEach(walk);
    }
  };
  walk(j);
  return out;
}

describe('a still SVG of a frame', () => {
  it('draws only the part of the line that shows on that frame', () => {
    const doc = drawnOn(line());
    const l = doc.layers[0];
    const at = (frame: number) => {
      const c = l.cels.find((x) => frame >= x.start && frame < x.start + x.length)!;
      return drawingToSvg(doc, l, doc.drawings[c.drawingId], frame).join('');
    };
    // Frame 0 is the start of the glide: nothing yet. The last key is the whole line.
    expect(at(0)).not.toContain('<path');
    expect(at(12)).toContain('M50 150');
  });
});

describe('native trim', () => {
  const run = (shapes: PathShape[]) => nativeTrim(shapes, { dash: true, noFill: true, noOpenSlide: true });
  const withTrim = (s: PathShape, trim: PathShape['stroke'] extends infer T ? (T extends { trim?: infer U } ? U : never) : never): PathShape => ({ ...s, stroke: { ...s.stroke!, trim } });

  it('is the same line with only the trim changing', () => {
    const a = line();
    const r = run([withTrim(a, { start: 0, end: 0, offset: 0 }), withTrim(a, { start: 0, end: 50, offset: 0 }), a]);
    expect(r?.trims.map((t) => t?.end)).toEqual([0, 50, undefined]);
    expect(r?.base.stroke!.trim).toBeUndefined();
  });

  it('is not, when the trim never changes or something else does too', () => {
    const a = line();
    expect(run([withTrim(a, { start: 0, end: 50, offset: 0 }), withTrim(a, { start: 0, end: 50, offset: 0 })])).toBeNull();
    expect(run([a, a])).toBeNull();
    expect(run([withTrim(a, { start: 0, end: 10, offset: 0 }), { ...withTrim(a, { start: 0, end: 20, offset: 0 }), opacity: 0.5 }])).toBeNull();
    expect(run([withTrim(a, { start: 0, end: 10, offset: 0 }), { ...withTrim(a, { start: 0, end: 20, offset: 0 }), paths: [linePath([[0, 0], [1, 1]])] }])).toBeNull();
  });

  it('is not for arrow heads, widths, or several outlines, which are drawn frame by frame', () => {
    const arrow = line({ arrowEnd: 'triangle' });
    expect(run([withTrim(arrow, { start: 0, end: 10, offset: 0 }), withTrim(arrow, { start: 0, end: 20, offset: 0 })])).toBeNull();
    const wide = line({ widths: [{ at: 0, w: 1 }, { at: 1, w: 2 }] });
    expect(run([withTrim(wide, { start: 0, end: 10, offset: 0 }), withTrim(wide, { start: 0, end: 20, offset: 0 })])).toBeNull();
    const two = { ...line(), paths: [linePath([[0, 0], [9, 9]]), linePath([[0, 5], [9, 5]])] };
    expect(run([withTrim(two, { start: 0, end: 10, offset: 0 }), withTrim(two, { start: 0, end: 20, offset: 0 })])).toBeNull();
  });

  it('keeps a loop that spins, but not an open line that slides, for Lottie', () => {
    const r = ring();
    const slid = [withTrim(r, { start: 0, end: 30, offset: 0 }), withTrim(r, { start: 0, end: 30, offset: 50 })];
    expect(run(slid)).not.toBeNull();
    const o = line();
    const openSlid = [withTrim(o, { start: 0, end: 30, offset: 0 }), withTrim(o, { start: 0, end: 30, offset: 50 })];
    expect(run(openSlid)).toBeNull();
    expect(nativeTrim(openSlid, { dash: false, noFill: false, noOpenSlide: false })).not.toBeNull();
  });

  it('keeps a fill for SVG, which only dashes the line, but not for Lottie, whose trim would cut the fill', () => {
    const f = { ...line(), fill: '#ff0000' };
    const pair = [withTrim(f, { start: 0, end: 10, offset: 0 }), withTrim(f, { start: 0, end: 20, offset: 0 })];
    expect(run(pair)).toBeNull();
    expect(nativeTrim(pair, { dash: false, noFill: false, noOpenSlide: false })).not.toBeNull();
  });

  it('works out where each frame starts and how much it shows', () => {
    expect(trimSpan(undefined, false)).toEqual({ from: 0, len: 1 });
    expect(trimSpan({ start: 0, end: 0, offset: 0 }, false)).toBeNull();
    expect(trimSpan({ start: 20, end: 70, offset: 0 }, false)).toMatchObject({ from: 0.2 });
    const wrapped = trimSpan({ start: 0, end: 50, offset: 80 }, true)!;
    expect(wrapped.from).toBeCloseTo(0.8);
    expect(wrapped.len).toBeCloseTo(0.5);
  });
});

describe('Lottie', () => {
  it('keeps a line drawing itself as one line with a trim path that moves', () => {
    const j = docToLottie(drawnOn(line(), 12));
    const tm = items(j, 'tm');
    expect(tm).toHaveLength(1);
    expect(tm[0].e.a).toBe(1);
    const keys = tm[0].e.k as { t: number; s: number[] }[];
    expect(keys[0].s[0]).toBe(0);
    expect(keys[keys.length - 1].s[0]).toBeCloseTo(100, 0);
    // One path for the glide (and one for the whole line the next key holds), not a path per frame.
    expect(items(j, 'sh')).toHaveLength(2);
    expect(items(j, 'sh')[0].ks.a).toBe(0);
    expect(tm[0].s.a).toBe(0);
    expect(tm[0].m).toBe(1);
  });

  it('is the trim path before the line it trims', () => {
    const j = docToLottie(drawnOn(line(), 12));
    const g = items(j, 'gr').find((x) => x.it?.some((i: Json) => i.ty === 'tm'))!;
    const order = g.it.map((i: Json) => i.ty);
    expect(order.indexOf('sh')).toBeLessThan(order.indexOf('tm'));
    expect(order.indexOf('tm')).toBeLessThan(order.indexOf('st'));
  });

  it('spins a ring with the slide in degrees', () => {
    const doc = drawnOn(ring(), 12);
    // Slide it a whole turn on the second key.
    const l = doc.layers[0];
    const second = doc.drawings[l.cels[1].drawingId] as { shapes: PathShape[] };
    second.shapes[0].stroke!.trim = { start: 0, end: 50, offset: 100 };
    const first = doc.drawings[l.cels[0].drawingId] as { shapes: PathShape[] };
    first.shapes[0].stroke!.trim = { start: 0, end: 50, offset: 0 };
    const tm = items(docToLottie(doc), 'tm')[0];
    const last = (tm.o.k as { s: number[] }[]).at(-1)!;
    // The glide ends a frame before the next key, nearly a whole turn on.
    expect(last.s[0]).toBeGreaterThan(355);
  });

  it('draws the frames one by one, still as vector, when the line has an arrow head', () => {
    const j = docToLottie(drawnOn(line({ arrowEnd: 'triangle' }), 12));
    expect(items(j, 'tm')).toHaveLength(0);
    expect(items(j, 'sh').length).toBeGreaterThan(0);
  });

  it('draws a brush line frame by frame as its outline (a trim path cannot do pressure)', () => {
    const j = docToLottie(drawnOn(stroke([[50, 150], [550, 150]], '#000000', 10), 12));
    expect(items(j, 'tm')).toHaveLength(0);
    expect(items(j, 'sh').length).toBeGreaterThan(0);
  });
});

describe('moving SVG', () => {
  it('writes one line and moves its dash, instead of a picture per frame', () => {
    const svg = animatedSvg(drawnOn(line(), 12));
    // One path for the glide (and one for the whole line the next key holds).
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg.match(/pathLength="1000"/g)).toHaveLength(1);
    expect(svg).toMatch(/@keyframes d\d+\{0%\{stroke-dasharray:/);
    expect(svg).toContain('stroke-dashoffset');
  });

  it('shows the line only on the frames where some of it shows, so the start is empty, not a dot', () => {
    const svg = animatedSvg(drawnOn(line(), 12));
    // Frame 0 is hidden: a visibility key that starts hidden and turns visible after it.
    expect(svg).toMatch(/\{visibility:hidden\}.*\{visibility:visible\}/);
  });

  it('wraps a loop with a repeating dash, and keeps an open line to a single dash', () => {
    const r = animatedSvg(drawnOn(ring(), 12));
    expect(r).toMatch(/stroke-dasharray:[\d.]+ [\d.]+;/);
    const open = animatedSvg(drawnOn(line(), 12));
    expect(open).toContain(' 3000;');
  });

  it('falls back to a picture per frame for a brush line', () => {
    const svg = animatedSvg(drawnOn(stroke([[50, 150], [550, 150]], '#000000', 10), 12));
    expect(svg).not.toContain('pathLength');
    expect(svg.match(/<path /g)!.length).toBeGreaterThan(3);
  });
});

describe('what carries over', () => {
  it('notices a trim in the document, and every format keeps it', () => {
    const doc = drawnOn(line(), 12);
    const found = docFeatures(doc);
    expect(found.features.has('trim')).toBe(true);
    for (const f of ['svg', 'svganim', 'lottie', 'pdf', 'ai', 'png', 'gif'] as const) expect(carryWarnings(doc, f, found).join(' ')).not.toMatch(/draw themselves/);
    expect(carryOf('lottie').rows?.trim).toBe('kept');
    expect(docFeatures(drawnOn(line(), 12, 'on')).features.has('trim')).toBe(true);
  });

  it('does not mention it when no line is trimmed', () => {
    const doc = newDoc();
    expect(docFeatures(doc).features.has('trim')).toBe(false);
  });
});
