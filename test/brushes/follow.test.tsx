// @vitest-environment jsdom
// One brush that follows the layer (piece 6): the brush you pick stays picked when you move between a pixel layer and a
// vector layer, and its half for the kind of layer you are on goes in. A half that was made is kept exactly; the other is
// worked out. A brush you changed stays changed when you hop away and back.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import '../../src/dab';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { LISTED_STARTERS, pixelHalf, vectorHalf, sameBrush } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { currentSpec } from '../../src/dab/live';
import { getDab, resetDab, setDab } from '../../src/dab/settings';
import { getDry, resetDry } from '../../src/dry/settings';
import { resetSoft } from '../../src/soft/settings';
import { sameSpec } from '../../src/dab/spec';
import { toasts } from '../../src/ui/toast';

const brushOf = (id: string) => LISTED_STARTERS.find((p) => p.id === id)!;
let stop: () => void = () => {};
let vectorId = '';
let pixelId = '';

/** A document with a vector layer and a pixel layer, on the vector one. */
function twoLayers() {
  const d = newDoc();
  vectorId = d.layers[0].id;
  const px = newPixelLayer('Pixels', 8);
  pixelId = px.id;
  d.layers.push(px);
  resetStore(d);
  store().setUi({ activeLayerId: vectorId, tool: 'brush' });
}
const go = (kind: 'vector' | 'pixel') => store().setUi({ activeLayerId: kind === 'pixel' ? pixelId : vectorId });

beforeEach(() => {
  stop();
  localStorage.clear();
  _resetChoicesForTests();
  resetDab();
  resetDry();
  resetSoft();
  toasts.set(() => []);
  twoLayers();
  P.pickNone();
  stop = P.startBrushPresets();
});
afterEach(() => stop());

describe('picking a brush on one kind of layer', () => {
  it('puts a vector brush into the pixel brush on a pixel layer, as its pixel half', () => {
    go('pixel');
    expect(P.applyPreset('starter:ink')).toBe(true);
    expect(currentSpec()).toEqual(pixelHalf(brushOf('starter:ink')));
    expect(P.currentSide()).toBe('pixel');
  });
  it('puts a pixel brush into the vector Brush on a vector layer, and does not move you to a tool the layer cannot take', () => {
    expect(P.applyPreset('starter:px-round3')).toBe(true);
    expect(store().get().ui.brush).toEqual(vectorHalf(brushOf('starter:px-round3')));
    expect(store().get().ui.tool).toBe('brush');
  });
  it('uses a made half exactly: a pair gives its own vector half and its own pixel half', () => {
    const leaves = brushOf('starter:leaves');
    expect(leaves.pair).toBeTruthy();
    expect(P.applyPreset('starter:leaves')).toBe(true);
    expect(store().get().ui.brush).toEqual(leaves.brush);
    go('pixel');
    expect(sameSpec(currentSpec()!, pixelHalf(leaves))).toBe(true);
    expect(pixelHalf(leaves)).toBe(leaves.pair);
  });
  it('still finds an old pixel starter id of a pair, which is the vector brush now', () => {
    expect(P.applyPreset('starter:px-leaves')).toBe(true);
    expect(P.pickedBrushId()).toBe('starter:leaves');
  });
});

