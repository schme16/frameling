// Draw anywhere: a stroke of the other kind goes to the other half of the layer's pair, made if it is missing, and the
// layer and the stroke are one Undo.
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import '../../src/ui/dockCommands';
import { resetChoices, setChoice } from '../../src/core/choices';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import type { Doc, Layer, PixelDrawing, VectorDrawing } from '../../src/core/format';
import { pairOf } from '../../src/core/pairs';
import { getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { editActiveDrawing } from '../../src/tools/edit';
import { beginStroke, forgetTold, planStroke, STROKE_TOOLS, wantedKind } from '../../src/ui/drawAnywhere';
import { drawIntentFor, drawKindNow, MAKE_LAYER_CHOICE, pressSide, setDrawIntent } from '../../src/ui/drawingMode';
import * as ops from '../../src/timeline/ops';
import { toasts } from '../../src/ui/toast';
import { addCel } from '../timeline/helpers';

const mark = (id = 'm') => ({ id, type: 'stroke', color: '#f00', opacity: 1, brush: { size: 4 }, points: [{ x: 1, y: 1, p: 1 }] }) as never;

function vectorDoc(): Doc {
  const doc = newDoc({ length: 24 });
  doc.layers[0].name = 'Ink';
  addCel(doc, doc.layers[0], 0, 6);
  return doc;
}
const doc = (): Doc => store().get().doc;

/** A pixel stroke the way the tools make one: into the active layer's drawing, as one step. */
const pixelStroke = () =>
  editActiveDrawing('Draw stroke', 'pixel', (d) => {
    (d as PixelDrawing).width = 1;
    (d as PixelDrawing).height = 1;
    (d as PixelDrawing).pixels = new Uint8ClampedArray([9, 9, 9, 255]);
  });
const vectorStroke = () => editActiveDrawing('Draw stroke', 'vector', (d) => void (d as VectorDrawing).shapes.push(mark()));

beforeEach(() => {
  resetChoices();
  forgetTold();
  toasts.set([]);
  setDrawIntent(null);
});

describe('which kind a stroke wants', () => {
  const brush = getTool('brush')!;
  it('stays put when the tool works on this layer and the switch agrees', () => {
    expect(wantedKind('brush', brush.layers, { kind: 'vector' }, null)).toBeNull();
    expect(wantedKind('brush', brush.layers, { kind: 'vector' }, 'vector')).toBeNull();
  });
  it('follows the switch for a tool that does both', () => {
    expect(wantedKind('brush', brush.layers, { kind: 'vector' }, 'pixel')).toBe('pixel');
    expect(wantedKind('brush', brush.layers, { kind: 'pixel' }, 'vector')).toBe('vector');
  });
  it('writes the one kind a one-kind tool can, whatever the switch says', () => {
    expect(wantedKind('shade', ['pixel'], { kind: 'vector' }, null)).toBe('pixel');
    expect(wantedKind('shade', ['pixel'], { kind: 'vector' }, 'vector')).toBe('pixel');
    expect(wantedKind('shade', ['pixel'], { kind: 'pixel' }, 'vector')).toBeNull();
  });
  it('never moves a tool that does not put down new marks, or a layer that is not vector or pixel', () => {
    expect(wantedKind('eraser', ['vector', 'pixel'], { kind: 'vector' }, 'pixel')).toBeNull();
    expect(wantedKind('select', ['vector'], { kind: 'pixel' }, 'vector')).toBeNull();
    expect(wantedKind('brush', brush.layers, { kind: 'tilemap' }, 'pixel')).toBeNull();
    expect(wantedKind('brush', brush.layers, undefined, 'pixel')).toBeNull();
  });
  it('names the tools that draw', () => {
    for (const id of STROKE_TOOLS) expect(getTool(id), id).toBeTruthy();
  });
});

describe('planning a stroke', () => {
  it('goes to the other half when there is one, makes it when there is not', () => {
    const d = vectorDoc();
    const v = d.layers[0];
    expect(planStroke(d.layers, v, 'brush', ['vector', 'pixel'], 'pixel')).toEqual({ do: 'make', from: v.id, kind: 'pixel' });
    const p = newPixelLayer('Ink (pixels)', 8);
    d.layers.push(p);
    v.pair = p.id;
    p.pair = v.id;
    expect(planStroke(d.layers, v, 'brush', ['vector', 'pixel'], 'pixel')).toEqual({ do: 'go', layerId: p.id });
    expect(planStroke(d.layers, v, 'brush', ['vector', 'pixel'], null)).toEqual({ do: 'stay' });
  });
});

describe('the switch says what you will write, without moving you', () => {
  it('pressing the other side changes nothing but the switch', () => {
    resetStore(vectorDoc());
    const before = doc();
    const active = store().get().ui.activeLayerId;
    pressSide('pixel');
    expect(doc()).toBe(before);
    expect(store().get().ui.activeLayerId).toBe(active);
    expect(drawKindNow()).toBe('pixel');
    expect(drawIntentFor(doc().layers[0].id)).toBe('pixel');
  });

  it('pressing back puts it back, and picking another layer drops it', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    pressSide('vector');
    expect(drawKindNow()).toBe('vector');
    pressSide('pixel');
    store().update('another layer', (d) => void d.layers.push(newPixelLayer('Other', 8) as never));
    store().setUi({ activeLayerId: doc().layers[1].id });
    expect(drawKindNow()).toBe('pixel');
    expect(drawIntentFor(doc().layers[0].id)).toBeNull();
    store().setUi({ activeLayerId: doc().layers[0].id });
    // Back on the layer it was pressed on, it is that layer's own kind again.
    expect(drawKindNow()).toBe('vector');
  });

  it('with the other half there, pressing a side goes to it', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    pixelStroke();
    const [v, p] = doc().layers;
    expect(store().get().ui.activeLayerId).toBe(p.id);
    pressSide('vector');
    expect(store().get().ui.activeLayerId).toBe(v.id);
    expect(drawKindNow()).toBe('vector');
  });
});

