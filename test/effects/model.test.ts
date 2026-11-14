import { describe, expect, it } from 'vitest';
import type { Doc, Layer, LayerEffect } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { activeEffects, BLEND_MODES, compositeOp, isNoop, needsCompositor, valueAt, valuesAt, withKey, EFFECTS, lookSummary } from '../../src/effects/model';
import { buildPlan, planLayers } from '../../src/effects/plan';
import { filterFor, outlineOffsets } from '../../src/effects/apply';
import * as edit from '../../src/effects/edit';
import { readFolders, readLayerLook } from '../../src/effects/io';
import { loadFile, saveFile } from '../../src/io/file';

function docWith(names: string[]): Doc {
  const doc = newDoc({ width: 8, height: 8 });
  doc.layers = names.map((n) => Object.assign(newVectorLayer(n), { id: n }));
  return doc;
}
const ids = (ls: Layer[]) => ls.map((l) => l.id);

describe('blend modes and the effect catalogue', () => {
  it('have plain names with the industry term, and map to canvas operations', () => {
    for (const b of BLEND_MODES) {
      expect(b.label.length).toBeGreaterThan(2);
      expect(b.description).not.toMatch(/—/);
    }
    expect(compositeOp(undefined)).toBe('source-over');
    expect(compositeOp('add')).toBe('lighter');
    expect(compositeOp('multiply')).toBe('multiply');
    expect(EFFECTS.map((e) => e.kind)).toEqual(['blur', 'glow', 'shadow', 'adjust', 'outline', 'pixelate', 'grain', 'wave', 'fringe', 'vignette', 'motionblur']);
  });

  it('skips effects that would change nothing', () => {
    expect(isNoop('blur', { radius: 0 })).toBe(true);
    expect(isNoop('adjust', { hue: 0, saturation: 100, brightness: 100, contrast: 100 })).toBe(true);
    expect(isNoop('pixelate', { size: 1 })).toBe(true);
    const list: LayerEffect[] = [
      { id: 'a', kind: 'blur', values: { radius: 0 } },
      { id: 'b', kind: 'glow', values: { color: '#fff', size: 4, strength: 1 }, on: false },
      { id: 'c', kind: 'outline', values: { color: '#000', width: 2 } },
    ];
    expect(activeEffects(list, 0).map((e) => e.kind)).toEqual(['outline']);
  });

  it('builds filter strings in canvas pixels', () => {
    expect(filterFor('blur', { radius: 4 }, 2)).toBe('blur(8px)');
    expect(filterFor('adjust', { hue: 90, saturation: 50, brightness: 120, contrast: 100 }, 1)).toBe('hue-rotate(90deg) saturate(50%) brightness(120%) contrast(100%)');
    expect(filterFor('shadow', { color: '#ff0000', opacity: 0.5, x: 2, y: 3, softness: 1 }, 2)).toBe('drop-shadow(4px 6px 2px rgba(255,0,0,0.5))');
    expect(filterFor('glow', {}, 1)).toBeNull();
  });

  it('stamps outlines in rings close enough to leave no gaps', () => {
    expect(outlineOffsets(0)).toEqual([]);
    const offs = outlineOffsets(10);
    // Neighbours on the outer ring are under 2 canvas pixels apart.
    const outer = offs.filter(([x, y]) => Math.abs(Math.hypot(x, y) - 10) < 1e-6);
    const step = Math.hypot(outer[1][0] - outer[0][0], outer[1][1] - outer[0][1]);
    expect(step).toBeLessThan(2);
    expect(offs.some(([x, y]) => Math.hypot(x, y) < 5)).toBe(true);
  });
});

