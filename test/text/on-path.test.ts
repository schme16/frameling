// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Doc, PathShape, StrokeShape, SubPath, TextShape } from '../../src/core/format';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { loadFile, saveFile } from '../../src/io/file';
import { cloneDrawing } from '../../src/timeline/edit-core';
import { hitText, textBounds, textLayout } from '../../src/text/draw';
import { textToSvg } from '../../src/text/exports';
import { glyphSprites } from '../../src/text/sprites';
import { estimateMeasure, glyphLooks, layoutText, newAnimator, newTextShape } from '../../src/text/model';
import {
  areaSign,
  curveInTextSpace,
  curveOfShape,
  defaultStart,
  glyphCorners,
  isReversed,
  layoutOnPath,
  newOnPath,
  pathSignature,
  pointAt,
  polyOf,
  sameCurve,
  turnedOnPath,
} from '../../src/text/onPath';
import { putTextOnCurve, takeTextOffCurve, whyNoTextOffPath, whyNoTextOnPath } from '../../src/text/onPathOps';
import { readOnPath, readTextShape } from '../../src/text/read';
import { textChoices } from '../../src/text/choices';
import { registerChoice } from '../../src/core/choices';

const K = 0.5522847498;
/** A circle drawn clockwise on the screen from its right-hand point (y runs down). */
function circle(cx: number, cy: number, r: number, clockwise = true): SubPath {
  const at = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const sign = clockwise ? 1 : -1;
  const pts: SubPath['points'] = [{ ...at(0) }];
  for (let i = 1; i <= 4; i++) {
    const a0 = (sign * (i - 1) * Math.PI) / 2;
    const a1 = (sign * i * Math.PI) / 2;
    const p0 = at(a0);
    const p1 = at(a1);
    // The tangent at each end, scaled by the usual bezier constant.
    const t0 = { x: -Math.sin(a0) * sign * r * K, y: Math.cos(a0) * sign * r * K };
    const t1 = { x: -Math.sin(a1) * sign * r * K, y: Math.cos(a1) * sign * r * K };
    if (i < 4) pts.push({ ...p1, c1: { x: p0.x + t0.x, y: p0.y + t0.y }, c2: { x: p1.x - t1.x, y: p1.y - t1.y } });
    else pts[0] = { ...pts[0], c1: { x: p0.x + t0.x, y: p0.y + t0.y }, c2: { x: p1.x - t1.x, y: p1.y - t1.y } };
  }
  return { points: pts, closed: true };
}

const line = (x0: number, y0: number, x1: number, y1: number): SubPath => ({ points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], closed: false });

const words = (patch: Partial<TextShape> = {}): TextShape => newTextShape('t1', { x: 0, y: 0 }, { text: 'HELLO', size: 20, align: 'center', ...patch });
const onCircle = (side: 'outside' | 'inside' = 'outside', patch: Partial<TextShape> = {}): TextShape => words({ onPath: newOnPath(circle(0, 0, 100), undefined, side), ...patch });