describe('swapping from the keyboard', () => {
  it('flips the switch to the other side and back, and the key is Ctrl+Alt+X', async () => {
    const { getCommand } = await import('../../src/core/registry');
    resetStore(vectorDoc());
    const swap = getCommand('layers.draw.swap')!;
    expect(swap.keys).toEqual(['Mod+Alt+X']);
    swap.run();
    expect(drawKindNow()).toBe('pixel');
    swap.run();
    expect(drawKindNow()).toBe('vector');
  });
});

describe('a stroke of the other kind', () => {
  it('makes the other half, goes to it, and lands the stroke there', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    expect(beginStroke(getTool('brush')!)).toEqual({});
    expect(doc().layers.map((l) => l.name)).toEqual(['Ink', 'Ink (pixels)']);
    expect(store().get().ui.activeLayerId).toBe(doc().layers[1].id);
    expect(pixelStroke()).toBe('ok');
    const [v, p] = doc().layers as [Layer, Layer];
    expect(pairOf(doc().layers, v)?.id).toBe(p.id);
    expect((doc().drawings[p.cels[0].drawingId] as PixelDrawing).width).toBe(1);
    expect(v.cels.map((c) => [c.start, c.length])).toEqual(p.cels.map((c) => [c.start, c.length]));
    expect(drawKindNow()).toBe('pixel');
  });

  it('is ONE undo step: undo leaves the document exactly as it was, layer and all, and redo brings both back', () => {
    resetStore(vectorDoc());
    const before = structuredClone(doc());
    const layer = store().get().ui.activeLayerId;
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    pixelStroke();
    expect(doc().layers).toHaveLength(2);
    const after = structuredClone(doc());
    store().undo();
    expect(doc()).toEqual(before);
    expect(doc().layers).toHaveLength(1);
    // You land back on the layer you were on, and Undo has nothing more to take.
    expect(store().get().ui.activeLayerId).toBe(layer);
    expect(store().canUndo()).toBe(false);
    store().redo();
    expect(doc()).toEqual(after);
    expect(store().get().ui.activeLayerId).toBe(doc().layers[1].id);
  });

  it('is named for the stroke, not for the layer', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    pixelStroke();
    expect(store().undoLabel()).toBe('Draw stroke');
  });

  it('a second stroke goes straight on, with no new layer and its own undo', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    pixelStroke();
    beginStroke(getTool('brush')!);
    pixelStroke();
    expect(doc().layers).toHaveLength(2);
    store().undo();
    expect(doc().layers).toHaveLength(2);
    store().undo();
    expect(doc().layers).toHaveLength(1);
  });

  it('on a vector layer with the pixel half there already, goes to it without making anything', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    pixelStroke();
    const n = doc().layers.length;
    store().setUi({ activeLayerId: doc().layers[0].id });
    pressSide('pixel');
    // Pressed on the half itself: it just goes there.
    expect(store().get().ui.activeLayerId).toBe(doc().layers[1].id);
    expect(doc().layers).toHaveLength(n);
  });

  it('a one-kind tool (shade) on a vector layer draws on a pixel half, with no press of the switch', () => {
    resetStore(vectorDoc());
    const shade = getTool('shade')!;
    expect(beginStroke(shade)).toEqual({});
    expect(doc().layers.map((l) => l.kind)).toEqual(['vector', 'pixel']);
  });

  it('works the other way: a pixel layer, the switch on Vectors, a vector half is made', () => {
    const d = newDoc({ length: 24 });
    d.layers[0] = newPixelLayer('Sprite', 8) as never;
    resetStore(d);
    addCelTo(d);
    pressSide('vector');
    beginStroke(getTool('brush')!);
    expect(doc().layers.map((l) => [l.name, l.kind])).toEqual([
      ['Sprite', 'pixel'],
      ['Sprite (vectors)', 'vector'],
    ]);
    expect(vectorStroke()).toBe('ok');
  });

  it('makes nothing for a press that draws nothing and is called off', () => {
    resetStore(vectorDoc());
    const before = structuredClone(doc());
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    expect(doc().layers).toHaveLength(2);
    expect(store().endJoin()).toBe(true);
    expect(doc()).toEqual(before);
    expect(store().canRedo()).toBe(false);
  });

  it('the tools that do not draw never make a layer', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    beginStroke(getTool('eraser')!);
    expect(doc().layers).toHaveLength(1);
  });
});

