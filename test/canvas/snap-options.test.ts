import { beforeEach, describe, expect, it } from 'vitest';
import { angleSteps, artboardTargets, snapLineEnd, snapMove, snapPt, vanishingPoints } from '../../src/canvas/guides';
import { addLines, noTargets, snapBox, snappedKinds, snapPoint } from '../../src/canvas/snap';
import { activeTargets, defaultPicks, describeSnap, nothingTicked, sanitizePicks, SNAP_TARGETS, withPick, type SnapScene } from '../../src/canvas/snapModel';
import { setSnapOn, setSnapPick, toggleSnapPick, isPicked, resetSnapPicks } from '../../src/canvas/snapOps';
import { shapeLines } from '../../src/canvas/snapShapes';
import { getViewSettings, setViewSettings } from '../../src/canvas/viewSettings';
import { store } from '../../src/core/store';
import { getCommand } from '../../src/core/registry';
import '../../src/canvas';
import { addShapes, box, pixelStore, vectorStore } from '../tools/helpers';

const SHOWING: SnapScene = { guides: true, grid: 'square', perspective: true };
const set = (ctx: 'vector' | 'pixel' | 'artboard', over?: Partial<SnapScene>, bypass = false, on = true, picks = defaultPicks()) => [...activeTargets(on, picks, ctx, bypass, { ...SHOWING, ...over })].sort();

describe('which targets are in force', () => {
  it('vector work starts with the page, middle, guides, grid, other shapes, equal gaps, perspective, plugin guides and angle steps', () => {
    expect(set('vector')).toEqual(['angles', 'centre', 'grid', 'guides', 'page', 'perspective', 'plugins', 'shapes', 'spacing']);
  });
  it('pixel layers start with cells, perspective and angle steps only', () => {
    expect(set('pixel')).toEqual(['angles', 'cells', 'perspective']);
  });
  it('artboards start lined up with each other', () => {
    expect(set('artboard')).toEqual(['artboards']);
  });
  it('the master switch and Ctrl stop the pulls but not Shift angle steps', () => {
    expect(set('vector', {}, false, false)).toEqual(['angles']);
    expect(set('vector', {}, true)).toEqual(['angles']);
    expect(set('pixel', {}, true)).toEqual(['angles']);
  });
  it('a target only counts while there is something of it to snap to', () => {
    expect(set('vector', { guides: false })).not.toContain('guides');
    expect(set('vector', { grid: 'off' })).not.toContain('grid');
    expect(set('vector', { perspective: false })).not.toContain('perspective');
    expect(set('vector', { grid: 'iso' })).toContain('grid');
  });
  it('each tick turns its own target off, and only in its own kind of work', () => {
    const p = withPick(defaultPicks(), 'vector', 'guides', false);
    expect(set('vector', {}, false, true, p)).not.toContain('guides');
    expect(p.pixel.guides).toBe(false);
    const q = withPick(defaultPicks(), 'vector', 'shapes', true);
    expect(set('vector', {}, false, true, q)).toContain('shapes');
    expect(set('pixel', {}, false, true, q)).not.toContain('shapes');
    const a = withPick(defaultPicks(), 'artboard', 'artboards', true);
    expect(set('artboard', {}, false, true, a)).toEqual(['artboards']);
  });
  it('Pixel cells wins on a pixel layer; unticked, the page, guides and grid ticks count', () => {
    let p = withPick(defaultPicks(), 'pixel', 'guides', true);
    p = withPick(p, 'pixel', 'page', true);
    expect(set('pixel', {}, false, true, p)).toEqual(['angles', 'cells', 'perspective']);
    p = withPick(p, 'pixel', 'cells', false);
    expect(set('pixel', {}, false, true, p)).toEqual(['angles', 'guides', 'page', 'perspective']);
  });
  it('a tick that means nothing in a kind of work is ignored', () => {
    const p = withPick(defaultPicks(), 'pixel', 'shapes', true);
    expect(p.pixel.shapes).toBeUndefined();
    expect(withPick(defaultPicks(), 'vector', 'cells', true).vector.cells).toBeUndefined();
  });
  it('knows when nothing is ticked', () => {
    let p = defaultPicks();
    expect(nothingTicked(p, 'vector')).toBe(false);
    for (const t of SNAP_TARGETS) p = withPick(p, 'vector', t.id, false);
    expect(nothingTicked(p, 'vector')).toBe(true);
  });
});