describe('the curve as a polyline', () => {
  it('measures a circle near 2 pi r and wraps round on a closed one', () => {
    const p = polyOf(circle(0, 0, 100));
    expect(p.length).toBeGreaterThan(2 * Math.PI * 100 * 0.999);
    expect(p.length).toBeLessThan(2 * Math.PI * 100 * 1.001);
    const a = pointAt(p, 10);
    const b = pointAt(p, 10 + p.length);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('goes on straight past the end of an open line', () => {
    const p = polyOf(line(0, 0, 100, 0));
    expect(pointAt(p, 50)).toEqual({ x: 50, y: 0 });
    expect(pointAt(p, 130)).toEqual({ x: 130, y: 0 });
    expect(pointAt(p, -20)).toEqual({ x: -20, y: 0 });
  });

  it('can be walked backwards', () => {
    const p = polyOf(line(0, 0, 100, 0), true);
    expect(pointAt(p, 0)).toEqual({ x: 100, y: 0 });
    expect(pointAt(p, 30).x).toBeCloseTo(70);
  });

  it('knows a clockwise circle from an anticlockwise one (y runs down)', () => {
    expect(areaSign(circle(0, 0, 50, true))).toBeGreaterThan(0);
    expect(areaSign(circle(0, 0, 50, false))).toBeLessThan(0);
  });

  it('walks outside clockwise and inside anticlockwise, whichever way it was drawn', () => {
    for (const cw of [true, false]) {
      const sp = circle(0, 0, 50, cw);
      expect(isReversed(sp, 'outside', false)).toBe(!cw);
      expect(isReversed(sp, 'inside', false)).toBe(cw);
      expect(isReversed(sp, 'outside', true)).toBe(cw);
    }
  });

  it('reads an open line left to right however it was drawn, and flip turns it round', () => {
    expect(isReversed(line(0, 0, 100, 0), 'outside', false)).toBe(false);
    expect(isReversed(line(100, 0, 0, 0), 'outside', false)).toBe(true);
    expect(isReversed(line(0, 0, 100, 0), 'outside', true)).toBe(true);
  });

  it('puts the start of words at the top of a circle (outside) or the bottom (inside)', () => {
    const sp = circle(0, 0, 100);
    for (const side of ['outside', 'inside'] as const) {
      const poly = polyOf(sp, isReversed(sp, side, false));
      const at = pointAt(poly, defaultStart(sp, side, false) * poly.length);
      expect(at.x).toBeCloseTo(0, 0);
      expect(at.y).toBeCloseTo(side === 'outside' ? -100 : 100, 0);
    }
    expect(defaultStart(line(0, 0, 100, 0), 'outside', false)).toBe(0);
  });
});

describe('letters along a curve', () => {
  it('stands the middle of the words upright on top of a circle, outside', () => {
    const l = layoutOnPath(onCircle('outside'), estimateMeasure, layoutText);
    expect(l.glyphs).toHaveLength(5);
    const mid = l.glyphs[2];
    expect(mid.y).toBeCloseTo(-100, 0);
    expect(Math.abs(mid.rot!)).toBeLessThan(0.05);
    // The first letters lean to the left, the last to the right: clockwise.
    expect(l.glyphs[0].rot!).toBeLessThan(0);
    expect(l.glyphs[4].rot!).toBeGreaterThan(0);
    // Every letter's baseline corner sits on the circle.
    for (const g of l.glyphs) expect(Math.hypot(g.x, g.y)).toBeCloseTo(100, 0);
  });

  it('puts the letters inside the circle, tops in, at the bottom', () => {
    const l = layoutOnPath(onCircle('inside'), estimateMeasure, layoutText);
    const mid = l.glyphs[2];
    expect(mid.y).toBeCloseTo(100, 0);
    expect(Math.abs(mid.rot!)).toBeLessThan(0.05);
    // The tops point up, into the circle: the glyph box reaches above the baseline.
    const top = glyphCorners(mid, l.ascent, l.descent).map((p) => p.y);
    expect(Math.min(...top)).toBeLessThan(mid.y - l.ascent * 0.9);
    expect(Math.hypot(...[mid.x, mid.y])).toBeCloseTo(100, 0);
    // Anticlockwise: the first letters are on the left, and read left to right at the bottom.
    expect(l.glyphs[0].x).toBeLessThan(l.glyphs[4].x);
  });

  it('is the same circle whichever way it was drawn', () => {
    const a = layoutOnPath(words({ onPath: newOnPath(circle(0, 0, 100, true), undefined, 'outside') }), estimateMeasure, layoutText);
    const b = layoutOnPath(words({ onPath: newOnPath(circle(0, 0, 100, false), undefined, 'outside') }), estimateMeasure, layoutText);
    a.glyphs.forEach((g, i) => {
      expect(b.glyphs[i].x).toBeCloseTo(g.x, 0);
      expect(b.glyphs[i].y).toBeCloseTo(g.y, 0);
    });
  });

  it('lays letters along a straight line with no turn, on the line', () => {
    const s = words({ align: 'left', text: 'abc', onPath: newOnPath(line(10, 50, 210, 50), undefined) });
    const l = layoutOnPath(s, estimateMeasure, layoutText);
    for (const g of l.glyphs) {
      expect(g.y).toBeCloseTo(50);
      expect(g.rot).toBeCloseTo(0);
    }
    expect(l.glyphs[0].x).toBeCloseTo(10);
    expect(l.glyphs[1].x).toBeCloseTo(10 + estimateMeasure('a', '700 20px x'));
  });

  it('hangs words under an open line when inside, and nudges them off the line with offset', () => {
    const base = words({ align: 'left', text: 'ab', onPath: newOnPath(line(0, 50, 200, 50), undefined, 'inside') });
    const l = layoutOnPath(base, estimateMeasure, layoutText);
    expect(l.glyphs[0].y).toBeCloseTo(50 + 20 * 0.72);
    const up = layoutOnPath({ ...base, onPath: { ...base.onPath!, side: 'outside', offset: 8 } }, estimateMeasure, layoutText);
    expect(up.glyphs[0].y).toBeCloseTo(42);
  });

  it('starts where start says, and centre and right line-up sit round or end at that spot', () => {
    const mk = (align: TextShape['align'], start: number) => layoutOnPath(words({ align, text: 'abcd', onPath: { curve: line(0, 0, 1000, 0), start } }), estimateMeasure, layoutText);
    const left = mk('left', 0.5);
    expect(left.glyphs[0].x).toBeCloseTo(500);
    const mid = mk('center', 0.5);
    const w = left.lines[0].w;
    expect(mid.glyphs[0].x).toBeCloseTo(500 - w / 2);
    const right = mk('right', 0.5);
    expect(right.glyphs[0].x).toBeCloseTo(500 - w);
  });

  it('spreads with letter spacing, and keeps spaces as no letter', () => {
    const tight = layoutOnPath(words({ align: 'left', text: 'a b', letterSpacing: 0, onPath: newOnPath(line(0, 0, 500, 0), undefined) }), estimateMeasure, layoutText);
    const loose = layoutOnPath(words({ align: 'left', text: 'a b', letterSpacing: 10, onPath: newOnPath(line(0, 0, 500, 0), undefined) }), estimateMeasure, layoutText);
    expect(loose.glyphs[2].x - tight.glyphs[2].x).toBeCloseTo(20);
    expect(tight.glyphs[1].letter).toBe(-1);
    expect(tight.letters).toBe(2);
  });

  it('joins lines of text into one run along the curve', () => {
    const l = layoutOnPath(words({ text: 'one\ntwo', onPath: newOnPath(circle(0, 0, 100), undefined) }), estimateMeasure, layoutText);
    expect(l.glyphs.every((g) => g.line === 0)).toBe(true);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0].text).toBe('one two');
  });

  it('works through layoutText for a text with a curve and leaves plain text as it was', () => {
    const plain = layoutText(words({ text: 'ab' }), estimateMeasure);
    expect(plain.glyphs.every((g) => g.rot === undefined)).toBe(true);
    const bent = layoutText(onCircle(), estimateMeasure);
    expect(bent.glyphs.every((g) => typeof g.rot === 'number')).toBe(true);
  });

  it('switching side or flip re-seats the words so they stay in view', () => {
    const base = newOnPath(circle(0, 0, 100), undefined, 'outside');
    const inside = turnedOnPath(base, { side: 'inside' });
    expect(inside.side).toBe('inside');
    const flipped = turnedOnPath(base, { flip: true });
    expect(flipped.flip).toBe(true);
    expect(turnedOnPath(flipped, { flip: false }).flip).toBeUndefined();
  });
});

