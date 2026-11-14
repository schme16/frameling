// @vitest-environment jsdom
// Brush tips in use: picking one, changing it, saved brushes remembering it, the commands, and brushes made from a
// selection on a drawing layer and on a pixel layer.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import '../../src/tools';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import type { PixelDrawing, StrokeShape } from '../../src/core/format';
import { allCommands, getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { brushTool } from '../../src/tools/brush';
import { gridPixels } from '../../src/core/pixelBounds';
import { DEFAULT_TOOL_SETTINGS, getToolSettings, setToolSettings } from '../../src/tools/settings';
import { forgetLastPixelEnd } from '../../src/tools/pixelStroke';
import { setPixelSelection } from '../../src/select/pixel-state';
import { rectMask } from '../../src/select/mask';
import { brushesToText, parseBrushesText, sameBrush, STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { startBrushPresets } from '../../src/brushes/presets';
import { clearPixelStamp, currentTip, makeBrushFromSelection, patchTip, pixelBrushStamp, setPixelStampKeep, setStampShape, setTipKind, stepTip } from '../../src/brushes/tips';
import { toasts } from '../../src/ui/toast';
import { addShapes, box, ctx, drag, pixelStore, shapesNow, vectorStore } from '../tools/helpers';

let stop: () => void = () => {};
beforeEach(() => {
  stop();
  localStorage.clear();
  _resetChoicesForTests();
  setToolSettings({ ...DEFAULT_TOOL_SETTINGS });
  vectorStore();
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    P.deleteActive();
  }
  toasts.set(() => []);
  store().setUi({ brush: { ...DEFAULT_BRUSH } });
  stop = startBrushPresets();
});

describe('picking and changing a tip', () => {
  it('gives the brush a tip of the kind with its usual settings, and Plain takes it away', () => {
    setTipKind('chalk');
    expect(currentTip()).toMatchObject({ kind: 'chalk' });
    setTipKind(null);
    expect(currentTip()).toBeUndefined();
    expect('tip' in store().get().ui.brush).toBe(false);
  });
  it('leaves the brush alone when the tip is already that kind (so a changed slider is not lost)', () => {
    setTipKind('charcoal');
    patchTip({ amount: 0.2 });
    setTipKind('charcoal');
    expect(currentTip()?.amount).toBe(0.2);
  });
  it('changes some settings of the tip, and does nothing on a plain line', () => {
    patchTip({ amount: 0.9 });
    expect(currentTip()).toBeUndefined();
    setTipKind('stamp');
    patchTip({ spacing: 2 });
    expect(currentTip()?.spacing).toBe(2);
  });
  it('a built-in stamp turns the way it usually goes; Yours keeps the angle', () => {
    setTipKind('stamp');
    setStampShape('star');
    expect(currentTip()).toMatchObject({ shape: 'star', angle: 'random' });
    setStampShape('leaf');
    expect(currentTip()?.angle).toBe('follow');
    patchTip({ angle: 'upright' });
    setStampShape('custom');
    expect(currentTip()?.angle).toBe('upright');
  });
  it('steps round through Plain and the tips, both ways', () => {
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      stepTip(1);
      seen.push(currentTip()?.kind ?? 'plain');
    }
    expect(seen).toEqual(['chalk', 'charcoal', 'watercolour', 'stamp', 'plain', 'chalk']);
    stepTip(-1);
    expect(currentTip()).toBeUndefined();
    stepTip(-1);
    expect(currentTip()?.kind).toBe('stamp');
  });
});

