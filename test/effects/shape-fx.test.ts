// Effects on one shape, not the whole layer: the format (old files open and write back unchanged), the edits, how merging
// treats a shape that has an effect, and what each exporter does with one. The drawing itself is in shape-fx-render.test.ts.
import { describe, expect, it } from 'vitest';
import type { Doc, FillShape, LayerEffect, PathShape, Shape, StrokeShape } from '../../src/core/format';
import { newDoc } from '../../src/core/doc';
import { loadFile, saveFile } from '../../src/io/file';
import { readEffects, withShapeEffects } from '../../src/effects/io';
import { defaultValues } from '../../src/effects/model';
import * as edit from '../../src/effects/edit';
import { cloneEffects, drawableShapeFx, hasShapeFx, layerHasShapeFx, layerShapeFxKinds, stackOf } from '../../src/effects/shapeFx';
import { drawingBox, effectReach } from '../../src/core/render';
import { shapesInk } from '../../src/canvas/inkBox';
import { eraseBits, eraseArea, mergeable, mergeShapes, polygonGeom } from '../../src/geometry/merge';
import { combineShapes, looksDiffer } from '../../src/geometry/boolean';
import { strokeToPath } from '../../src/geometry/strokeToPath';
import { breakApart } from '../../src/tools/merge-mode';
import { bakesEffects, carryWarnings, docFeatures } from '../../src/export/carries';
import { frameSvgExport } from '../../src/export/svg';
import { needsPicture } from '../../src/export/layered';
import { lottieExport } from '../../src/export/lottie';
import { BonesNotes, partLook } from '../../src/export/godot-bones-scope';
import { addVectorLayer, ellipsePath, fill, hold, rectPath, stroke, vectorDrawing } from '../../src/templates/build';

const fx = (kind: LayerEffect['kind'], values: Record<string, number | string> = {}, id = `e-${kind}`): LayerEffect => ({ id, kind, values: { ...defaultValues(kind), ...values } });
const withFx = <T extends Shape>(s: T, ...list: LayerEffect[]): T => ({ ...s, effects: list });