describe('on the page', () => {
  it('has a box that covers the whole ring and hits on a letter, not in the middle of the ring', () => {
    const s = onCircle();
    const b = textBounds(s);
    expect(b.w).toBeGreaterThan(30);
    expect(b.y).toBeLessThan(-95);
    const top = textLayout(s).glyphs[2];
    expect(hitText(s, top.x + 3, top.y - 5, 1)).toBe(true);
    expect(hitText(s, 0, 0, 1)).toBe(false);
  });

  it('moves with the text matrix like any text', () => {
    const s = onCircle('outside', { transform: { x: 300, y: 200, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } });
    const top = textLayout(s).glyphs[2];
    expect(hitText(s, 300 + top.x + 3, 200 + top.y - 5, 1)).toBe(true);
    expect(textBounds(s).y).toBeCloseTo(200 - 100 - 20 * 0.8, -1);
  });

  it('caches by the curve, so a changed curve is a changed layout', () => {
    const a = onCircle();
    const b = { ...a, onPath: { ...a.onPath!, curve: circle(0, 0, 60) } };
    expect(pathSignature(a.onPath)).not.toBe(pathSignature(b.onPath));
    expect(textLayout(a).box.w).not.toBeCloseTo(textLayout(b).box.w, 0);
    expect(pathSignature(undefined)).toBe('');
  });

  it('writes SVG as one real text element per letter, turned to the curve', () => {
    const svg = textToSvg(onCircle());
    expect(svg.match(/<text/g)).toHaveLength(5);
    expect(svg).toMatch(/rotate\(-?[\d.]+\)/);
    expect(svg).toContain('>H</text>');
    expect(textToSvg(words({ text: 'ab' }))).toContain('>ab</text>');
  });

  it('turns each letter to the curve for the sprite exporters', () => {
    const sprites = glyphSprites(onCircle());
    expect(sprites).toHaveLength(5);
    const top = sprites[2].m;
    expect(Math.abs(Math.atan2(top[1], top[0]))).toBeLessThan(0.05);
    const first = sprites[0].m;
    expect(Math.atan2(first[1], first[0])).toBeLessThan(-0.1);
    // A straight text's letters are only moved.
    const flat = glyphSprites(words({ text: 'ab', align: 'left' }));
    expect(flat[0].m.slice(0, 4)).toEqual([1, 0, 0, 1]);
  });

  it('lets letters of words on a curve still be animated about their own centre', () => {
    const s = onCircle('outside', { animators: [{ ...newAnimator('scale', 'a'), by: 'letter', start: 0, duration: 10, stagger: 0, amount: 0, ease: 'linear' }] });
    const l = textLayout(s);
    const looks = glyphLooks(s, l, 0);
    // The centre of a letter is up from its baseline along its own turn, not straight up.
    const g = l.glyphs[0];
    expect(looks[0].cx).not.toBeCloseTo(g.x + g.w / 2, 3);
    expect(Math.hypot(looks[0].cx - g.x, looks[0].cy - g.y)).toBeCloseTo(Math.hypot(g.w / 2, l.ascent * 0.35), 3);
    // Exports pose animated text; each letter is hidden at frame 0 with a scale of 0.
    expect(glyphSprites({ ...s, posedFrame: 5 } as TextShape)).toHaveLength(5);
  });
});