describe('animated effect values', () => {
  const e: LayerEffect = {
    id: 'g',
    kind: 'glow',
    values: { color: '#ff0000', size: 10, strength: 1 },
    keys: [
      { frame: 0, values: { size: 0 } },
      { frame: 10, values: { size: 20, strength: 2 } },
    ],
  };
  it('change evenly between keys and hold outside them', () => {
    expect(valueAt(e.keys!, 'size', 5)).toBe(10);
    expect(valueAt(e.keys!, 'size', 20)).toBe(20);
    expect(valueAt(e.keys!, 'strength', 0)).toBe(2);
    expect(valuesAt(e, 5)).toEqual({ color: '#ff0000', size: 10, strength: 2 });
    expect(valuesAt(e, -3).size).toBe(0);
  });
  it('withKey adds keys in order and merges into an existing one', () => {
    const k = withKey(e.keys, 5, { size: 3 });
    expect(k.map((x) => x.frame)).toEqual([0, 5, 10]);
    expect(withKey(k, 5, { strength: 1 })[1].values).toEqual({ size: 3, strength: 1 });
    expect(e.keys!.length).toBe(2);
  });
});

describe('the compositing plan', () => {
  it('leaves documents without looks on the old fast path', () => {
    const doc = docWith(['a', 'b']);
    expect(needsCompositor(doc)).toBe(false);
    doc.layers[1].blend = 'multiply';
    expect(needsCompositor(doc)).toBe(true);
  });

  it('puts clipped layers on the nearest layer under them, and hides them with it', () => {
    const doc = docWith(['base', 'c1', 'c2', 'top']);
    doc.layers[1].clipToBelow = doc.layers[2].clipToBelow = true;
    const plan = buildPlan(doc, (l) => l.visible);
    expect(plan.length).toBe(2);
    expect(plan[0].type === 'draw' && ids(plan[0].clips)).toEqual(['c1', 'c2']);
    doc.layers[0].visible = false;
    const hidden = buildPlan(doc, (l) => l.visible);
    expect(ids(planLayers(hidden))).toEqual(['top']);
    // Picked out for another reason (the eyedropper), a clipped layer still shows on its own.
    doc.layers[0].visible = true;
    const only = buildPlan(doc, (l) => l.visible, false, (l) => l.id === 'c1');
    expect(ids(planLayers(only))).toEqual(['c1']);
  });

  it('keeps masks and their layers inside folders', () => {
    const doc = docWith(['bg', 'a', 'b', 'm', 'top']);
    const f = edit.makeFolder(doc, ['a', 'b', 'm'])!;
    doc.layers.find((l) => l.id === 'm')!.mask = 'show';
    const plan = buildPlan(doc, (l) => l.visible);
    expect(plan.map((s) => (s.type === 'draw' ? s.node.type : s.type))).toEqual(['layer', 'folder', 'layer']);
    const folder = plan[1].type === 'draw' && plan[1].node.type === 'folder' ? plan[1].node : null;
    expect(folder?.isolate).toBe(true);
    expect(folder?.steps.map((s) => s.type)).toEqual(['draw', 'draw', 'mask']);
    doc.folders![f].visible = false;
    expect(ids(planLayers(buildPlan(doc, (l) => l.visible)))).toEqual(['bg', 'top']);
  });

  it('lets plain folders pass straight through', () => {
    const doc = docWith(['a', 'b']);
    edit.makeFolder(doc, ['a', 'b']);
    const plan = buildPlan(doc, () => true);
    expect(plan[0].type === 'draw' && plan[0].node.type === 'folder' && plan[0].node.isolate).toBe(false);
  });
});

