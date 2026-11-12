// Snap distance, equal gaps, per-target colours and the all-layers choice.
import { beforeEach, describe, expect, it } from 'vitest';
import { getSnapGaps, snappedKinds } from '../../src/canvas/snap';
import { snapMove, snapPt } from '../../src/canvas/guides';
import { clampDistance, defaultPicks, describeSnap, SNAP_DISTANCE, snapColourVar, snapNoteParts, SNAP_TARGETS } from '../../src/canvas/snapModel';
import { resetSnapPicks, setSnapAllLayers, setSnapDistance, setSnapPick } from '../../src/canvas/snapOps';
import { spacingAxis, spacingFor } from '../../src/canvas/snapSpacing';
import { otherShapes } from '../../src/canvas/snapShapes';
import { getViewSettings, setViewSettings, snapPx } from '../../src/canvas/viewSettings';
import { newVectorLayer } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import '../../src/canvas';
import { addShapes, box, vectorStore } from '../tools/helpers';

const R = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('snap distance', () => {
  beforeEach(() => {
    vectorStore();
    setViewSettings({ snap: true, guides: true, grid: 'off', perspective: true });
    resetSnapPicks();
  });
  it('is 6 pixels to begin with and stays inside 2 to 24', () => {
    expect(snapPx()).toBe(SNAP_DISTANCE.usual);
    setSnapDistance(100);
    expect(snapPx()).toBe(24);
    setSnapDistance(0);
    expect(snapPx()).toBe(2);
    expect(clampDistance('x')).toBe(6);
    expect(clampDistance(7.6)).toBe(8);
  });
  it('decides how close a point has to come, in screen pixels', () => {
    const w = store().get().doc.width;
    expect(snapPt({ x: w - 10, y: 150 }, 1, false).x).toBe(w - 10);
    setSnapDistance(12);
    expect(snapPt({ x: w - 10, y: 150 }, 1, false).x).toBe(w);
    // Zoomed in, the same screen distance is fewer art pixels.
    expect(snapPt({ x: w - 10, y: 150 }, 4, false).x).toBe(w - 10);
    setSnapDistance(2);
    expect(snapPt({ x: w - 3, y: 150 }, 1, false).x).toBe(w - 3);
  });
  it('goes back to the usual with the other choices', () => {
    setSnapDistance(20);
    resetSnapPicks();
    expect(snapPx()).toBe(6);
  });
});

describe('equal gaps (pure)', () => {
  const a = R(0, 0, 20, 20);
  const b = R(40, 0, 20, 20); // 20 gap from a
  it('puts a box one gap past a neighbour, with both gaps marked', () => {
    const hit = spacingAxis(R(81, 0, 20, 20), 'x', [a, b], 4)!;
    expect(hit.d).toBe(-1);
    expect(hit.gaps.map((g) => g.label)).toEqual([20, 20]);
    expect(hit.gaps[0]).toMatchObject({ axis: 'x', from: 60, to: 80 });
  });
  it('keeps the real size of a gap that is not a whole number', () => {
    const hit = spacingAxis(R(80, 0, 20, 20), 'x', [R(0, 0, 20, 20), R(40.3, 0, 20, 20)], 4)!;
    expect(hit.gaps.map((g) => g.label)).toEqual([20.3, 20.3]);
    expect(hit.d).toBeCloseTo(0.6, 5);
  });
  it('also works on the other side of a pair', () => {
    expect(spacingAxis(R(-39, 0, 20, 20), 'x', [a, b], 4)!.d).toBe(-1);
  });
  it('centres a box between two shapes', () => {
    const hit = spacingAxis(R(52, 0, 10, 20), 'x', [R(0, 0, 20, 20), R(100, 0, 20, 20)], 4)!;
    expect(hit.d).toBe(3);
    expect(hit.gaps.map((g) => g.label)).toEqual([35, 35]);
  });
  it('is quiet when out of reach or not in the same row', () => {
    expect(spacingAxis(R(95, 0, 20, 20), 'x', [a, b], 4)).toBeNull();
    expect(spacingAxis(R(81, 200, 20, 20), 'x', [a, b], 4)).toBeNull();
    expect(spacingFor(R(0, 0, 5, 5), [], 4)).toEqual({ x: null, y: null });
  });
  it('works down the page too, and for a point', () => {
    const c = R(0, 0, 20, 20);
    const d = R(0, 40, 20, 20);
    expect(spacingAxis(R(0, 83, 20, 20), 'y', [c, d], 4)!.d).toBe(-3);
    expect(spacingAxis(R(30, 0, 0, 0), 'x', [a, b], 4)).toBeNull();
    expect(spacingAxis(R(81, 10, 0, 0), 'x', [a, b], 4)!.d).toBe(-1);
  });
});