describe('the curve out of a shape', () => {
  it('reads a path, a filled shape and a drawn line', () => {
    const path: PathShape = { id: 'p', type: 'path', paths: [circle(5, 5, 20)], fill: null, stroke: null, opacity: 1 };
    expect(curveOfShape(path)!.closed).toBe(true);
    const stroke: StrokeShape = { id: 's', type: 'stroke', points: Array.from({ length: 200 }, (_, i) => ({ x: i, y: Math.sin(i / 20) * 10, p: 1 })), brush: {} as never, color: '#000', opacity: 1 };
    const c = curveOfShape(stroke)!;
    expect(c.closed).toBe(false);
    expect(c.points.length).toBeLessThan(200);
    expect(c.points.length).toBeGreaterThan(10);
    expect(curveOfShape({ ...stroke, points: [{ x: 0, y: 0, p: 1 }] })).toBeNull();
    expect(curveOfShape(newTextShape('t', { x: 0, y: 0 }))).toBeNull();
  });

  it('puts a curve into the text space and back', () => {
    const t = words({ transform: { x: 50, y: 60, scaleX: 2, scaleY: 2, rotation: 0, skew: 0 } });
    const stage = line(50, 60, 250, 60);
    const local = curveInTextSpace(stage, [2, 0, 0, 2, 50, 60]);
    expect(local.points[0]).toEqual({ x: 0, y: 0 });
    expect(local.points[1]).toEqual({ x: 100, y: 0 });
    void t;
    expect(sameCurve(local, { ...local })).toBe(true);
    expect(sameCurve(local, line(0, 0, 100, 1))).toBe(false);
  });
});