describe('saved brushes remember the tip', () => {
  it('has Chalk, Charcoal, Watercolour and Leaves as starters, each with its tip, picked in one click', () => {
    const names = STARTERS.map((s) => s.name);
    for (const [name, kind] of [['Chalk', 'chalk'], ['Charcoal', 'charcoal'], ['Watercolour', 'watercolour'], ['Leaves', 'stamp']] as const) {
      const s = STARTERS[names.indexOf(name)];
      expect(s.brush.tip?.kind).toBe(kind);
      P.applyPreset(s.id);
      expect(store().get().ui.brush.tip?.kind).toBe(kind);
      expect(P.currentBrushState()).toEqual({ activeId: s.id, changed: false });
    }
    P.applyPreset(STARTERS[0].id);
    expect(currentTip()).toBeUndefined();
  });
  it('a changed tip setting marks the picked brush as changed, and Revert brings it back', () => {
    P.applyPreset(STARTERS[4].id);
    patchTip({ amount: 0.1 });
    expect(P.currentBrushState().changed).toBe(true);
    P.revertActive();
    expect(P.currentBrushState().changed).toBe(false);
    expect(currentTip()?.amount).toBe(STARTERS[4].brush.tip?.amount);
  });
  it('saving keeps the tip, and picking another brush and back brings it with its settings', () => {
    setTipKind('stamp');
    setStampShape('heart');
    patchTip({ spacing: 2.5, jitter: 0.7 });
    const saved = P.saveCurrentAs('Hearts')!;
    expect(saved.brush.tip).toMatchObject({ shape: 'heart', spacing: 2.5, jitter: 0.7 });
    P.applyPreset(STARTERS[0].id);
    expect(currentTip()).toBeUndefined();
    P.applyPreset(saved.id);
    expect(currentTip()).toMatchObject({ kind: 'stamp', shape: 'heart', spacing: 2.5, jitter: 0.7 });
  });
  it('a brush that matches a tipped starter is found by its tip, not just its sliders', () => {
    expect(sameBrush(STARTERS[4].brush, { ...STARTERS[4].brush, tip: undefined })).toBe(false);
    expect(sameBrush(STARTERS[4].brush, { ...STARTERS[4].brush, tip: { kind: 'chalk' } })).toBe(true);
  });
  it('goes through sharing as text, custom stamp and all, and an old file without tips still reads', () => {
    store().setUi({ brush: { ...DEFAULT_BRUSH, tip: { kind: 'stamp', shape: 'custom', custom: [[-0.5, -0.5, 0.5, -0.5, 0, 0.5]], angle: 'upright' } } });
    const mine = P.saveCurrentAs('My stamp')!;
    const text = brushesToText([mine]);
    const back = parseBrushesText(text);
    expect(back.ok && back.presets[0].brush.tip).toMatchObject({ kind: 'stamp', shape: 'custom', custom: [[-0.5, -0.5, 0.5, -0.5, 0, 0.5]] });
    const old = JSON.stringify({ format: 'frameling-brushes', version: 1, presets: [{ name: 'Old', tool: 'brush', brush: { size: 6 } }] });
    const r = parseBrushesText(old);
    expect(r.ok && r.presets[0].brush.tip).toBeUndefined();
    const bad = JSON.stringify({ format: 'frameling-brushes', version: 1, presets: [{ name: 'Odd', tool: 'brush', brush: { size: 6, tip: { kind: 'neon' } } }] });
    const r2 = parseBrushesText(bad);
    expect(r2.ok && r2.presets[0].brush.tip).toBeUndefined();
  });
});

describe('the commands', () => {
  const ids = ['brush.tip.plain', 'brush.tip.chalk', 'brush.tip.charcoal', 'brush.tip.watercolour', 'brush.tip.stamp', 'brush.tipNext', 'brush.tipPrevious', 'brush.fromSelection', 'brush.pixelReset'];
  it('are all in the palette, with a label, a description and the help topic', () => {
    for (const id of ids) {
      const c = getCommand(id);
      expect(c, id).toBeTruthy();
      expect(c!.label.length).toBeGreaterThan(5);
      expect(c!.description?.length).toBeGreaterThan(10);
      expect(c!.help).toBe('brush-tips');
      expect(`${c!.label}${c!.description}`).not.toContain('—');
    }
    expect(allCommands().filter((c) => c.id.startsWith('brush.tip.')).length).toBe(5);
  });
  it('have keys for stepping and for making a brush, and none that two commands share', () => {
    expect(getCommand('brush.tipNext')!.keys).toEqual(['Alt+Shift+ArrowDown']);
    expect(getCommand('brush.tipPrevious')!.keys).toEqual(['Alt+Shift+ArrowUp']);
    expect(getCommand('brush.fromSelection')!.keys).toEqual(['Mod+Alt+B']);
  });
  it('a tip command picks the Brush tool and the tip', () => {
    store().setUi({ tool: 'select' });
    getCommand('brush.tip.charcoal')!.run();
    expect(store().get().ui.tool).toBe('brush');
    expect(currentTip()?.kind).toBe('charcoal');
    getCommand('brush.tip.plain')!.run();
    expect(currentTip()).toBeUndefined();
  });
  it('Back to the usual pixel brush only offers itself when there is one to go back from', () => {
    expect(getCommand('brush.pixelReset')!.enabled?.(store().get())).toBe(false);
  });
});