describe('look edits', () => {
  it('add, change, animate, reorder and reset effects', () => {
    const doc = docWith(['a']);
    const t = { layer: 'a' };
    const blur = edit.addEffect(doc, t, 'blur')!;
    const glow = edit.addEffect(doc, t, 'glow')!;
    expect(edit.setEffectValue(doc, t, blur, 'radius', 999, 0)).toBe(true);
    expect(doc.layers[0].effects![0].values.radius).toBe(60);
    expect(edit.setEffectAnimated(doc, t, glow, true, 2)).toBe(true);
    edit.setEffectValue(doc, t, glow, 'size', 30, 8);
    expect(doc.layers[0].effects![1].keys!.map((k) => k.frame)).toEqual([2, 8]);
    expect(valuesAt(doc.layers[0].effects![1], 5).size).toBe(21);
    edit.setEffectAnimated(doc, t, glow, false, 8);
    expect(doc.layers[0].effects![1].keys).toBeUndefined();
    expect(doc.layers[0].effects![1].values.size).toBe(30);
    expect(edit.moveEffect(doc, t, glow, -1)).toBe(true);
    expect(doc.layers[0].effects!.map((e) => e.kind)).toEqual(['glow', 'blur']);
    expect(lookSummary(doc.layers[0])).toBe('2 effects');
    expect(edit.setBlend(doc, t, 'screen')).toBe(true);
    expect(edit.resetLook(doc, t)).toBe(true);
    expect(doc.layers[0].effects).toBeUndefined();
    expect(doc.layers[0].blend).toBeUndefined();
  });

  it('a mask on its own gets a folder holding just the layer under it, or everything under it', () => {
    const doc = docWith(['a', 'b', 'c', 'm']);
    expect(edit.useAsMask(doc, 'm', 'below')!.folder).toBeTruthy();
    expect(doc.layers.map((l) => [l.id, !!l.folder])).toEqual([['a', false], ['b', false], ['c', true], ['m', true]]);
    const doc2 = docWith(['a', 'b', 'm', 'top']);
    edit.useAsMask(doc2, 'm', 'all');
    expect(doc2.layers.filter((l) => l.folder).map((l) => l.id)).toEqual(['a', 'b', 'm']);
    expect(doc2.layers.find((l) => l.id === 'm')!.mask).toBe('show');
  });

  it('folders gather their layers, take drags in and out, and vanish when empty', () => {
    const doc = docWith(['a', 'b', 'c', 'd']);
    const f = edit.makeFolder(doc, ['a', 'c'])!;
    expect(ids(doc.layers)).toEqual(['b', 'a', 'c', 'd']);
    expect(edit.moveLayerInto(doc, 'd', 1, f)).toBe(true);
    expect(doc.layers.filter((l) => l.folder === f).map((l) => l.id)).toEqual(['d', 'a', 'c']);
    edit.moveLayerInto(doc, 'a', 0, null);
    edit.moveLayerInto(doc, 'c', 0, null);
    edit.moveLayerInto(doc, 'd', 0, null);
    expect(doc.folders).toBeUndefined();
  });
});

describe('files', () => {
  it('keep blend modes, effects, clipping, masks and folders, and drop what is broken', () => {
    const doc = docWith(['a', 'b', 'c']);
    doc.layers[0].blend = 'overlay';
    doc.layers[1].clipToBelow = true;
    edit.addEffect(doc, { layer: 'a' }, 'shadow');
    edit.setEffectAnimated(doc, { layer: 'a' }, doc.layers[0].effects![0].id, true, 3);
    const f = edit.makeFolder(doc, ['b', 'c'])!;
    doc.folders![f].opacity = 0.5;
    doc.folders![f].blend = 'screen';
    doc.layers[2].mask = 'hide';
    const back = loadFile(saveFile(doc)).doc;
    expect(back.layers.map((l) => [l.blend, !!l.clipToBelow, l.mask, !!l.folder])).toEqual([
      ['overlay', false, undefined, false],
      [undefined, true, undefined, true],
      [undefined, false, 'hide', true],
    ]);
    expect(back.layers[0].effects![0].keys![0].frame).toBe(3);
    expect(back.folders![f]).toMatchObject({ opacity: 0.5, blend: 'screen', visible: true });
  });

  it('keep the five finishing effects, with their settings and keys, through a save and load', () => {
    const doc = docWith(['a']);
    for (const k of ['grain', 'wave', 'fringe', 'vignette', 'motionblur'] as const) edit.addEffect(doc, { layer: 'a' }, k);
    doc.layers[0].effects![0].values.amount = 40;
    edit.setEffectAnimated(doc, { layer: 'a' }, doc.layers[0].effects![3].id, true, 2);
    const back = loadFile(saveFile(doc)).doc;
    expect(back.layers[0].effects!.map((e) => e.kind)).toEqual(['grain', 'wave', 'fringe', 'vignette', 'motionblur']);
    expect(back.layers[0].effects![0].values).toMatchObject({ amount: 40, size: 1.5, change: 1, seed: 0 });
    expect(back.layers[0].effects![3].keys![0].frame).toBe(2);
  });

  it('give an older file the defaults for settings it never had, and ignore settings that are not there', () => {
    // A grain written with only a strength (as if made by an earlier build) opens with the rest at their defaults.
    const look = readLayerLook({ effects: [{ id: 'g', kind: 'grain', values: { amount: 30, nonsense: 5 } }, { id: 'v', kind: 'vignette', values: { color: 'red' } }] });
    expect(look.effects![0].values).toEqual({ amount: 30, size: 1.5, colour: 0, change: 1, seed: 0 });
    expect(look.effects![1].values).toEqual({ amount: 45, size: 65, softness: 60, color: '#000000' });
  });

  it('read junk safely', () => {
    expect(readLayerLook({ blend: 'sparkly', effects: [{ kind: 'nope' }, { kind: 'blur', values: { radius: 'x' } }], mask: 'yes' })).toEqual({
      effects: [{ id: 'fx0', kind: 'blur', values: { radius: 4 } }],
    });
    const layers = [Object.assign(newVectorLayer('x'), { folder: 'gone' })];
    expect(readFolders({ other: { name: 'Unused' } }, layers)).toEqual({});
    expect(layers[0].folder).toBeUndefined();
  });
});