describe('saving and opening', () => {
  const docWithWords = (s: TextShape): Doc => {
    const doc = newDoc({ width: 400, height: 400 });
    const d = newVectorDrawing();
    d.shapes.push(s);
    doc.drawings[d.id] = d;
    doc.layers[0].cels = [{ id: 'c', start: 0, length: 1, drawingId: d.id }];
    return doc;
  };

  it('round-trips words on a curve', () => {
    const s = onCircle('inside', { onPath: { ...onCircle('inside').onPath!, source: 'abc', flip: true, offset: 4 } });
    const doc = docWithWords(s);
    const back = loadFile(saveFile(doc)).doc;
    const d = Object.values(back.drawings)[0];
    expect(d.kind === 'vector' && d.shapes[0]).toEqual(s);
  });

  it('opens an old file whose text has no curve, and writes none', () => {
    const s = words({ text: 'old' });
    expect('onPath' in s).toBe(false);
    const back = readTextShape({ ...s });
    expect(back && 'onPath' in back).toBe(false);
    const saved = saveFile(docWithWords(s));
    expect(saved).not.toContain('onPath');
  });

  it('drops a damaged curve and keeps the words', () => {
    expect(readOnPath({ curve: { points: [{ x: 0, y: 0 }], closed: false } })).toBeUndefined();
    expect(readOnPath({ curve: { points: [{ x: 0, y: 0 }, { x: 'a', y: 1 }], closed: false } })).toBeUndefined();
    expect(readOnPath({ curve: { points: Array.from({ length: 6000 }, (_, i) => ({ x: i, y: 0 })), closed: false } })).toBeUndefined();
    expect(readOnPath('nope')).toBeUndefined();
    const t = readTextShape({ id: 'x', text: 'hi', onPath: { curve: { points: [{ x: 0, y: 0 }], closed: false } } });
    expect(t!.text).toBe('hi');
    expect(t!.onPath).toBeUndefined();
  });

  it('repairs values: side, start and offset', () => {
    const o = readOnPath({ curve: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: 'yes' }, side: 'sideways', start: 7, offset: 'x', flip: 'yes', source: 5 })!;
    expect(o.curve.closed).toBe(false);
    expect(o.side).toBeUndefined();
    expect(o.start).toBe(1);
    expect(o.offset).toBeUndefined();
    expect(o.flip).toBeUndefined();
    expect(o.source).toBeUndefined();
    const k = readOnPath({ curve: { points: [{ x: 0, y: 0, c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 } }, { x: 3, y: 3 }], closed: true }, side: 'inside', flip: true, source: 'q', start: 0.25, offset: -3 })!;
    expect(k.curve.points[0].c1).toEqual({ x: 1, y: 1 });
    expect(k).toMatchObject({ side: 'inside', flip: true, source: 'q', start: 0.25, offset: -3 });
  });
});