describe('saved choices', () => {
  it('fill in anything missing and ignore junk', () => {
    expect(sanitizePicks(undefined)).toEqual(defaultPicks());
    expect(sanitizePicks('x')).toEqual(defaultPicks());
    const s = sanitizePicks({ vector: { guides: false, bogus: true, page: 'yes' }, pixel: 5, artboard: { artboards: true } });
    expect(s.vector.guides).toBe(false);
    expect(s.vector.page).toBe(true);
    expect('bogus' in s.vector).toBe(false);
    expect(s.pixel).toEqual(defaultPicks().pixel);
    expect(s.artboard.artboards).toBe(true);
  });
  it('keep what someone saved, and give the two new defaults to ticks that were never saved', () => {
    expect(defaultPicks().vector.shapes).toBe(true);
    expect(defaultPicks().artboard.artboards).toBe(true);
    const kept = sanitizePicks({ vector: { shapes: false }, artboard: { artboards: false } });
    expect(kept.vector.shapes).toBe(false);
    expect(kept.artboard.artboards).toBe(false);
    const older = sanitizePicks({ vector: { page: false } });
    expect(older.vector.page).toBe(false);
    expect(older.vector.shapes).toBe(true);
    expect(older.artboard.artboards).toBe(true);
  });
});

describe('saying what snapped', () => {
  it('names the kinds in plain words', () => {
    expect(describeSnap([])).toBe('');
    expect(describeSnap(['guides'])).toBe('Snapped to guide');
    expect(describeSnap(['page', 'guides', 'page'])).toBe('Snapped to page edge and guide');
    expect(describeSnap(['grid', 'shapes', 'angles'])).toBe('Snapped to grid, another shape and angle step');
  });
  it('lines carry their kind so a snap can be named', () => {
    const t = noTargets();
    addLines(t, 'page', [0, 100], [0]);
    addLines(t, 'guides', [37], []);
    expect(snapPoint({ x: 38, y: 50 }, t, 3).lines).toEqual([{ axis: 'x', at: 37, kind: 'guides' }]);
    const m = snapBox({ x: 0, y: 0, w: 10, h: 10 }, 89, 1, t, 3);
    expect(m.lines).toEqual([{ axis: 'x', at: 100, kind: 'page' }, { axis: 'y', at: 0, kind: 'page' }]);
  });
});

describe('other shapes as targets', () => {
  it('offers edges, middles and corner points, leaving out the excluded', () => {
    const a = box('a', 10, 20, 30, 40);
    const b = box('b', 100, 100, 20, 20);
    const l = shapeLines([a, b], new Set(['b']));
    expect(l.x).toEqual(expect.arrayContaining([10, 25, 40]));
    expect(l.y).toEqual(expect.arrayContaining([20, 40, 60]));
    expect(l.x).not.toContain(100);
  });
});

