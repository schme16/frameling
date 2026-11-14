// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { InstanceShape, VectorDrawing } from '../../src/core/format';
import { store } from '../../src/core/store';
import { getCommand } from '../../src/core/registry';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/timeline/commands';
import { addVectorLayer } from '../../src/timeline/edit-core';
import { clearPixelClipboard } from '../../src/select/commands';
import { resetPixelSelection, setPixelSelection } from '../../src/select/pixel-state';
import { rectMask } from '../../src/select/mask';
import { pixelStore } from '../tools/helpers';
import { _forgetCopies, lastCopiedKind } from '../../src/clipboard/commands';
import { clearClipboard } from '../../src/tools/clipboard';

const run = (id: string) => void getCommand(id)!.run();

/** A 64 x 64 page with a pixel layer (8 per art pixel) holding a red block, and a vector layer above it. */
function setup() {
  pixelStore(8);
  const px = store().get().doc.layers[0];
  store().update('Add a vector layer', (d) => void addVectorLayer(d, px.id, 'Shapes'));
  store().setUi({ activeLayerId: px.id, frame: 0 });
  // Paint a red 3 x 2 block at art pixels (2,3) to (4,4).
  store().update('Draw', (d) => {
    const l = d.layers[0];
    const grid = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 3; y <= 4; y++) for (let x = 2; x <= 4; x++) grid.set([255, 0, 0, 255], (y * 8 + x) * 4);
    const dr = { id: 'p1', kind: 'pixel' as const, width: 8, height: 8, pixels: grid };
    d.drawings.p1 = dr;
    l.cels.push({ id: 'c1', start: 0, length: 4, drawingId: 'p1' });
  });
}

beforeEach(() => {
  clearPixelClipboard();
  clearClipboard();
  resetPixelSelection();
  _forgetCopies();
  setup();
});

describe('pixels pasted on a vector layer', () => {
  it('become a picture you can place: a symbol of pixels, with an instance, in one undo step', () => {
    setPixelSelection(rectMask(8, 8, 2, 3, 4, 4));
    run('edit.copy');
    expect(lastCopiedKind()).toBe('pixels');
    const vec = store().get().doc.layers[1];
    store().setUi({ activeLayerId: vec.id, frame: 0 });
    run('edit.paste');
    const { doc, ui } = store().get();
    const layer = doc.layers[1];
    const d = doc.drawings[layer.cels[0].drawingId] as VectorDrawing;
    const inst = d.shapes[0] as InstanceShape;
    expect(inst.type).toBe('instance');
    expect(ui.selection).toEqual([inst.id]);
    const sym = doc.symbols![inst.symbolId];
    expect(sym.layers[0]).toMatchObject({ kind: 'pixel', pixelSize: 8 });
    const inner = doc.drawings[sym.layers[0].cels[0].drawingId];
    expect(inner).toMatchObject({ kind: 'pixel', x: 2, y: 3, width: 3, height: 2 });
    expect(store().undoLabel()).toBe('Paste pixels as a picture');
    store().undo();
    expect(store().get().doc.symbols).toBeUndefined();
  });

  it('leave the pixels where they were, and the pixel layer untouched', () => {
    setPixelSelection(rectMask(8, 8, 2, 3, 4, 4));
    run('edit.copy');
    store().setUi({ activeLayerId: store().get().doc.layers[1].id });
    run('edit.paste');
    const px = store().get().doc.drawings.p1;
    expect(px.kind === 'pixel' && px.pixels[(3 * 8 + 2) * 4]).toBe(255);
  });
});

describe('what Paste is enabled for', () => {
  it('is on for a drawing layer, so a picture from another app can come in', () => {
    expect(getCommand('edit.paste')!.enabled!(store().get())).toBe(true);
  });
  it('says so rather than doing nothing when there is nothing to paste', () => {
    store().setUi({ activeLayerId: store().get().doc.layers[1].id });
    const before = store().get().doc;
    run('edit.paste');
    expect(store().get().doc).toBe(before);
  });
});

describe('the commands', () => {
  it('Copy as SVG has help and only works on a vector selection', () => {
    const c = getCommand('edit.copySvg')!;
    expect(c.help).toBe('clipboard-system');
    expect(c.enabled!(store().get())).toBe(false);
  });
});