// ---------------------------------------------------------------- in the app: the store

function shapesOf(): Array<TextShape | PathShape | StrokeShape> {
  const { doc } = store().get();
  const d = doc.drawings[doc.layers[0].cels[0].drawingId];
  return d.kind === 'vector' ? (d.shapes as never) : [];
}

function setUpStore(shapes: Array<TextShape | PathShape>): void {
  const doc = newDoc({ width: 600, height: 600 });
  const layer = newVectorLayer('Lines');
  const d = newVectorDrawing();
  d.shapes.push(...shapes);
  doc.drawings[d.id] = d;
  layer.cels = [{ id: 'c1', start: 0, length: 4, drawingId: d.id }];
  doc.layers = [layer];
  resetStore(doc);
  store().setUi({ activeLayerId: layer.id, frame: 0 });
}

const ring = (id = 'ring', cx = 300, cy = 300): PathShape => ({ id, type: 'path', paths: [circle(cx, cy, 100)], fill: null, stroke: { color: '#333', width: 3 } as never, opacity: 1 });

describe('putting text on a curve', () => {
  beforeEach(() => {
    _resetChoicesForTests();
    for (const c of textChoices) registerChoice(c);
  });

  it('says what is missing while it cannot run, and the Take off command too', () => {
    setUpStore([newTextShape('w', { x: 10, y: 10 }, { text: 'hi' }), ring()]);
    store().setUi({ selection: ['w'] });
    expect(whyNoTextOnPath()).toMatch(/Pick a line or shape/);
    store().setUi({ selection: ['w', 'ring'] });
    expect(whyNoTextOnPath()).toBeUndefined();
    expect(whyNoTextOffPath()).toMatch(/Select some words/);
  });

  it('joins picked words to the picked shape in one undo step, grouped, centred on a closed shape', () => {
    setUpStore([newTextShape('w', { x: 10, y: 10 }, { text: 'hi there', size: 30 }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    const [w, r] = shapesOf() as [TextShape, PathShape];
    expect(w.onPath?.source).toBe('ring');
    expect(w.onPath?.side).toBe('outside');
    expect(w.align).toBe('center');
    expect(w.group).toBeTruthy();
    expect(w.group).toBe(r.group);
    // The curve is in the text's own space: the text sits at 10,10, so the circle centre is 290 off.
    expect(w.onPath!.curve.points[0].x).toBeCloseTo(300 + 100 - 10, 1);
    store().undo();
    expect((shapesOf()[0] as TextShape).onPath).toBeUndefined();
    expect((shapesOf()[1] as PathShape).group).toBeUndefined();
  });

  it('adds words of its own when only a curve is picked', () => {
    setUpStore([ring()]);
    store().setUi({ selection: ['ring'] });
    putTextOnCurve();
    const all = shapesOf();
    expect(all).toHaveLength(2);
    const made = all.find((s) => s.type === 'text') as TextShape;
    expect(made.onPath?.source).toBe('ring');
    expect(made.text.length).toBeGreaterThan(3);
    expect(store().get().ui.selection).toContain(made.id);
    store().undo();
    expect(shapesOf()).toHaveLength(1);
  });

  it('uses the remembered side for a closed shape', () => {
    setChoice('text.pathSide', 'inside');
    setUpStore([newTextShape('w', { x: 0, y: 0 }, { text: 'abc' }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    expect((shapesOf()[0] as TextShape).onPath?.side).toBe('inside');
  });

  it('keeps the words on their line when the line moves, reshapes, or is undone', () => {
    setUpStore([newTextShape('w', { x: 0, y: 0 }, { text: 'abc' }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    const before = (shapesOf()[0] as TextShape).onPath!.curve;
    // Move only the line (a drag of the shape alone).
    store().update('Move line', (doc) => {
      const d = doc.drawings[doc.layers[0].cels[0].drawingId];
      const r = d.kind === 'vector' ? (d.shapes[1] as PathShape) : null;
      for (const p of r!.paths[0].points) {
        p.x += 50;
        if (p.c1) p.c1.x += 50;
        if (p.c2) p.c2.x += 50;
      }
    });
    const after = (shapesOf()[0] as TextShape).onPath!.curve;
    expect(after.points[0].x).toBeCloseTo(before.points[0].x + 50, 1);
    expect(sameCurve(before, after)).toBe(false);
    // The words' update joined the line's move: one undo puts both back.
    store().undo();
    expect(sameCurve((shapesOf()[0] as TextShape).onPath!.curve, before)).toBe(true);
    store().redo();
    expect((shapesOf()[0] as TextShape).onPath!.curve.points[0].x).toBeCloseTo(before.points[0].x + 50, 1);
  });

  it('follows when the words themselves are moved: their curve is worked out again in their new space', () => {
    setUpStore([newTextShape('w', { x: 0, y: 0 }, { text: 'abc' }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    const word = () => shapesOf()[0] as TextShape;
    const stageTop = () => {
      const m = word().transform;
      const p = word().onPath!.curve.points[0];
      return { x: p.x + m.x, y: p.y + m.y };
    };
    const was = stageTop();
    // Only the words move (no matching move of the line): the words stay on the line.
    store().update('Nudge words', (doc) => {
      const d = doc.drawings[doc.layers[0].cels[0].drawingId];
      if (d.kind === 'vector') (d.shapes[0] as TextShape).transform.x += 30;
    });
    expect(stageTop().x).toBeCloseTo(was.x, 1);
  });

  it('keeps the curve it had when the line is deleted', () => {
    setUpStore([newTextShape('w', { x: 0, y: 0 }, { text: 'abc' }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    const before = (shapesOf()[0] as TextShape).onPath!.curve;
    store().update('Delete line', (doc) => {
      const d = doc.drawings[doc.layers[0].cels[0].drawingId];
      if (d.kind === 'vector') d.shapes = d.shapes.filter((s) => s.id !== 'ring');
    });
    expect(sameCurve((shapesOf()[0] as TextShape).onPath!.curve, before)).toBe(true);
  });

  it('lets the words be edited afterwards: the new letters run along the same curve', () => {
    setUpStore([newTextShape('w', { x: 0, y: 0 }, { text: 'abc' }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    store().update('Type', (doc) => {
      const d = doc.drawings[doc.layers[0].cels[0].drawingId];
      if (d.kind === 'vector') (d.shapes[0] as TextShape).text = 'abcdef';
    });
    const w = shapesOf()[0] as TextShape;
    expect(w.onPath).toBeDefined();
    expect(textLayout(w).letters).toBe(6);
  });

  it('takes words off the curve and leaves them as plain text', () => {
    setUpStore([newTextShape('w', { x: 0, y: 0 }, { text: 'abc' }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    takeTextOffCurve();
    expect((shapesOf()[0] as TextShape).onPath).toBeUndefined();
    expect(whyNoTextOffPath()).toBeDefined();
  });

  it('a copy of a key makes the words follow the copy of their line', () => {
    setUpStore([newTextShape('w', { x: 0, y: 0 }, { text: 'abc' }), ring()]);
    store().setUi({ selection: ['w', 'ring'] });
    putTextOnCurve();
    const { doc } = store().get();
    const copy = cloneDrawing(doc.drawings[doc.layers[0].cels[0].drawingId]);
    expect(copy.kind).toBe('vector');
    if (copy.kind !== 'vector') return;
    const w = copy.shapes.find((s) => s.type === 'text') as TextShape;
    const line = copy.shapes.find((s) => s.type === 'path')!;
    expect(w.onPath!.source).toBe(line.id);
    expect(line.id).not.toBe('ring');
  });
});
