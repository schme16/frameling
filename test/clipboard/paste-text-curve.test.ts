// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape, Shape, SubPath, TextShape, VectorDrawing } from '../../src/core/format';
import { newDoc, newVectorDrawing, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import '../../src/text/kind';
import { newTextShape } from '../../src/text/model';
import { newOnPath } from '../../src/text/onPath';
import { copyToClipboard, clearClipboard, duplicateShapes, notePasted, pasteFromClipboard } from '../../src/tools/clipboard';

const wave = (): SubPath => ({ closed: false, points: [{ x: 100, y: 300 }, { x: 300, y: 200, c1: { x: 150, y: 300 }, c2: { x: 250, y: 200 } }, { x: 500, y: 300, c1: { x: 350, y: 200 }, c2: { x: 450, y: 300 } }] });
const line = (id = 'line'): PathShape => ({ id, type: 'path', paths: [wave()], fill: null, stroke: { color: '#333', width: 3 } as never, opacity: 1 });
const words = (id = 'words', source: string | null = 'line'): TextShape => {
  const t = newTextShape(id, { x: 0, y: 0 }, { text: 'hello' });
  t.onPath = newOnPath(wave(), source ?? undefined);
  return t;
};

/** Two drawings, d1 holding the pair and d2 empty, each on a layer of its own. */
function setUp(first: Shape[]): void {
  const doc = newDoc({ width: 600, height: 600 });
  const a = newVectorDrawing();
  const b = newVectorDrawing();
  a.shapes.push(...first);
  doc.drawings[a.id] = a;
  doc.drawings[b.id] = b;
  const la = newVectorLayer('A');
  const lb = newVectorLayer('B');
  la.cels = [{ id: 'ca', start: 0, length: 4, drawingId: a.id }];
  lb.cels = [{ id: 'cb', start: 0, length: 4, drawingId: b.id }];
  doc.layers = [la, lb];
  resetStore(doc);
  store().setUi({ activeLayerId: la.id, frame: 0 });
}
const drawings = () => {
  const { doc } = store().get();
  return [doc.layers[0], doc.layers[1]].map((l) => doc.drawings[l.cels[0].drawingId] as VectorDrawing);
};
const textOf = (shapes: Shape[]) => shapes.filter((s): s is TextShape => s.type === 'text');
const pathOf = (shapes: Shape[]) => shapes.filter((s): s is PathShape => s.type === 'path');
/** Moves the path with this id sideways by dx, in the store, as a drag of the line alone would. */
function nudgeLine(drawing: number, id: string, dx: number): void {
  store().update('Move line', (doc) => {
    const d = doc.drawings[doc.layers[drawing].cels[0].drawingId] as VectorDrawing;
    const p = d.shapes.find((s) => s.id === id) as PathShape;
    for (const pt of p.paths[0].points) {
      pt.x += dx;
      if (pt.c1) pt.c1.x += dx;
      if (pt.c2) pt.c2.x += dx;
    }
  });
}

beforeEach(() => {
  clearClipboard();
  setUp([line(), words()]);
});

describe('pasting words on a curve with their line', () => {
  it('points the pasted words at the pasted line, not the one they came from', () => {
    const [a] = drawings();
    copyToClipboard(a.shapes, a.id);
    const pasted = pasteFromClipboard(a.id);
    const t = textOf(pasted)[0];
    const l = pathOf(pasted)[0];
    expect(l.id).not.toBe('line');
    expect(t.onPath?.source).toBe(l.id);
    expect(t.onPath?.curve.points.length).toBe(3);
  });

  it('follows the pasted line when it moves, and leaves the original pair alone', () => {
    const [a] = drawings();
    copyToClipboard(a.shapes, a.id);
    const pasted = pasteFromClipboard(a.id);
    store().update('Paste', (doc) => void (doc.drawings[a.id] as VectorDrawing).shapes.push(...pasted));
    const t = textOf(pasted)[0];
    const originalBefore = textOf(drawings()[0].shapes).find((s) => s.id === 'words')!.onPath!.curve;
    const pastedBefore = textOf(drawings()[0].shapes).find((s) => s.id === t.id)!.onPath!.curve;
    nudgeLine(0, pathOf(pasted)[0].id, 80);
    const now = textOf(drawings()[0].shapes);
    const pastedAfter = now.find((s) => s.id === t.id)!.onPath!.curve;
    expect(pastedAfter.points[0].x).toBeCloseTo(pastedBefore.points[0].x + 80, 1);
    expect(now.find((s) => s.id === 'words')!.onPath!.curve).toEqual(originalBefore);
  });

  it('works into another drawing, where the original line is not', () => {
    const [a, b] = drawings();
    copyToClipboard(a.shapes, a.id);
    const pasted = pasteFromClipboard(b.id);
    store().update('Paste', (doc) => void (doc.drawings[b.id] as VectorDrawing).shapes.push(...pasted));
    const t = textOf(pasted)[0];
    expect(t.onPath?.source).toBe(pathOf(pasted)[0].id);
    const before = textOf(drawings()[1].shapes)[0].onPath!.curve.points[0].x;
    nudgeLine(1, pathOf(pasted)[0].id, 40);
    expect(textOf(drawings()[1].shapes)[0].onPath!.curve.points[0].x).toBeCloseTo(before + 40, 1);
  });

  it('gives each of two pastes its own line to follow', () => {
    const [a] = drawings();
    copyToClipboard(a.shapes, a.id);
    const first = pasteFromClipboard(a.id);
    notePasted(a.id);
    const second = pasteFromClipboard(a.id);
    const lines = [pathOf(first)[0].id, pathOf(second)[0].id];
    expect(new Set([...lines, 'line']).size).toBe(3);
    expect(textOf(first)[0].onPath?.source).toBe(lines[0]);
    expect(textOf(second)[0].onPath?.source).toBe(lines[1]);
  });

  it('does the same for Duplicate', () => {
    const [a] = drawings();
    const copies = duplicateShapes(a.shapes);
    expect(textOf(copies)[0].onPath?.source).toBe(pathOf(copies)[0].id);
  });
});

describe('pasting words without their line', () => {
  it('keeps the curve and follows nothing, in the same drawing and in another', () => {
    const [a, b] = drawings();
    copyToClipboard(textOf(a.shapes), a.id);
    for (const target of [a.id, b.id]) {
      const pasted = textOf(pasteFromClipboard(target))[0];
      expect(pasted.onPath).toBeDefined();
      expect(pasted.onPath!.source).toBeUndefined();
      expect('source' in pasted.onPath!).toBe(false);
      expect(pasted.onPath!.curve).toEqual(textOf(a.shapes)[0].onPath!.curve);
    }
  });

  it('does not snap back onto the original line when pasted beside it', () => {
    const [a] = drawings();
    copyToClipboard(textOf(a.shapes), a.id);
    const pasted = textOf(pasteFromClipboard(a.id))[0];
    store().update('Paste', (doc) => void (doc.drawings[a.id] as VectorDrawing).shapes.push(pasted));
    const stored = textOf(drawings()[0].shapes).find((s) => s.id === pasted.id)!;
    expect(stored.onPath!.curve).toEqual(pasted.onPath!.curve);
  });

  it('leaves words that had no line to begin with as they were', () => {
    setUp([words('free', null)]);
    const [a] = drawings();
    copyToClipboard(a.shapes, a.id);
    expect('source' in textOf(pasteFromClipboard(a.id))[0].onPath!).toBe(false);
  });
});
