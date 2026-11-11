// Follow-ups: Shift+X with gradients, recolour inside effects, perspective snapping, play range shifts, pixel pen and shapes.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PathShape } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getGradientWells, setPaintKind } from '../../src/tools/gradient-wells';
import { swapColors } from '../../src/tools/wells';
import { applyRecolour, recolourDoc, usedColours } from '../../src/tools/recolour';
import { newDoc } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { produce } from 'immer';
import { shiftInOut } from '../../src/timeline/inout';
import { insertFrameAll, removeFrameAll } from '../../src/timeline/ops';
import { resetStore } from '../../src/core/store';
import { docWith } from '../timeline/helpers';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { addShapes, box, ctx, drag, ptr, shapesNow, vectorStore } from './helpers';
import { constrainWithVanishing, snapToVanishing } from '../../src/canvas/grid';
import { snapLineEnd } from '../../src/canvas/guides';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { lineTool } from '../../src/tools/shapes';
import { penTool } from '../../src/tools/pen';

beforeEach(() => {
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  vectorStore();
  setPaintKind('fill', 'solid');
  setPaintKind('stroke', 'solid');
});

describe('Shift+X with gradients', () => {
  it('moves a gradient fill to the stroke box and back', () => {
    store().setUi({ fillColor: '#ff0000', color: '#000000', strokeOn: true });
    setPaintKind('fill', 'radial');
    swapColors();
    const g = getGradientWells();
    expect(g.fill).toBeNull();
    expect(g.stroke?.kind).toBe('radial');
    expect(store().get().ui.color).toBe(g.stroke!.stops[0].color);
    expect(store().get().ui.fillColor).toBe('#000000');
    swapColors();
    expect(getGradientWells().fill?.kind).toBe('radial');
    expect(getGradientWells().stroke).toBeNull();
  });

  it('swaps the gradients on selected shapes too', () => {
    addShapes({ ...box('b', 0, 0, 100, 50), stroke: { color: '#000000', width: 2, join: 'round', cap: 'round' } });
    store().setUi({ fillColor: '#ff0000', color: '#000000', strokeOn: true, selection: ['b'], activeWell: 'fill' });
    setPaintKind('fill', 'linear');
    expect((shapesNow()[0] as PathShape).fillGradient).toBeTruthy();
    swapColors();
    const s = shapesNow()[0] as PathShape;
    expect(s.fillGradient).toBeUndefined();
    expect(s.strokeGradient?.kind).toBe('linear');
    expect(s.fill).toBe('#000000');
  });
});

describe('recolour reaches effects', () => {
  it('swaps glow, shadow and outline colours on layers, folders and symbol layers', () => {
    const doc: Doc = newDoc({ width: 100, height: 100 });
    doc.layers[0].effects = [
      { id: 'g', kind: 'glow', values: { color: '#ff0000', radius: 4 } },
      { id: 's', kind: 'shadow', values: { color: '#000000', blur: 2 } },
    ];
    doc.folders = { f: { id: 'f', name: 'F', visible: true, opacity: 1, effects: [{ id: 'o', kind: 'outline', values: { color: '#FF0000', size: 2 } }] } };
    doc.symbols = { sy: { id: 'sy', name: 'S', layers: [{ ...doc.layers[0], id: 'sl' }], length: 1, origin: { x: 0, y: 0 } } };
    expect(usedColours(doc)).toContain('#ff0000');
    const r = recolourDoc(doc, '#ff0000', '#0000ff');
    expect(r.colours).toBe(3);
    expect(r.doc.layers[0].effects![0].values.color).toBe('#0000ff');
    expect(r.doc.layers[0].effects![1]).toBe(doc.layers[0].effects![1]);
    expect(r.doc.folders!.f.effects![0].values.color).toBe('#0000ff');
    expect(r.doc.symbols!.sy.layers[0].effects![0].values.color).toBe('#0000ff');
    const after = produce(doc, (d) => applyRecolour(d as Doc, r));
    expect(after.layers[0].effects![0].values.color).toBe('#0000ff');
    expect(after.folders!.f.effects![0].values.color).toBe('#0000ff');
    expect(after.symbols!.sy.layers[0].effects![0].values.color).toBe('#0000ff');
  });
});

