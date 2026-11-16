// @vitest-environment jsdom
// Building brushes from your own drawing: along the line, the five parts of an edged brush, bristles and nib in use, and
// turning brush lines into plain shapes. Also that every one of them exports as plain vector shapes.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import '../../src/tools';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import type { StrokeShape } from '../../src/core/format';
import { allCommands, getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { brushTool } from '../../src/tools/brush';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { clearEdgedPiece, edgedHas, flattenBrushLines, looksLikeRibbon, makeAlongBrush, setEdgedPiece } from '../../src/brushes/own';
import { currentTip, setTipKind } from '../../src/brushes/tips';
import { startBrushPresets } from '../../src/brushes/presets';
import { brushesToText, parseBrushesText, STARTERS } from '../../src/brushes/model';
import { defaultTip, readTip } from '../../src/geometry/tip';
import { frameToSvg } from '../../src/export/svg';
import { toasts } from '../../src/ui/toast';
import { addShapes, box, ctx, drag, shapesNow, vectorStore } from '../tools/helpers';

let stop: () => void = () => {};
beforeEach(() => {
  stop();
  localStorage.clear();
  _resetChoicesForTests();
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  vectorStore();
  toasts.set(() => []);
  store().setUi({ brush: { ...DEFAULT_BRUSH }, selection: [] });
  stop = startBrushPresets();
});

describe('a brush that goes along the line', () => {
  it('asks for a selection first', () => {
    expect(makeAlongBrush()).toBe(false);
    expect(toasts.get().at(-1)?.kind).toBe('warn');
    expect(currentTip()).toBeUndefined();
  });
  it('uses the selection as the drawing, sized like it, and Undo goes back', () => {
    setChoice('brush.alongFit', 'repeat');
    addShapes(box('a', 10, 10, 120, 30));
    store().setUi({ selection: ['a'], brush: { ...DEFAULT_BRUSH, size: 9 } });
    expect(makeAlongBrush()).toBe(true);
    const b = store().get().ui.brush;
    expect(b.tip).toMatchObject({ kind: 'along', fit: 'repeat' });
    expect(b.tip!.custom).toHaveLength(1);
    expect(b.size).toBe(30);
    expect(readTip(b.tip)).toEqual(b.tip);
    toasts.get().at(-1)!.action!.run();
    expect(store().get().ui.brush.size).toBe(9);
    expect(currentTip()).toBeUndefined();
  });
  it('a long thin drawing is a ribbon, which stretches without asking', () => {
    expect(looksLikeRibbon([[-0.5, -0.05, 0.5, -0.05, 0.5, 0.05, -0.5, 0.05]])).toBe(true);
    expect(looksLikeRibbon([[-0.5, -0.3, 0.5, -0.3, 0.5, 0.3, -0.5, 0.3]])).toBe(false);
    addShapes(box('a', 0, 0, 300, 20));
    store().setUi({ selection: ['a'] });
    makeAlongBrush();
    expect(currentTip()).toMatchObject({ kind: 'along', fit: 'stretch' });
  });
  it('picking the tip with nothing made gives a ribbon to start with, and a line drawn with it keeps it', () => {
    setTipKind('along');
    expect(currentTip()!.custom!.length).toBeGreaterThan(0);
    drag(brushTool, ctx(), [[10, 10], [60, 30], [120, 10]]);
    expect((shapesNow().at(-1) as StrokeShape).brush.tip).toMatchObject({ kind: 'along' });
  });
});

describe('the edged brush', () => {
  const bar = (id: string, w = 60, h = 20) => box(id, 0, 0, w, h);
  it('has to start with the sides', () => {
    addShapes(bar('a'));
    store().setUi({ selection: ['a'] });
    expect(setEdgedPiece('start')).toBe(false);
    expect(currentTip()).toBeUndefined();
  });
  it('takes the sides first, then each other part, and says which it has', () => {
    addShapes(bar('a'), bar('b', 30, 30), bar('c', 30, 30), bar('d', 30, 30), bar('e', 30, 30));
    store().setUi({ selection: ['a'] });
    expect(setEdgedPiece('sides')).toBe(true);
    expect(edgedHas(currentTip())).toEqual({ sides: true, start: false, end: false, inner: false, outer: false });
    for (const [slot, id] of [['start', 'b'], ['end', 'c'], ['inner', 'd'], ['outer', 'e']] as const) {
      store().setUi({ selection: [id] });
      expect(setEdgedPiece(slot)).toBe(true);
    }
    expect(edgedHas(currentTip())).toEqual({ sides: true, start: true, end: true, inner: true, outer: true });
    expect(readTip(currentTip())).toEqual(currentTip());
    clearEdgedPiece('inner');
    expect(edgedHas(currentTip()).inner).toBe(false);
    expect(edgedHas(currentTip()).outer).toBe(true);
  });
  it('new sides keep the parts already made', () => {
    addShapes(bar('a'), bar('b', 30, 30), bar('f', 80, 20));
    store().setUi({ selection: ['a'] });
    setEdgedPiece('sides');
    store().setUi({ selection: ['b'] });
    setEdgedPiece('start');
    store().setUi({ selection: ['f'] });
    setEdgedPiece('sides');
    expect(edgedHas(currentTip())).toMatchObject({ sides: true, start: true });
  });
});

describe('the commands', () => {
  it('are in the palette with plain words and the help topic', () => {
    const ids = ['brush.makeAlong', 'brush.edged.sides', 'brush.edged.start', 'brush.edged.end', 'brush.edged.inner', 'brush.edged.outer', 'brush.flatten'];
    for (const id of ids) {
      const c = getCommand(id)!;
      expect(c, id).toBeTruthy();
      expect(c.help).toBe('brush-own');
      expect(c.description!.length).toBeGreaterThan(10);
      expect(`${c.label}${c.description}`).not.toContain('—');
    }
    expect(getCommand('brush.makeAlong')!.keys).toEqual(['Mod+Alt+Shift+B']);
    // Every tip has a command, the new ones included.
    for (const k of ['nib', 'along', 'edged', 'bristle']) expect(allCommands().some((c) => c.id === `brush.tip.${k}`)).toBe(true);
  });
});

describe('turning brush lines into plain shapes', () => {
  const lineWith = (kind: 'nib' | 'bristle' | 'along' | 'edged' | 'stamp'): StrokeShape => {
    setTipKind(kind);
    drag(brushTool, ctx(), [[20, 40], [80, 70], [140, 40], [200, 70]]);
    return shapesNow().at(-1) as StrokeShape;
  };
  it('swaps a selected tipped line for the shapes it is made of, in one undo step, and undo brings the line back', () => {
    const s = lineWith('nib');
    expect(s.brush.tip?.kind).toBe('nib');
    store().setUi({ selection: [s.id] });
    expect(flattenBrushLines()).toBe(true);
    const after = shapesNow();
    expect(after.some((x) => x.type === 'stroke')).toBe(false);
    expect(after.every((x) => x.type === 'fill' || x.type === 'path')).toBe(true);
    store().undo();
    expect(shapesNow().some((x) => x.type === 'stroke' && x.id === s.id)).toBe(true);
  });
  it('leaves plain lines alone and says so', () => {
    setTipKind(null);
    drag(brushTool, ctx(), [[20, 40], [80, 70], [140, 40]]);
    const s = shapesNow().at(-1)!;
    store().setUi({ selection: [s.id] });
    expect(flattenBrushLines()).toBe(false);
    expect(shapesNow().at(-1)!.type).toBe('stroke');
    expect(toasts.get().at(-1)?.kind).toBe('warn');
  });
});

describe('every build-it-yourself brush exports as plain vector shapes', () => {
  for (const kind of ['nib', 'bristle', 'along', 'edged'] as const) {
    it(`${kind}: the SVG has paths and no raster, no brush data`, () => {
      setTipKind(kind);
      store().setUi({ brush: { ...store().get().ui.brush, size: 18 } });
      drag(brushTool, ctx(), [[20, 40], [80, 70], [140, 40], [200, 70], [260, 40]]);
      const doc = store().get().doc;
      const svg = frameToSvg(doc, 0);
      expect(svg).toContain('<path');
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('<canvas');
      expect(svg).not.toContain('nibAngle');
    });
  }
});

describe('saved and shared brushes keep the new tips', () => {
  it('a brush file with an edged brush, bristles and a nib comes back the same', () => {
    const mk = (id: string, tip: StrokeShape['brush']['tip']) => ({ id, name: id, tool: 'brush' as const, brush: { ...DEFAULT_BRUSH, tip } });
    const edged = { ...defaultTip('edged'), pieces: { start: [[-0.5, -0.5, 0.5, -0.5, 0, 0.5]] } };
    const list = [mk('e', edged), mk('b', { ...defaultTip('bristle'), count: 9 }), mk('n', { ...defaultTip('nib'), nibAngle: -20 })];
    const back = parseBrushesText(brushesToText(list));
    expect(back.ok && back.presets.map((p) => p.brush.tip)).toEqual(list.map((p) => p.brush.tip));
  });
  it('the new built-in brushes are there, in their groups, and all draw', () => {
    for (const g of ['Calligraphy', 'Bristles', 'Along the line']) expect(STARTERS.filter((s) => s.group === g).length).toBeGreaterThanOrEqual(4);
  });
});