describe('snapping through the choices', () => {
  beforeEach(() => {
    vectorStore();
    setViewSettings({ snap: true, guides: true, grid: 'off', perspective: true });
    resetSnapPicks();
  });

  it('a point near the page edge snaps by default, and not once Page edges is off', () => {
    const w = store().get().doc.width;
    expect(snapPt({ x: w - 2, y: 300 }, 1, false).x).toBe(w);
    setSnapPick('vector', 'page', false);
    expect(snapPt({ x: w - 2, y: 300 }, 1, false).x).toBe(w - 2);
  });
  it('the page middle is its own tick', () => {
    const { width, height } = store().get().doc;
    setSnapPick('vector', 'centre', false);
    expect(snapPt({ x: width / 2 + 2, y: height / 2 + 2 }, 1, false)).toEqual({ x: width / 2 + 2, y: height / 2 + 2 });
    setSnapPick('vector', 'centre', true);
    expect(snapPt({ x: width / 2 + 2, y: height / 2 + 2 }, 1, false)).toEqual({ x: width / 2, y: height / 2 });
  });
  it('guides can be ticked off while the rest still snaps', () => {
    store().update('Guide', (d) => void (d.guides = [{ id: 'g', axis: 'x', at: 300 }]));
    expect(snapPt({ x: 302, y: 5 }, 1, false)).toEqual({ x: 300, y: 0 });
    expect(snappedKinds()).toEqual(['guides', 'page']);
    setSnapPick('vector', 'guides', false);
    expect(snapPt({ x: 302, y: 5 }, 1, false)).toEqual({ x: 302, y: 0 });
  });
  it('other shapes snap by default, can be ticked off, and the selection never snaps to itself', () => {
    addShapes(box('other', 250, 120, 50, 50));
    expect(snapPt({ x: 252, y: 90 }, 1, false).x).toBe(250);
    expect(snappedKinds()).toEqual(['shapes']);
    setSnapPick('vector', 'shapes', false);
    expect(snapPt({ x: 252, y: 90 }, 1, false).x).toBe(252);
    setSnapPick('vector', 'shapes', true);
    store().setUi({ selection: ['other'] });
    expect(snapPt({ x: 252, y: 90 }, 1, true).x).toBe(252);
    expect(snapPt({ x: 252, y: 90 }, 1, false, true).x).toBe(252);
    expect(snapMove({ x: 230, y: 90, w: 10, h: 10 }, 21, 0, 1, false).dx).toBe(21);
  });
  it('Ctrl and the master switch skip every pull', () => {
    const w = store().get().doc.width;
    expect(snapPt({ x: w - 2, y: 300 }, 1, true).x).toBe(w - 2);
    setSnapOn(false);
    expect(snapPt({ x: w - 2, y: 300 }, 1, false).x).toBe(w - 2);
    expect(getViewSettings().snap).toBe(false);
  });
  it('perspective lines follow their tick', () => {
    store().update('Perspective', (d) => void (d.perspective = { points: [{ x: 300, y: 100 }] }));
    expect(vanishingPoints(false)).toHaveLength(1);
    setSnapPick('vector', 'perspective', false);
    expect(vanishingPoints(false)).toEqual([]);
    const a = { x: 0, y: 250 };
    const b = { x: 100, y: 205 };
    expect(snapLineEnd(a, b, 1, false, false).pt).toEqual(b);
  });
  it('Shift angle steps follow their tick, with Ctrl or the switch not stopping them', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 3 };
    expect(angleSteps()).toBe(true);
    setSnapOn(false);
    expect(angleSteps()).toBe(true);
    expect(snapLineEnd(a, b, 1, true, true)).toEqual({ pt: b, constrained: false });
    setSnapPick('vector', 'angles', false);
    expect(angleSteps()).toBe(false);
    // Shift does nothing, and the caller is told it is dealt with so it won't turn the line itself.
    expect(snapLineEnd(a, b, 1, false, true).constrained).toBe(true);
  });
  it('toggling a target for the layer in hand flips only that layer kind', () => {
    expect(isPicked('angles')).toBe(true);
    toggleSnapPick('angles');
    expect(isPicked('angles')).toBe(false);
    expect(getViewSettings().snapPicks.vector.angles).toBe(false);
    expect(getViewSettings().snapPicks.pixel.angles).toBe(true);
  });
});

describe('on a pixel layer', () => {
  beforeEach(() => {
    pixelStore();
    setViewSettings({ snap: true, guides: true, grid: 'off', perspective: true });
    resetSnapPicks();
    store().update('Guide', (d) => void (d.guides = [{ id: 'g', axis: 'x', at: 300 }]));
  });
  it('keeps to cells: guides and the page do not pull', () => {
    expect(snapPt({ x: 302, y: 5 }, 1, false)).toEqual({ x: 302, y: 5 });
    toggleSnapPick('angles');
    expect(getViewSettings().snapPicks.pixel.angles).toBe(false);
    expect(getViewSettings().snapPicks.vector.angles).toBe(true);
  });
  it('snaps to guides once Pixel cells is off and Guides is ticked for pixel layers', () => {
    setSnapPick('pixel', 'cells', false);
    setSnapPick('pixel', 'guides', true);
    expect(snapPt({ x: 302, y: 5 }, 1, false).x).toBe(300);
  });
  it('perspective directions and angle steps still work', () => {
    store().update('Perspective', (d) => void (d.perspective = { points: [{ x: 300, y: 100 }] }));
    expect(vanishingPoints(false)).toHaveLength(1);
    expect(angleSteps()).toBe(true);
  });
});

describe('artboards', () => {
  beforeEach(() => resetSnapPicks());
  it('offer their edges and middles by default, and nothing once unticked', () => {
    const others = [{ x: 100, y: 0, w: 200, h: 100 }];
    const t = artboardTargets(others, false)!;
    expect(t.x).toEqual([100, 200, 300]);
    expect(t.ky).toEqual(['artboards', 'artboards', 'artboards']);
    expect(artboardTargets(others, true)).toBeNull();
    expect(artboardTargets([], false)).toBeNull();
    setSnapPick('artboard', 'artboards', false);
    expect(artboardTargets(others, false)).toBeNull();
  });
});

describe('commands', () => {
  it('there is a command for every target, and one to open the options', () => {
    for (const t of SNAP_TARGETS) expect(getCommand(`view.snap.${t.id}`), t.id).toBeTruthy();
    expect(getCommand('view.snapOptions')).toBeTruthy();
    expect(getCommand('view.snap')).toBeTruthy();
  });
});