describe('the layer decides', () => {
  it('moves the picked brush to the new kind of layer, with the same brush picked', () => {
    P.applyPreset('starter:ink');
    go('pixel');
    expect(P.pickedBrushId()).toBe('starter:ink');
    expect(currentSpec()).toEqual(pixelHalf(brushOf('starter:ink')));
    go('vector');
    expect(store().get().ui.brush).toEqual(brushOf('starter:ink').brush);
  });
  it('hands a pixel brush to a vector layer as its translation, and back untouched', () => {
    go('pixel');
    P.applyPreset('starter:px-round3');
    const was = currentSpec();
    go('vector');
    expect(store().get().ui.brush).toEqual(vectorHalf(brushOf('starter:px-round3')));
    go('pixel');
    expect(currentSpec()).toEqual(was);
    // The brush itself never changed for any of it.
    expect(brushOf('starter:px-round3').pixel).toEqual(was);
  });
  it('leaves things alone when nothing is picked', () => {
    const brush = store().get().ui.brush;
    go('pixel');
    go('vector');
    expect(store().get().ui.brush).toBe(brush);
    expect(getDab()).toEqual(resetDabValue());
  });
  it('keeps a brush you changed changed when you hop to the other kind and back', () => {
    P.applyPreset('starter:ink');
    store().setUi((u) => ({ brush: { ...u.brush, size: 31 } }));
    expect(P.stateFor('vector')).toEqual({ activeId: 'starter:ink', changed: true });
    go('pixel');
    expect(P.stateFor('pixel')).toEqual({ activeId: 'starter:ink', changed: false });
    setDab({ size: 9 });
    expect(P.stateFor('pixel').changed).toBe(true);
    go('vector');
    expect(store().get().ui.brush.size).toBe(31);
    expect(P.stateFor('vector').changed).toBe(true);
    go('pixel');
    expect(getDab().size).toBe(9);
    expect(P.stateFor('pixel').changed).toBe(true);
  });
  it('puts the new brush in when you picked another while you were away', () => {
    P.applyPreset('starter:ink');
    go('pixel');
    P.applyPreset('starter:marker');
    go('vector');
    expect(P.pickedBrushId()).toBe('starter:marker');
    expect(sameBrush(store().get().ui.brush, brushOf('starter:marker').brush)).toBe(true);
  });
  it('goes back to how it came: the half for the layer you are on, per kind', () => {
    P.applyPreset('starter:ink');
    go('pixel');
    setDab({ size: 40 });
    expect(P.revertActive()).toBe(true);
    expect(currentSpec()).toEqual(pixelHalf(brushOf('starter:ink')));
    go('vector');
    store().setUi((u) => ({ brush: { ...u.brush, size: 44 } }));
    expect(P.revertActive()).toBe(true);
    expect(store().get().ui.brush).toEqual(brushOf('starter:ink').brush);
  });
  it('swaps a charcoal brush to the Chalk and charcoal tool on a pixel layer and puts the Brush back on a vector layer', () => {
    P.applyPreset('starter:charcoal');
    go('pixel');
    expect(store().get().ui.tool).toBe('charcoal');
    expect(getDry().medium).toBe('compressed-charcoal');
    go('vector');
    expect(store().get().ui.tool).toBe('brush');
  });
  it('does not take over a tool you chose yourself', () => {
    P.applyPreset('starter:charcoal');
    go('pixel');
    store().setUi({ tool: 'select' });
    go('vector');
    expect(store().get().ui.tool).toBe('select');
  });
  it('leaves the tool a pick on a pixel layer chose, when you hop away', () => {
    go('pixel');
    store().setUi({ tool: 'select' });
    P.applyPreset('starter:charcoal');
    expect(store().get().ui.tool).toBe('charcoal');
    go('vector');
    expect(store().get().ui.tool).toBe('charcoal');
  });
  it('changes no tool for a tool that is not a brush', () => {
    store().setUi({ tool: 'select' });
    P.applyPreset('starter:charcoal');
    go('pixel');
    expect(store().get().ui.tool).toBe('select');
    expect(getDry().medium).toBe('compressed-charcoal');
  });
});