describe('a stamp from the selection on a drawing layer', () => {
  it('asks for a selection first', () => {
    makeBrushFromSelection();
    expect(toasts.get().at(-1)?.kind).toBe('warn');
    expect(currentTip()).toBeUndefined();
  });
  it('makes a custom stamp of the selected shapes, sized like them, and Undo goes back', () => {
    addShapes(box('a', 10, 10, 60, 30), box('b', 200, 200, 10, 10));
    store().setUi({ selection: ['a'], brush: { ...DEFAULT_BRUSH, size: 9, thinning: 0.6 } });
    expect(makeBrushFromSelection()).toBe(true);
    const b = store().get().ui.brush;
    expect(b.tip).toMatchObject({ kind: 'stamp', shape: 'custom', angle: 'upright' });
    expect(b.tip?.custom?.length).toBe(1);
    expect(b.size).toBe(60);
    expect(b.thinning).toBe(0);
    const t = toasts.get().at(-1)!;
    t.action!.run();
    expect(store().get().ui.brush.size).toBe(9);
    expect(currentTip()).toBeUndefined();
  });
  it('is brought back by picking Stamp again, and draws a line made of the stamp', () => {
    addShapes(box('a', 10, 10, 40, 40));
    store().setUi({ selection: ['a'] });
    makeBrushFromSelection();
    setTipKind(null);
    setTipKind('stamp');
    expect(currentTip()).toMatchObject({ shape: 'custom' });
    store().setUi({ selection: [], tool: 'brush' });
    drag(brushTool, ctx(), [[100, 100], [160, 100], [260, 100]]);
    const s = shapesNow().at(-1) as StrokeShape;
    expect(s.type).toBe('stroke');
    expect(s.brush.tip).toMatchObject({ kind: 'stamp', shape: 'custom' });
    expect(s.brush.tip?.seed).toBeGreaterThan(0);
  });
});

describe('a line drawn with a tip', () => {
  it('keeps the tip, and a plain brush leaves no tip on the line', () => {
    setTipKind('chalk');
    drag(brushTool, ctx(), [[10, 10], [60, 30], [120, 10]]);
    expect((shapesNow().at(-1) as StrokeShape).brush.tip).toEqual(currentTip());
    setTipKind(null);
    drag(brushTool, ctx(), [[10, 80], [60, 90], [120, 80]]);
    expect('tip' in (shapesNow().at(-1) as StrokeShape).brush).toBe(false);
  });
  it('two stamp lines get their own seeds', () => {
    setTipKind('stamp');
    drag(brushTool, ctx(), [[10, 10], [60, 30], [120, 10]]);
    drag(brushTool, ctx(), [[10, 10], [60, 30], [120, 10]]);
    const [a, b] = shapesNow().slice(-2) as StrokeShape[];
    expect(a.brush.tip?.seed).not.toBe(b.brush.tip?.seed);
  });
});