describe('equal gaps while moving and drawing', () => {
  beforeEach(() => {
    vectorStore();
    setViewSettings({ snap: true, guides: false, grid: 'off', perspective: true, snapAllLayers: true });
    resetSnapPicks();
    // Nothing else pulls: only the gaps.
    for (const t of ['page', 'centre', 'guides', 'grid', 'shapes'] as const) setSnapPick('vector', t, false);
    addShapes(box('a', 20, 100, 40, 40), box('b', 100, 100, 40, 40));
  });
  it('is off to begin with, so nothing changes until someone asks', () => {
    expect(defaultPicks().vector.spacing).toBe(false);
    expect(snapMove(R(300, 100, 40, 40), -1, 0, 1, false).dx).toBe(-1);
    expect(getSnapGaps()).toHaveLength(0);
  });
  it('moves a box to the equal gap and records the gaps', () => {
    setSnapPick('vector', 'spacing', true);
    // a and b are 40 apart; a box 41 after b wants 40.
    const m = snapMove(R(300, 100, 40, 40), -119, 0, 1, false);
    expect(m.dx).toBe(-120);
    expect(getSnapGaps().map((g) => g.label)).toEqual([40, 40]);
    expect(snappedKinds()).toEqual(['spacing']);
  });
  it('drawing a point lands a gap away from a neighbour', () => {
    setSnapPick('vector', 'spacing', true);
    const p = snapPt({ x: 183, y: 120 }, 1, false);
    expect(p.x).toBe(180);
    expect(getSnapGaps().length).toBeGreaterThan(0);
  });
  it('a nearer line wins over a gap', () => {
    setSnapPick('vector', 'spacing', true);
    setSnapPick('vector', 'page', true);
    // A guide right under the pointer needs no move, so it beats the gap 2 pixels away.
    store().update('Guide', (d) => void (d.guides = [{ id: 'g', axis: 'x', at: 182 }]));
    setSnapPick('vector', 'guides', true);
    setViewSettings({ guides: true });
    expect(snapPt({ x: 182, y: 120 }, 1, false).x).toBe(182);
    expect(snappedKinds()).toEqual(['guides']);
  });
  it('Ctrl skips it', () => {
    setSnapPick('vector', 'spacing', true);
    expect(snapPt({ x: 183, y: 120 }, 1, true).x).toBe(183);
  });
  it('has a command and a tick', () => {
    expect(getCommand('view.snap.spacing')).toBeTruthy();
    expect(SNAP_TARGETS.find((t) => t.id === 'spacing')!.contexts).toEqual(['vector']);
  });
});

describe('all layers, not just this one', () => {
  beforeEach(() => {
    vectorStore();
    setViewSettings({ snap: true, guides: false, grid: 'off', perspective: true, snapAllLayers: true });
    resetSnapPicks();
    addShapes(box('first', 250, 120, 50, 50));
    store().update('Second layer', (d) => void d.layers.push(newVectorLayer('Second')));
    store().setUi({ activeLayerId: store().get().doc.layers[1].id });
    addShapes(box('second', 10, 10, 20, 20));
  });
  it('looks at every visible layer by default', () => {
    expect(snapPt({ x: 252, y: 200 }, 1, false).x).toBe(250);
  });
  it('looks at the open layer only when ticked off', () => {
    setSnapAllLayers(false);
    expect(snapPt({ x: 252, y: 200 }, 1, false).x).toBe(252);
    expect(snapPt({ x: 12, y: 200 }, 1, false).x).toBe(10);
    store().setUi({ activeLayerId: store().get().doc.layers[0].id });
    expect(snapPt({ x: 252, y: 200 }, 1, false).x).toBe(250);
  });
  it('limits the boxes for equal gaps the same way', () => {
    const { doc, ui } = store().get();
    expect(otherShapes(doc, ui.frame, [], null).boxes).toHaveLength(2);
    expect(otherShapes(doc, ui.frame, [], ui.activeLayerId).boxes).toEqual([{ x: 10, y: 10, w: 20, h: 20 }]);
  });
  it('is saved with the view settings and has a command', () => {
    setSnapAllLayers(false);
    expect(getViewSettings().snapAllLayers).toBe(false);
    getCommand('view.snap.allLayers')!.run();
    expect(getViewSettings().snapAllLayers).toBe(true);
  });
});

describe('the "Snapped to" note', () => {
  it('lists each thing once with its colour variable, for every target', () => {
    const parts = snapNoteParts(['guides', 'page', 'guides', 'spacing']);
    expect(parts.map((p) => p.word)).toEqual(['guide', 'page edge', 'equal gap']);
    expect(describeSnap(['guides', 'page', 'spacing'])).toBe('Snapped to guide, page edge and equal gap');
    for (const t of SNAP_TARGETS) expect(snapColourVar(t.id)).toBe(`--snap-${t.id}`);
  });
});