describe('timeline rows', () => {
  it('put a header over each folder, indent its layers and fold them away', async () => {
    const { timelineRows, rowOfLayer } = await import('../../src/effects/rows');
    const doc = docWith(['a', 'b', 'c', 'd']);
    const f = edit.makeFolder(doc, ['b', 'c'])!;
    const open = timelineRows(doc, new Set());
    expect(open.map((r) => (r.type === 'folder' ? 'F' : r.layer.id + (r.inFolder ? '>' : '')))).toEqual(['d', 'F', 'c>', 'b>', 'a']);
    const shut = timelineRows(doc, new Set([f]));
    expect(shut.map((r) => (r.type === 'folder' ? 'F' : r.layer.id))).toEqual(['d', 'F', 'a']);
    expect(rowOfLayer(shut, 'b')).toBe(1);
    expect(rowOfLayer(shut, 'a')).toBe(2);
  });
});

describe('moving layers keeps folders in one piece', () => {
  it('Move up and Move down step into and out of folders', async () => {
    const { stepLayer, reorderLayer } = await import('../../src/timeline/edit-core');
    const doc = docWith(['a', 'b', 'c', 'd']);
    const f = edit.makeFolder(doc, ['b', 'c'])!;
    // c is at the top edge of the folder: up takes it out, in place.
    expect(stepLayer(doc, 'c', 'up')).toBe(true);
    expect(doc.layers.map((l) => [l.id, l.folder ?? ''])).toEqual([['a', ''], ['b', f], ['c', ''], ['d', '']]);
    // Down again puts it back in.
    stepLayer(doc, 'c', 'down');
    expect(doc.layers.find((l) => l.id === 'c')!.folder).toBe(f);
    // a steps into the folder from below, then swaps inside it.
    stepLayer(doc, 'a', 'up');
    expect(doc.layers[0]).toMatchObject({ id: 'a', folder: f });
    stepLayer(doc, 'a', 'up');
    expect(doc.layers.map((l) => l.id)).toEqual(['b', 'a', 'c', 'd']);
    // Stepping the last ones out removes the folder.
    for (const id of ['c', 'a', 'b']) while (doc.layers.find((l) => l.id === id)!.folder) stepLayer(doc, id, 'up');
    expect(doc.folders).toBeUndefined();
    // A plain reorder that would split a folder never leaves a ghost copy.
    const doc2 = docWith(['a', 'b', 'c', 'd', 'e']);
    const g = edit.makeFolder(doc2, ['b', 'c', 'd'])!;
    reorderLayer(doc2, 'b', 4);
    expect(doc2.layers.filter((l) => l.folder === g).map((l) => l.id)).toEqual(['c', 'd']);
    reorderLayer(doc2, 'a', 1);
    expect(doc2.layers.filter((l) => l.folder === g).map((l) => l.id)).toEqual(['c', 'a', 'd']);
  });
});
