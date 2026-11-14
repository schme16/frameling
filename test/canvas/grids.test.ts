import { beforeEach, describe, expect, it } from 'vitest';
import { defaultVanishing, gridStep, isoLines, isoLinesIn, isoRatio, moveVanishing, rayTargets, snapIso, snapSquare, squareLines } from '../../src/canvas/grid';
import { lightTableItems, pinLightTable, clearLightTable } from '../../src/canvas/lightTable';
import { drawGrid, setPerspective } from '../../src/canvas/gridView';
import { snapPt } from '../../src/canvas/guides';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { resetStore, store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import { loadFile, saveFile } from '../../src/io/file';
import { addCel, docWith } from '../timeline/helpers';

describe('square grid', () => {
  it('lines every size pixels, edges included', () => {
    expect(squareLines(25, 100, 50)).toEqual({ x: [0, 25, 50, 75, 100], y: [0, 25, 50] });
    expect(squareLines(0, 100, 50)).toEqual({ x: [], y: [] });
  });
  it('snaps to the nearest corner', () => {
    expect(snapSquare({ x: 12, y: 38 }, 25)).toEqual({ x: 0, y: 50 });
  });
  it('thins out lines when zoomed far out', () => {
    expect(gridStep(16, 1)).toBe(1);
    expect(gridStep(4, 0.5)).toBe(3);
  });
});

describe('isometric grid', () => {
  it('2:1 diamonds are half as tall as wide, true isometric is 30 degrees', () => {
    expect(isoRatio('2:1')).toBe(0.5);
    expect(isoRatio('30')).toBeCloseTo(0.57735, 4);
  });
  it('snaps to corners, which sit on both families of lines', () => {
    // 32 wide, 16 tall: corners at (0,0), (16,8), (32,0), (0,16)...
    expect(snapIso({ x: 15, y: 9 }, 32, 0.5)).toEqual({ x: 16, y: 8 });
    expect(snapIso({ x: 2, y: 15 }, 32, 0.5)).toEqual({ x: 0, y: 16 });
    expect(snapIso({ x: 30, y: 1 }, 32, 0.5)).toEqual({ x: 32, y: 0 });
  });
  it('lines cover the page and stay inside it', () => {
    const lines = isoLines(32, 0.5, 128, 64);
    expect(lines.length).toBeGreaterThan(8);
    for (const [a, b] of lines) for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x).toBeLessThanOrEqual(128 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y).toBeLessThanOrEqual(64 + 1e-6);
    }
    // Every line passes through grid corners: (16, 8) is on a rising and a falling one.
    const on = (x: number, y: number) => lines.filter(([a, b]) => Math.abs((b.y - a.y) * (x - a.x) - (b.x - a.x) * (y - a.y)) < 1e-6).length;
    expect(on(16, 8)).toBe(2);
  });
});

describe('snapping with a grid showing', () => {
  beforeEach(() => {
    resetStore(docWith([[0, 1]], 4));
    setViewSettings({ snap: true, guides: true, gridSize: 20 });
  });
  it('square grid lines are snap targets', () => {
    setViewSettings({ grid: 'square' });
    expect(snapPt({ x: 41, y: 59 }, 1, false)).toEqual({ x: 40, y: 60 });
    // Ctrl held: no snapping.
    expect(snapPt({ x: 41, y: 59 }, 1, true)).toEqual({ x: 41, y: 59 });
  });
  it('isometric corners pull points in', () => {
    setViewSettings({ grid: 'iso', isoStyle: '2:1' });
    expect(snapPt({ x: 11, y: 4 }, 1, false)).toEqual({ x: 10, y: 5 });
  });
  it('no grid, no grid snapping', () => {
    setViewSettings({ grid: 'off' });
    expect(snapPt({ x: 41, y: 59 }, 1, false)).toEqual({ x: 41, y: 59 });
  });
});

describe('perspective guides', () => {
  it('places one or two vanishing points on a horizon', () => {
    expect(defaultVanishing(1, 200, 100)).toEqual([{ x: 100, y: 42 }]);
    const two = defaultVanishing(2, 200, 100);
    expect(two[0].y).toBe(two[1].y);
  });
  it('keeps the horizon level unless Shift is held', () => {
    const pts = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    expect(moveVanishing(pts, 0, { x: 10, y: 30 }, false)).toEqual([{ x: 10, y: 30 }, { x: 100, y: 30 }]);
    expect(moveVanishing(pts, 0, { x: 10, y: 30 }, true)).toEqual([{ x: 10, y: 30 }, { x: 100, y: 50 }]);
  });
  it('aims rays all round the page edge', () => {
    const t = rayTargets(100, 50, 6);
    expect(t).toHaveLength(6);
    expect(t[0]).toEqual({ x: 0, y: 0 });
    for (const p of t) expect(p.x === 0 || p.x === 100 || p.y === 0 || p.y === 50).toBe(true);
  });
  it('setting them is undoable, keeps the horizon going from one to two, and is saved', async () => {
    const s = resetStore(docWith([[0, 1]], 4));
    setPerspective(1);
    const one = s.get().doc.perspective!.points;
    expect(one).toHaveLength(1);
    setPerspective(2);
    expect(s.get().doc.perspective!.points.every((p) => p.y === one[0].y)).toBe(true);
    const back = await loadFile(await saveFile(s.get().doc));
    expect(back.doc.perspective).toEqual(s.get().doc.perspective);
    setPerspective(0);
    expect(s.get().doc.perspective).toBeUndefined();
    s.undo();
    expect(s.get().doc.perspective!.points).toHaveLength(2);
  });
});