describe('a swap that would change the look a lot asks once', () => {
  it('draws a vector Gouache on a pixel layer as close as pixels can, when that is the answer', () => {
    setChoice(P.SWAP_PIXELS, 'close');
    P.applyPreset('starter:gouache');
    go('pixel');
    expect(currentSpec()).toEqual(pixelHalf(brushOf('starter:gouache')));
    expect(P.pickedBrushId()).toBe('starter:gouache');
  });
  it('keeps the layer\'s own brush and lets go of the pick when the answer is to pick another', () => {
    setChoice(P.SWAP_PIXELS, 'pick');
    go('pixel');
    P.applyPreset('starter:px-round6');
    go('vector');
    P.applyPreset('starter:gouache');
    const before = structuredClone(getDab());
    go('pixel');
    expect(P.pickedBrushId()).toBeNull();
    expect(getDab()).toEqual(before);
  });
  it('asks nothing for a small difference (a matte finish, a vector brush with no extras)', () => {
    P.applyPreset('starter:ink');
    go('pixel');
    expect(P.pickedBrushId()).toBe('starter:ink');
  });
  it('asks the other way too, for a pixel brush with wet paint on a vector layer', () => {
    setChoice(P.SWAP_VECTORS, 'pick');
    go('pixel');
    P.applyPreset('starter:px-wet-smear');
    const before = store().get().ui.brush;
    go('vector');
    expect(P.pickedBrushId()).toBeNull();
    expect(store().get().ui.brush).toBe(before);
  });
});

describe('what a kind of layer cannot draw of the picked brush', () => {
  it('says so for a worked out half, and nothing for a made one', () => {
    P.applyPreset('starter:px-wet-smear');
    expect(P.keptFor(P.pickedBrush(), 'vector').map((k) => k.id)).toEqual(['wet-paint', 'hardness']);
    expect(P.keptFor(P.pickedBrush(), 'pixel')).toEqual([]);
    P.applyPreset('starter:watercolour');
    expect(P.keptFor(P.pickedBrush(), 'pixel').map((k) => k.id)).toEqual(['wash-edge']);
    P.applyPreset('starter:leaves');
    expect(P.keptFor(P.pickedBrush(), 'vector')).toEqual([]);
    expect(P.keptFor(P.pickedBrush(), 'pixel')).toEqual([]);
  });
});

describe('saving and updating on either kind of layer', () => {
  it('saves what you have on a pixel layer as a pixel brush, which the vector layer draws through its translation', () => {
    go('pixel');
    setDab({ size: 17, spacing: 1.5 });
    const saved = P.saveCurrentAs('Fat dots')!;
    expect(saved.tool).toBe('pixel');
    go('vector');
    expect(sameBrush(store().get().ui.brush, vectorHalf(saved))).toBe(true);
    expect(saved.pair).toBeUndefined();
  });
  it('makes the half you change on the other kind of layer a half of its own when you update', () => {
    go('pixel');
    setDab({ size: 17 });
    const saved = P.saveCurrentAs('Mine')!;
    go('vector');
    store().setUi((u) => ({ brush: { ...u.brush, size: 33 } }));
    expect(P.updateActive()).toBe(true);
    const now = P.myBrushes().find((p) => p.id === saved.id)!;
    expect(now.tool).toBe('pixel');
    expect(now.pair).toMatchObject({ size: 33 });
    // The pixel half it was made with is still exactly that.
    expect(now.pixel).toEqual(saved.pixel);
    go('pixel');
    expect(currentSpec()).toEqual(saved.pixel);
  });
});

function resetDabValue() {
  resetDab();
  return getDab();
}

describe('every brush is exactly itself straight after you pick it, on either kind of layer', () => {
  it('lights as not changed, on a vector layer and on a pixel layer', () => {
    const bad: string[] = [];
    for (const b of LISTED_STARTERS) {
      go('vector');
      P.pickNone();
      P.applyPreset(b.id);
      if (P.stateFor('vector').changed) bad.push(`${b.id} on vectors`);
      go('pixel');
      P.pickNone();
      store().setUi({ tool: 'brush' });
      P.applyPreset(b.id);
      if (P.stateFor('pixel').changed) bad.push(`${b.id} on pixels`);
      store().setUi({ tool: 'brush' });
    }
    expect(bad).toEqual([]);
  });
});