describe('play range follows inserted and removed frames', () => {
  it('slides when frames go in before it, grows and shrinks when inside, ignores after', () => {
    const doc = newDoc({ length: 24 });
    doc.inOut = { start: 5, end: 10 };
    shiftInOut(doc, 2, 1);
    expect(doc.inOut).toEqual({ start: 6, end: 11 });
    shiftInOut(doc, 8, 1);
    expect(doc.inOut).toEqual({ start: 6, end: 12 });
    shiftInOut(doc, 20, 1);
    expect(doc.inOut).toEqual({ start: 6, end: 12 });
    shiftInOut(doc, 0, -1);
    expect(doc.inOut).toEqual({ start: 5, end: 11 });
    shiftInOut(doc, 5, -1);
    expect(doc.inOut).toEqual({ start: 5, end: 10 });
  });

  it('moves with Add a frame on all layers, in the same undo step', () => {
    const doc = docWith([[0, 4], [4, 4]]);
    doc.inOut = { start: 4, end: 7 };
    const s = resetStore(doc);
    s.setUi({ frame: 1 });
    expect(insertFrameAll().ok).toBe(true);
    expect(s.get().doc.inOut).toEqual({ start: 5, end: 8 });
    expect(removeFrameAll().ok).toBe(true);
    expect(s.get().doc.inOut).toEqual({ start: 4, end: 7 });
    s.undo();
    expect(s.get().doc.inOut).toEqual({ start: 5, end: 8 });
  });
});

describe('lines follow the perspective guides', () => {
  const vp = { x: 300, y: 100 };
  // Points on the ray from (0, 200) to the vanishing point have y + x / 3 = 200.
  const onRay = (p: { x: number; y: number }) => p.y + p.x / 3;
  it('pulls a line end onto the direction of a vanishing point when it comes close', () => {
    const hit = snapToVanishing({ x: 0, y: 100 }, { x: 150, y: 104 }, [vp], 6);
    expect(hit?.index).toBe(0);
    expect(hit?.pt.y).toBeCloseTo(100);
    expect(hit?.pt.x).toBeCloseTo(150);
    expect(snapToVanishing({ x: 0, y: 100 }, { x: 150, y: 140 }, [vp], 6)).toBeNull();
  });

  it('with Shift, takes the nearest of the 45 degree steps and the vanishing directions', () => {
    // From (0, 0) towards (300, 100) is about 18 degrees: nearer to that direction than to 0 or 45.
    const c = constrainWithVanishing({ x: 0, y: 0 }, { x: 150, y: 52 }, [vp]);
    expect(c.index).toBe(0);
    expect(c.pt.y / c.pt.x).toBeCloseTo(1 / 3);
    const flat = constrainWithVanishing({ x: 0, y: 0 }, { x: 150, y: 2 }, [vp]);
    expect(flat.index).toBeNull();
    expect(flat.pt.y).toBeCloseTo(0);
  });

  it('only while snapping is on, the guides show and Ctrl is up', () => {
    store().update('Perspective', (d) => void (d.perspective = { points: [vp] }));
    setViewSettings({ snap: true, perspective: true });
    const a = { x: 0, y: 250 };
    const b = { x: 100, y: 205 };
    // The ray from (0, 250) to (300, 100) has y + x / 2 = 250.
    const on = snapLineEnd(a, b, 1, false, false).pt;
    expect(on.y + on.x / 2).toBeCloseTo(250);
    expect(snapLineEnd(a, b, 1, true, false).pt).toEqual(b);
    setViewSettings({ perspective: false });
    expect(snapLineEnd(a, b, 1, false, false).pt).toEqual(b);
    setViewSettings({ perspective: true });
  });

  it('the Line tool and the pen draw along it', () => {
    store().update('Perspective', (d) => void (d.perspective = { points: [vp] }));
    setViewSettings({ snap: true, perspective: true, grid: 'off' });
    drag(lineTool, ctx(), [[0, 200], [150, 154]]);
    const l = shapesNow()[0] as PathShape;
    expect(onRay(l.paths[0].points[1])).toBeCloseTo(200);
    const c = ctx();
    penTool.down!(ptr(0, 200, { time: 50_000 }), c);
    penTool.up!(ptr(0, 200, { time: 50_000 }), c);
    // Shift, about 22 degrees up: nearer the vanishing direction (about 18) than 0 or 45.
    penTool.down!(ptr(150, 140, { shift: true, time: 52_000 }), c);
    penTool.up!(ptr(150, 140, { shift: true, time: 52_000 }), c);
    penTool.onKey!({ key: 'Enter' } as KeyboardEvent, c);
    const p = shapesNow()[1] as PathShape;
    expect(onRay(p.paths[0].points[1])).toBeCloseTo(200);
  });
});