describe('not a surprise', () => {
  it('says so once, naming the layer it made', () => {
    resetStore(vectorDoc());
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    pixelStroke();
    const said = toasts.get().map((t) => t.message);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('"Ink (pixels)"');
    expect(said[0]).toContain('"Ink"');
    // The next time it makes one, it just does.
    toasts.set([]);
    ops.deleteLayer(doc().layers[1].id);
    store().setUi({ activeLayerId: doc().layers[0].id });
    pressSide('pixel');
    beginStroke(getTool('brush')!);
    expect(doc().layers).toHaveLength(2);
    expect(toasts.get()).toHaveLength(0);
  });

  it('does not make a layer for someone who said not to at the switch, and says how instead', () => {
    resetStore(vectorDoc());
    setChoice(MAKE_LAYER_CHOICE, 'tell');
    pressSide('pixel');
    const r = beginStroke(getTool('brush')!);
    expect(r.refused).toMatch(/Add one with New pixel layer/);
    expect(doc().layers).toHaveLength(1);
  });

  it('does not ask a second time: with "make" already answered it just makes it', () => {
    resetStore(vectorDoc());
    setChoice(MAKE_LAYER_CHOICE, 'make');
    pressSide('pixel');
    expect(beginStroke(getTool('brush')!)).toEqual({});
    expect(doc().layers).toHaveLength(2);
  });

  it('will not write blanks onto a locked layer', () => {
    resetStore(vectorDoc());
    store().update('lock', (d) => void (d.layers[0].locked = true));
    pressSide('pixel');
    expect(beginStroke(getTool('brush')!).refused).toMatch(/locked/);
    expect(doc().layers).toHaveLength(1);
  });
});

function addCelTo(d: Doc): void {
  const l = store().get().doc.layers[0];
  store().update('cel', (x) => void addCel(x, x.layers.find((y) => y.id === l.id)!, 0, 6));
  void d;
}