describe('light table', () => {
  it('shows the pinned frame on other frames, but not on top of itself', () => {
    const doc = docWith([[0, 2], [2, 2]], 4);
    const lt = { frame: 0, opacity: 0.3 };
    expect(lightTableItems(doc, lt, 3)).toHaveLength(1);
    expect(lightTableItems(doc, lt, 3)[0].drawing.id).toBe(doc.layers[0].cels[0].drawingId);
    expect(lightTableItems(doc, lt, 1)).toHaveLength(0);
    expect(lightTableItems(doc, null, 3)).toHaveLength(0);
    expect(lightTableItems(doc, { frame: 9, opacity: 0.3 }, 3)).toHaveLength(0);
  });
  it('can show just one layer, even a hidden one', () => {
    const doc = docWith([[0, 2]], 4);
    const extra = { ...doc.layers[0], id: 'L2', name: 'two', cels: [] as typeof doc.layers[0]['cels'], visible: false };
    doc.layers.push(extra);
    addCel(doc, extra, 0, 1);
    expect(lightTableItems(doc, { frame: 0, opacity: 0.3 }, 3)).toHaveLength(1);
    expect(lightTableItems(doc, { frame: 0, layerId: 'L2', opacity: 0.3 }, 3)[0].drawing.id).toBe(extra.cels[0].drawingId);
  });
  it('pins, toggles off when pinned again, and clears', () => {
    const s = resetStore(docWith([[0, 1]], 4));
    pinLightTable(2);
    expect(s.get().ui.lightTable).toEqual({ frame: 2, opacity: 0.3 });
    pinLightTable(2);
    expect(s.get().ui.lightTable).toBeNull();
    pinLightTable(1, 'x');
    expect(s.get().ui.lightTable?.layerId).toBe('x');
    clearLightTable();
    expect(s.get().ui.lightTable).toBeNull();
  });
});

describe('the grid on a layer behind a moving camera', () => {
  it('isoLinesIn over the page matches isoLines, and over a bigger box stays inside it on the same lines', () => {
    expect(isoLinesIn(32, 0.5, { x0: 0, y0: 0, x1: 128, y1: 64 })).toEqual(isoLines(32, 0.5, 128, 64));
    const box = { x0: -100, y0: -50, x1: 300, y1: 200 };
    const lines = isoLinesIn(32, 0.5, box);
    expect(lines.length).toBeGreaterThan(isoLines(32, 0.5, 128, 64).length);
    for (const [a, b] of lines) for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(box.x0 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(box.x1 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(box.y0 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(box.y1 + 1e-6);
    }
    const on = (x: number, y: number) => lines.filter(([a, b]) => Math.abs((b.y - a.y) * (x - a.x) - (b.x - a.x) * (y - a.y)) < 1e-6).length;
    expect(on(-16, 8)).toBe(2);
  });

  const recorder = () => {
    const segs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    const g = {
      save() {}, restore() {}, clip() {}, stroke() {},
      beginPath() {}, closePath() {},
      moveTo(x: number, y: number) { cur = [{ x, y }]; segs.push(cur); },
      lineTo(x: number, y: number) { cur.push({ x, y }); },
      lineWidth: 1, strokeStyle: '', globalAlpha: 1, fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    return { g, segs };
  };

  it('with no camera the square grid stays on the page, without a line on its edges', () => {
    resetStore(newDoc({ width: 200, height: 100 }));
    setViewSettings({ grid: 'square', gridSize: 50 });
    const { g, segs } = recorder();
    drawGrid(g, 1, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }]);
    const xs = segs.slice(1).filter((s) => s[0].x === s[1].x).map((s) => s[0].x);
    expect(xs).toEqual([50, 100, 150]);
    const ys = segs.slice(1).filter((s) => s[0].y === s[1].y).map((s) => s[0].y);
    expect(ys).toEqual([50]);
  });
  it('on a far layer the grid covers the whole picture, which falls beyond the layer\'s own page', () => {
    resetStore(newDoc({ width: 200, height: 100 }));
    setViewSettings({ grid: 'square', gridSize: 50 });
    const { g, segs } = recorder();
    // The camera has the picture falling on layer space -120..320 across and -40..160 down.
    drawGrid(g, 1, [{ x: -120, y: -40 }, { x: 320, y: -40 }, { x: 320, y: 160 }, { x: -120, y: 160 }]);
    const xs = segs.slice(1).filter((s) => s[0].x === s[1].x).map((s) => s[0].x);
    expect(xs).toEqual([-100, -50, 0, 50, 100, 150, 200, 250, 300]);
    const ys = segs.slice(1).filter((s) => s[0].y === s[1].y).map((s) => s[0].y);
    expect(ys).toEqual([0, 50, 100, 150].filter((y) => y > -40 && y < 160));
    // Every line runs the full height (or width) of the picture's box.
    for (const s of segs.slice(1).filter((s) => s[0].x === s[1].x)) expect([s[0].y, s[1].y]).toEqual([-40, 160]);
  });
});