describe('a pixel brush from the selection', () => {
  const paint = (): PixelDrawing => {
    const d = Object.values(store().get().doc.drawings)[0] as PixelDrawing;
    return d;
  };
  const at = (x: number, y: number): number[] => {
    const d = paint();
    const px = gridPixels(d, 64, 64);
    const i = (y * 64 + x) * 4;
    return [px[i], px[i + 1], px[i + 2], px[i + 3]];
  };
  /** A red and blue 2 x 2 flower at the top left, drawn on the layer and selected. */
  function flower(): void {
    pixelStore(1);
    setToolSettings({ pixelBrushSize: 1, pixelPerfect: false });
    store().setUi({ color: '#ff0000', tool: 'brush' });
    drag(brushTool, ctx(), [[4, 4], [4, 4]]);
    drag(brushTool, ctx(), [[5, 4], [5, 4]]);
    forgetLastPixelEnd();
    store().setUi({ color: '#0000ff' });
    drag(brushTool, ctx(), [[4, 5], [4, 5]]);
    drag(brushTool, ctx(), [[5, 5], [5, 5]]);
    forgetLastPixelEnd();
    setPixelSelection(rectMask(64, 64, 3, 3, 6, 6));
  }
  it('asks for a selection first', () => {
    pixelStore(1);
    makeBrushFromSelection();
    expect(toasts.get().at(-1)?.kind).toBe('warn');
    expect(pixelBrushStamp()).toBeNull();
  });
  it('makes a picture brush in its own colours when the choice says so, and stamps copies side by side', () => {
    setChoice('brush.pixelStampColours', 'own');
    flower();
    expect(makeBrushFromSelection()).toBe(true);
    return Promise.resolve().then(() => {
      const st = pixelBrushStamp()!;
      expect([st.w, st.h, st.keep]).toEqual([2, 2, true]);
      setPixelSelection(null);
      store().setUi({ color: '#00ff00' });
      // A click stamps the picture with its own colours, in the middle of where you clicked.
      drag(brushTool, ctx(), [[20, 20], [20, 20]]);
      forgetLastPixelEnd();
      const painted = [[20, 20], [21, 20], [20, 21], [21, 21]].map(([x, y]) => at(x, y));
      expect(painted.map((p) => p.join(','))).toEqual(['255,0,0,255', '255,0,0,255', '0,0,255,255', '0,0,255,255']);
      // Dragging lays copies a whole picture apart, not a smear.
      drag(brushTool, ctx(), [[30, 40], [31, 40], [32, 40], [33, 40], [34, 40], [35, 40]]);
      forgetLastPixelEnd();
      // Copies at x 30, 32 and 34 (each two wide), red on top and blue below, with no smear between or past them.
      for (const x of [30, 31, 32, 33, 34, 35]) expect(at(x, 40)).toEqual([255, 0, 0, 255]);
      for (const x of [30, 31, 32, 33, 34, 35]) expect(at(x, 41)).toEqual([0, 0, 255, 255]);
      expect(at(36, 40)[3]).toBe(0);
      expect(at(29, 40)[3]).toBe(0);
    });
  });
  it('paints its shape in your colour when the choice says so, smearing along the drag', async () => {
    setChoice('brush.pixelStampColours', 'mine');
    flower();
    makeBrushFromSelection();
    await Promise.resolve();
    expect(pixelBrushStamp()?.keep).toBe(false);
    setPixelSelection(null);
    store().setUi({ color: '#00ff00' });
    drag(brushTool, ctx(), [[20, 20], [24, 20]]);
    forgetLastPixelEnd();
    for (const x of [20, 21, 22, 23, 24, 25]) expect(at(x, 20)).toEqual([0, 255, 0, 255]);
    expect(at(19, 20)[3]).toBe(0);
    expect(at(26, 20)[3]).toBe(0);
  });
  it('can switch between its own colours and your colour, and go back to the usual brush', async () => {
    setChoice('brush.pixelStampColours', 'own');
    flower();
    makeBrushFromSelection();
    await Promise.resolve();
    setPixelStampKeep(false);
    expect(pixelBrushStamp()?.keep).toBe(false);
    setPixelStampKeep(true);
    expect(pixelBrushStamp()?.keep).toBe(true);
    expect(getCommand('brush.pixelReset')!.enabled?.(store().get())).toBe(true);
    getCommand('brush.pixelReset')!.run();
    expect(pixelBrushStamp()).toBeNull();
    expect(getToolSettings().pixelStamp).toBeNull();
  });
  it('a saved setting that is not a brush is ignored, not drawn', () => {
    pixelStore(1);
    setToolSettings({ pixelBrushSize: 1, pixelPerfect: false, pixelStamp: { w: 99, h: 1, colours: [], cells: [] } as never });
    expect(pixelBrushStamp()).toBeNull();
    store().setUi({ color: '#ff0000', tool: 'brush' });
    drag(brushTool, ctx(), [[10, 10], [10, 10]]);
    forgetLastPixelEnd();
    expect(at(10, 10)).toEqual([255, 0, 0, 255]);
  });
  it('clearing it is safe when there is none', () => {
    clearPixelStamp();
    expect(pixelBrushStamp()).toBeNull();
  });
});