/** A character on one layer with a soft shadow shape under it. */
function sceneDoc(shadow: LayerEffect[] = [fx('blur', { radius: 6 })]): { doc: Doc; shadow: FillShape; body: FillShape } {
  const doc = newDoc({ width: 300, height: 200, length: 4, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Hero');
  const body = fill([ellipsePath(150, 80, 40, 50)], '#ff9e6d');
  const shadowShape = withFx(fill([ellipsePath(150, 150, 50, 10)], '#00000066'), ...shadow);
  hold(l, vectorDrawing(doc, [shadowShape, body]).id, 0, 4);
  return { doc, shadow: shadowShape, body };
}

describe('the format', () => {
  it('writes a shape effect and reads it back the same', () => {
    const { doc } = sceneDoc([fx('glow', { size: 10 }), fx('shadow', { x: 4 }, 'e2')]);
    const { doc: back, warnings } = loadFile(saveFile(doc, '1.0.0'));
    expect(warnings).toEqual([]);
    expect(back).toEqual(doc);
  });

  it('opens a file made before shapes had effects, and writes it back without the field', () => {
    const { doc, shadow } = sceneDoc();
    delete (shadow as { effects?: unknown }).effects;
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect(back).toEqual(doc);
    const shapes = Object.values(back.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes : []));
    expect(shapes.some((s) => 'effects' in s)).toBe(false);
  });

  it('checks what it reads: a bad kind or a bad number is dropped or defaulted, keys are left out, and a bad list is ignored', () => {
    const base: Shape = fill([rectPath(0, 0, 10, 10)], '#ff0000');
    const read = withShapeEffects(base, {
      effects: [{ id: 'a', kind: 'blur', values: { radius: 'lots' }, keys: [{ frame: 2, values: { radius: 9 } }] }, { id: 'b', kind: 'nonsense', values: {} }, { id: 'c', kind: 'glow', on: false, values: { size: 12 } }],
    }) as FillShape;
    expect(read.effects).toEqual([
      { id: 'a', kind: 'blur', values: defaultValues('blur') },
      { id: 'c', kind: 'glow', on: false, values: { ...defaultValues('glow'), size: 12 } },
    ]);
    expect(withShapeEffects(base, { effects: 'blur' })).toBe(base);
    expect(withShapeEffects(base, {})).toBe(base);
    expect(readEffects([])).toBeUndefined();
  });

  it('gives every kind of shape the field, so text and symbols can carry it too', () => {
    const doc = newDoc({ width: 50, height: 50 });
    const l = addVectorLayer(doc, 'L');
    const d = vectorDrawing(doc, [fill([rectPath(0, 0, 5, 5)], '#fff')]);
    d.shapes.push(
      { id: 'i1', type: 'instance', symbolId: 'sym', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0, effects: [fx('blur')] } as unknown as Shape,
    );
    hold(l, d.id, 0, 1);
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    const inst = (back.drawings[d.id] as { shapes: Shape[] }).shapes.find((s) => s.type === 'instance') as unknown as { effects?: LayerEffect[] };
    expect(inst.effects?.[0].kind).toBe('blur');
  });
});

describe('what counts as an effect on a shape', () => {
  it('ignores one that is off or does nothing', () => {
    const plain = fill([rectPath(0, 0, 5, 5)], '#fff');
    expect(hasShapeFx(plain)).toBe(false);
    expect(hasShapeFx(withFx(plain, { ...fx('blur', { radius: 5 }), on: false }))).toBe(false);
    expect(hasShapeFx(withFx(plain, fx('blur', { radius: 0 })))).toBe(false);
    expect(hasShapeFx(withFx(plain, fx('blur', { radius: 5 })))).toBe(true);
  });

  it('draws shape effects at their own settings whatever keys they carry (they are not animated)', () => {
    const e = { ...fx('blur', { radius: 3 }), keys: [{ frame: 0, values: { radius: 20 } }] };
    const list = drawableShapeFx(withFx(fill([rectPath(0, 0, 5, 5)], '#fff'), e), 7);
    expect(list).toHaveLength(1);
    expect(list[0].v.radius).toBe(3);
  });

  it('shows the first picked shape\'s stack, and says when the picked shapes disagree', () => {
    const a = withFx(fill([rectPath(0, 0, 5, 5)], '#fff'), fx('blur', {}, 'x'));
    const b = withFx(fill([rectPath(0, 0, 5, 5)], '#fff'), fx('blur', {}, 'x'));
    const c = fill([rectPath(0, 0, 5, 5)], '#fff');
    expect(stackOf([a, b])).toEqual({ effects: a.effects, mixed: false });
    expect(stackOf([a, c]).mixed).toBe(true);
    expect(stackOf([])).toEqual({ effects: [], mixed: false });
  });
});

describe('the edits', () => {
  const holders = (...shapes: Shape[]) => shapes as unknown as edit.Holder[];

  it('adds one effect to every picked shape with the same id, so they edit together', () => {
    const a = fill([rectPath(0, 0, 5, 5)], '#fff');
    const b = fill([rectPath(0, 0, 5, 5)], '#000');
    const id = edit.addEffectTo(holders(a, b), 'glow')!;
    expect((a as FillShape).effects![0].id).toBe(id);
    expect((b as FillShape).effects![0].id).toBe(id);
    expect(edit.setEffectValueIn(holders(a, b), id, 'size', 14, 0)).toBe(true);
    expect((a as FillShape).effects![0].values.size).toBe(14);
    expect((b as FillShape).effects![0].values.size).toBe(14);
    expect(edit.setEffectOnIn(holders(a, b), id, false)).toBe(true);
    expect((b as FillShape).effects![0].on).toBe(false);
    expect(edit.resetEffectIn(holders(a, b), id)).toBe(true);
    expect((a as FillShape).effects![0].values.size).toBe(defaultValues('glow').size);
  });

  it('reorders, removes and clears, and leaves no empty list behind', () => {
    const a = fill([rectPath(0, 0, 5, 5)], '#fff');
    const h = holders(a);
    const one = edit.addEffectTo(h, 'blur')!;
    const two = edit.addEffectTo(h, 'shadow')!;
    expect(edit.moveEffectIn(h, one, 1)).toBe(true);
    expect((a as FillShape).effects!.map((e) => e.id)).toEqual([two, one]);
    expect(edit.moveEffectIn(h, one, 1)).toBe(false);
    expect(edit.removeEffectFrom(h, two)).toBe(true);
    expect(edit.clearEffectsOf(h)).toBe(true);
    expect('effects' in a).toBe(false);
    expect(edit.clearEffectsOf(h)).toBe(false);
  });

  it('still edits a layer the way it always did', () => {
    const { doc } = sceneDoc();
    const t = { layer: doc.layers[0].id };
    const id = edit.addEffect(doc, t, 'glow')!;
    expect(edit.setEffectValue(doc, t, id, 'size', 9, 0)).toBe(true);
    expect(doc.layers[0].effects![0].values.size).toBe(9);
    expect(edit.removeEffect(doc, t, id)).toBe(true);
    expect(doc.layers[0].effects).toBeUndefined();
  });
});

describe('merging a shape that has an effect', () => {
  const soft = withFx(fill([rectPath(0, 0, 100, 100)], '#ff0000'), fx('blur'));

  it('is never merged: it stays its own shape, like a grouped one', () => {
    expect(mergeable(soft)).toBe(false);
    expect(mergeable(fill([rectPath(0, 0, 5, 5)], '#ff0000'))).toBe(true);
    // New paint of a different colour across it does not cut a hole in it, and the same colour does not join it.
    for (const colour of ['#00ff00', '#ff0000']) {
      const r = mergeShapes([soft], [fill([rectPath(50, 50, 100, 100)], colour)]);
      expect(r.shapes).toHaveLength(2);
      expect(r.shapes[0]).toBe(soft);
    }
  });

  it('is left alone by the merge-mode eraser', () => {
    const r = eraseArea([soft], polygonGeom([{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 }]));
    expect(r.shapes).toEqual([soft]);
  });

  it('keeps its effect on every piece when the object eraser cuts it', () => {
    const r = eraseBits([soft], polygonGeom([{ x: 40, y: -10 }, { x: 60, y: -10 }, { x: 60, y: 110 }, { x: 40, y: 110 }]));
    expect(r.shapes.length).toBeGreaterThan(1);
    for (const s of r.shapes) expect((s as FillShape).effects?.[0].kind).toBe('blur');
    // Their own copies, so changing one does not change the other.
    expect((r.shapes[0] as FillShape).effects).not.toBe((r.shapes[1] as FillShape).effects);
  });

  it('is worn by a joined shape along with the colours, and counts as a difference when asked which look to take', () => {
    const plain = fill([rectPath(0, 0, 60, 60)], '#00ff00');
    const glow = withFx(fill([rectPath(40, 40, 60, 60)], '#00ff00'), fx('glow'));
    const ids = new Set([plain.id, glow.id]);
    expect(looksDiffer([plain, glow], ids)).toBe(true);
    const top = combineShapes([plain, glow], ids, 'join', 'top');
    const bottom = combineShapes([plain, glow], ids, 'join', 'bottom');
    expect(typeof top).not.toBe('string');
    expect(((top as { shapes: PathShape[] }).shapes[0]).effects?.[0].kind).toBe('glow');
    expect(((bottom as { shapes: PathShape[] }).shapes[0]).effects).toBeUndefined();
    // The same effects with different ids are not a difference.
    const twin = withFx(fill([rectPath(40, 40, 60, 60)], '#00ff00'), fx('glow', {}, 'other'));
    expect(looksDiffer([glow, twin], new Set([glow.id, twin.id]))).toBe(false);
  });

  it('is kept by turning a brush line into an editable line', () => {
    const s = withFx(stroke([[0, 0], [60, 20], [120, 0]], '#222222', 8), fx('shadow')) as StrokeShape;
    const path = strokeToPath(s, 0.5);
    expect(path?.effects?.[0].kind).toBe('shadow');
  });

  describe('Break apart', () => {
    const line = withFx(stroke([[0, 0], [60, 20], [120, 0]], '#222222', 10), fx('glow')) as StrokeShape;
    const under = fill([rectPath(0, 0, 200, 100)], '#ffffff');

    it('keeps the effect on the pieces when asked, and they stay separate from the paint around them', () => {
      const r = breakApart([under, line], new Set([line.id]), true, 'keep');
      const made = r.shapes.filter((s) => r.ids.includes(s.id));
      expect(made.length).toBeGreaterThan(0);
      for (const s of made) expect(s.type === 'fill' && s.effects?.[0].kind).toBe('glow');
      expect(r.shapes[0]).toBe(under);
    });

    it('lets the pieces be plain paint when asked', () => {
      const r = breakApart([under, line], new Set([line.id]), true, 'drop');
      expect(r.shapes.some((s) => 'effects' in s)).toBe(false);
      const solo = breakApart([line], new Set([line.id]), false, 'drop');
      expect(solo.shapes.some((s) => 'effects' in s)).toBe(false);
    });

    it('on a layer that keeps shapes separate: each piece wears the effect', () => {
      const r = breakApart([line], new Set([line.id]), false, 'keep');
      expect(r.shapes.every((s) => (s as FillShape).effects?.[0].kind === 'glow')).toBe(true);
    });
  });
});

describe('room for the effect', () => {
  it('makes the box of a drawing bigger by how far the effect paints, so a soft shadow is not cut off', () => {
    const plain = vectorDrawing(newDoc({ width: 10, height: 10 }), [fill([rectPath(10, 10, 20, 20)], '#fff')]);
    const soft = vectorDrawing(newDoc({ width: 10, height: 10 }), [withFx(fill([rectPath(10, 10, 20, 20)], '#fff'), fx('blur', { radius: 5 }))]);
    const a = drawingBox(plain);
    const b = drawingBox(soft);
    const reach = effectReach('blur', { radius: 5 });
    expect(reach).toBeGreaterThan(0);
    expect(b.x0).toBeCloseTo(a.x0 - reach);
    expect(b.y1).toBeCloseTo(a.y1 + reach);
  });

  it('gives a layer bitmap the whole stage rather than guessing how far the effect goes', () => {
    expect(shapesInk([fill([rectPath(10, 10, 20, 20)], '#fff')])).not.toBeNull();
    expect(shapesInk([withFx(fill([rectPath(10, 10, 20, 20)], '#fff'), fx('wave'))])).toBeNull();
  });
});

describe('what each export does with an effect on a shape', () => {
  it('lists the kinds a document uses on shapes, apart from the ones on layers', () => {
    const { doc } = sceneDoc([fx('blur'), fx('glow')]);
    doc.layers[0].effects = [fx('shadow', {}, 'ls')];
    const f = docFeatures(doc);
    expect([...f.shapeEffectKinds].sort()).toEqual(['blur', 'glow']);
    expect([...f.effectKinds]).toEqual(['shadow']);
    expect(f.features.has('effects')).toBe(true);
    expect(docFeatures(sceneDoc([]).doc).shapeEffectKinds.size).toBe(0);
  });

  it('says plainly what will happen, format by format', () => {
    const { doc } = sceneDoc([fx('blur'), fx('pixelate')]);
    // Pictures of frames draw it exactly: nothing to warn about.
    for (const f of ['png', 'gif', 'sheet', 'mp4', 'webp', 'pngseq'] as const) expect(carryWarnings(doc, f)).toEqual([]);
    // Layers that hold one become pictures where the format has pictures for effects (Lottie's own blur is for whole layers).
    for (const f of ['lottie', 'pdf', 'ai', 'psd'] as const) expect(carryWarnings(doc, f).join(' ')).toMatch(/Turned into pictures here: .*layers with a shape that has soften and pixelate/);
    // SVG draws what it has a filter for and leaves out the rest.
    const svg = carryWarnings(doc, 'svg').join(' ');
    expect(svg).toMatch(/Left out here: pixelate on single shapes/);
    expect(svg).not.toMatch(/soften/);
    expect(carryWarnings(doc, 'svganim').join(' ')).toMatch(/Left out here: pixelate on single shapes/);
    expect(bakesEffects(doc, 'lottie')).toBe(true);
    expect(bakesEffects(doc, 'svg')).toBe(false);
  });

  it('SVG: the shape has a filter of its own and the shapes round it do not', () => {
    const { doc } = sceneDoc([fx('blur', { radius: 6 })]);
    const { svg, notes } = frameSvgExport(doc, 0);
    expect(svg.match(/<filter /g)).toHaveLength(1);
    expect(svg).toMatch(/<feGaussianBlur[^>]*stdDeviation="6"/);
    const wrapped = svg.match(/<g filter="url\(#[^)]+\)">(<path[^>]*\/>)<\/g>/);
    expect(wrapped?.[1]).toContain('#00000066'.slice(0, 7));
    // The body ellipse is outside any filter group.
    expect(svg).toMatch(/<\/g>\s*<path d="[^"]*" fill="#ff9e6d"/);
    expect(notes).toEqual([]);
  });

  it('SVG: an effect it has nothing like is left out, and the note says so', () => {
    const { doc } = sceneDoc([fx('blur', { radius: 6 }), fx('pixelate')]);
    const { svg, notes } = frameSvgExport(doc, 0);
    expect(svg).toContain('<filter ');
    expect(notes.join(' ')).toMatch(/Pixelate on a shape was left out: SVG has nothing like it\./);
  });

  it('PDF and Illustrator: a layer holding one is a picture, so it comes out looking right', () => {
    const { doc } = sceneDoc();
    expect(needsPicture(doc.layers[0], 0, doc)).toBe(true);
    const plain = sceneDoc([]).doc;
    expect(needsPicture(plain.layers[0], 0, plain)).toBe(false);
  });

  it('Lottie: Lottie only has effects on a whole layer, so the layer is baked, or the effect is left out and said so', () => {
    const { doc } = sceneDoc();
    const { data, notes } = lottieExport(doc);
    expect(JSON.stringify(data)).not.toContain('"ty":29');
    expect(notes.join(' ')).toMatch(/"Hero" (became pictures, since a shape on it has soften|.* left out)|soften on shapes of "Hero" was left out/);
  });

  it('Godot scenes: the part\'s picture is drawn by the app, so the effect is baked into it, and the notes say which layer', () => {
    const { doc } = sceneDoc([fx('glow')]);
    const notes = new BonesNotes();
    partLook(doc, doc.layers[0], notes);
    expect(notes.lines().baked).toEqual(['Glow (one shape) on Hero']);
  });

  it('finds a shape effect on the layer, on the frames asked about', () => {
    const { doc } = sceneDoc();
    expect(layerHasShapeFx(doc, doc.layers[0])).toBe(true);
    expect([...layerShapeFxKinds(doc, doc.layers[0])]).toEqual(['blur']);
    expect(layerHasShapeFx(doc, doc.layers[0], [99])).toBe(false);
  });
});

describe('copies', () => {
  it('give a copy its own list', () => {
    const list = [fx('blur')];
    const c = cloneEffects(list)!;
    expect(c).toEqual(list);
    expect(c).not.toBe(list);
    expect(c[0]).not.toBe(list[0]);
    expect(cloneEffects(undefined)).toBeUndefined();
    expect(cloneEffects([])).toBeUndefined();
  });
});

describe('the default is not a surprise', () => {
  it('a document with no shape effects mentions none', () => {
    const { doc } = sceneDoc([]);
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect(JSON.stringify(back)).not.toContain('"effects"');
  });
});
