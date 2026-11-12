import { describe, expect, it } from 'vitest';
import { uid } from '../../src/core/doc';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { allScopes, bakeScales, groupLayout, bonesNotes, bonesStage, godotBonesScene, MAX_BAKE, maxStretch } from '../../src/export/godot-bones';
import { buildAnimations } from '../../src/export/sheet';
import type { Doc, InstanceShape } from '../../src/core/format';
import { newVectorLayer } from '../../src/core/doc';
import { newCameraLayer } from '../../src/core/camera';
import type { VectorLayer } from '../../src/core/format';
import { bonesParts } from '../../src/export/godot-bones';
import { ellipsePath, hold, pathShape, rectPath, vectorDrawing } from '../../src/templates/build';

describe('Godot bones notes: hidden layers inside symbols with effects', () => {
  it('says so only when the symbol has effects and a hidden or reference layer', () => {
    const doc = bonesExtrasDoc();
    const sym = Object.values(doc.symbols!)[0];
    expect(bonesNotes(doc).skipped.join('|')).not.toContain('Hidden or reference');
    const hand = sym.layers.find((l) => l.name === 'Hand')!;
    hand.effects = [{ id: uid('e'), kind: 'blur', values: { radius: 2 } }];
    // Effects alone: nothing is dropped.
    expect(bonesNotes(doc).skipped.join('|')).not.toContain('Hidden or reference');
    sym.layers.find((l) => l.name === 'Lower arm')!.visible = false;
    expect(bonesNotes(doc).skipped.join('|')).toContain('Hidden or reference layers inside symbols with effects are left out of the pictures on Hero');
    // A reference layer counts too.
    sym.layers.find((l) => l.name === 'Lower arm')!.visible = true;
    sym.layers.find((l) => l.name === 'Upper arm')!.reference = true;
    expect(bonesNotes(doc).skipped.join('|')).toContain('Hidden or reference layers inside symbols with effects');
    // Without effects it is plain behaviour and not worth a note.
    hand.effects = [];
    expect(bonesNotes(doc).skipped.join('|')).not.toContain('Hidden or reference');
  });
});

// ---------------------------------------------------------------- scaled copies


/** The extras scene with the second arm copy scaled `s` times on the stage. */
function bigArm(s: number): Doc {
  const doc = bonesExtrasDoc();
  const hero = doc.layers.find((l) => l.name === 'Hero')!;
  for (const cel of hero.cels) {
    const d = doc.drawings[cel.drawingId];
    if (d.kind !== 'vector') continue;
    const inst = d.shapes[1] as InstanceShape;
    inst.transform = { ...inst.transform, scaleX: s, scaleY: s };
  }
  return doc;
}

function sceneOf(doc: Doc, k: number) {
  const range = { start: 0, end: doc.length - 1 };
  const top = bonesStage(doc, range);
  const bakes = bakeScales(top, doc, k);
  let n = 0;
  for (const sc of allScopes(top)) {
    const b = bakes.get(sc) ?? 1;
    sc.textures = sc.parts.map((p) => p.pictures.map(() => ({ path: `res://p${n++}.png`, x: 8, y: 12, w: 40, h: 40, ...(b !== 1 ? { bake: b } : {}) })));
  }
  const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: doc.length - 1, fps: doc.fps, whole: true });
  return { top, bakes, tscn: godotBonesScene({ doc, range, parts: top.parts, textures: top.textures!, scale: k, animations, rootName: 'Extras', nested: top.nested }) };
}

describe('Godot bones: symbol copies scaled up stay sharp', () => {
  it('measures how much a matrix stretches', () => {
    expect(maxStretch([1, 0, 0, 1, 5, 5])).toBeCloseTo(1);
    expect(maxStretch([0, 3, -3, 0, 0, 0])).toBeCloseTo(3);
    expect(maxStretch([2, 0, 0, 0.5, 0, 0])).toBeCloseTo(2);
    expect(maxStretch([1, 0, 1, 1, 0, 0])).toBeCloseTo(1.618, 3);
  });

  it('bakes a symbol at the largest scale any copy shows at, and the stage at 1', () => {
    const doc = bigArm(3);
    const top = bonesStage(doc, { start: 0, end: doc.length - 1 });
    const b = bakeScales(top, doc, 1);
    expect(b.get(top)).toBe(1);
    expect(b.get(top.nested[0].scope)).toBe(3);
    // Copies that are small or the same size cost nothing extra.
    const plain = bonesStage(bigArm(1), { start: 0, end: 11 });
    expect(bakeScales(plain, doc, 1).get(plain.nested[0].scope)).toBe(1);
  });

  it('stops at the cap', () => {
    const doc = bigArm(12);
    const top = bonesStage(doc, { start: 0, end: doc.length - 1 });
    expect(bakeScales(top, doc, 1).get(top.nested[0].scope)).toBe(MAX_BAKE);
  });

  it('keeps a huge stage inside what a canvas can be', () => {
    const doc = bigArm(4);
    doc.width = 3840;
    doc.height = 2160;
    const top = bonesStage(doc, { start: 0, end: doc.length - 1 });
    const b = bakeScales(top, doc, 1).get(top.nested[0].scope)!;
    expect(b).toBeGreaterThanOrEqual(1);
    expect((doc.width + 3840) * b).toBeLessThanOrEqual(8192);
  });

  it('writes the picture smaller by the same factor, in the symbol only', () => {
    const { tscn, bakes, top } = sceneOf(bigArm(3), 1);
    expect([...bakes.values()]).toEqual([1, 3]);
    const upper = tscn.split('[node name="Upper arm" type="Sprite2D"')[1].split('\n\n')[0];
    expect(upper).toContain('scale = Vector2(0.333333, 0.333333)');
    // Where the picture sits is in baked pixels, divided back to scene pixels.
    expect(upper).toMatch(/position = Vector2\(/);
    const sky = tscn.split('[node name="Sky" type="Sprite2D"')[1].split('\n\n')[0];
    expect(sky).not.toContain('scale =');
    expect(top.nested.length).toBe(2);
  });

  it('leaves the scene as it was when nothing is scaled up', () => {
    const { tscn } = sceneOf(bonesExtrasDoc(), 1);
    expect(tscn).not.toContain('scale = Vector2(0.');
  });
});

// ---------------------------------------------------------------- masks and clipping


function maskLayer(doc: Doc, name: string, mode: 'show' | 'hide' | undefined, at: number): VectorLayer {
  const l = newVectorLayer(name) as VectorLayer;
  if (mode) l.mask = mode;
  hold(l, vectorDrawing(doc, [pathShape([ellipsePath(120, 70, 40, 40)], '#ffffff', null)]).id, 0, 12);
  doc.layers.splice(at, 0, l);
  return l;
}

const names = (doc: Doc) => bonesParts(doc, { start: 0, end: 11 }).map((p) => p.layer.name);
const partOf = (doc: Doc, name: string) => bonesParts(doc, { start: 0, end: 11 }).find((p) => p.layer.name === name)!;

describe('Godot bones: masks and clip to the layer below', () => {
  it('bakes a mask into the parts under it and not the parts above it', () => {
    const doc = bonesExtrasDoc();
    const cut = maskLayer(doc, 'Cut', 'show', 1);
    expect(names(doc)).toEqual(['Sky', 'Glow']);
    expect(partOf(doc, 'Sky').masks).toEqual([{ layer: cut, op: 'in' }]);
    expect(partOf(doc, 'Glow').masks).toBeUndefined();
    const n = bonesNotes(doc);
    expect(n.baked).toContain('Show mask on Sky');
    expect(n.skipped.join('|')).not.toContain('Mask');
  });

  it('a Hide mask removes instead of keeps', () => {
    const doc = bonesExtrasDoc();
    maskLayer(doc, 'Cut', 'hide', 1);
    expect(partOf(doc, 'Sky').masks![0].op).toBe('out');
    expect(bonesNotes(doc).baked).toContain('Hide mask on Sky');
  });

  it('clips a layer to the one below it', () => {
    const doc = bonesExtrasDoc();
    const paint = maskLayer(doc, 'Paint', undefined, 1);
    paint.clipToBelow = true;
    const sky = doc.layers[0];
    expect(partOf(doc, 'Paint').masks).toEqual([{ layer: sky, op: 'in', clip: true }]);
    expect(bonesNotes(doc).baked).toContain('Clip to the layer below on Paint');
    // The base hidden hides what is clipped to it.
    sky.visible = false;
    expect(names(doc)).not.toContain('Paint');
  });

  it('makes a picture for each step of an animated mask', () => {
    const doc = bonesExtrasDoc();
    const cut = maskLayer(doc, 'Cut', 'show', 1);
    expect(partOf(doc, 'Sky').pictures.length).toBe(1);
    const second = vectorDrawing(doc, [pathShape([rectPath(0, 0, 50, 50)], '#ffffff', null)]);
    cut.cels = [{ ...cut.cels[0], length: 6 }, { id: uid('c'), start: 6, length: 6, drawingId: second.id }];
    const sky = partOf(doc, 'Sky');
    expect(sky.pictures.length).toBe(2);
    expect(sky.frameOf).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  });

  it('does not carry a mask that moves with a bone or sits at another depth, and says so', () => {
    const doc = bonesExtrasDoc();
    const cut = maskLayer(doc, 'Cut', 'show', 1);
    cut.depth = 2;
    // Depth means nothing without a camera.
    expect(partOf(doc, 'Sky').masks?.length).toBe(1);
    const { layer: cam } = newCameraLayer(doc);
    doc.layers.push(cam);
    expect(partOf(doc, 'Sky').masks).toBeUndefined();
    expect(bonesNotes(doc).skipped.join('|')).toContain('Masks and clipping are not applied');
    cut.depth = undefined;
    doc.layers[0].depth = undefined;
    doc.layers.pop();
    cut.bind = { rig: 'nope', bone: 'nope' };
    expect(partOf(doc, 'Sky').masks).toBeUndefined();
    expect(bonesNotes(doc).skipped.join('|')).toContain('on Sky');
  });

  it('keeps a mask inside its folder', () => {
    const doc = bonesExtrasDoc();
    doc.folders = { f1: { id: 'f1', name: 'Group', visible: true, opacity: 1 } };
    const cut = maskLayer(doc, 'Cut', 'show', 2);
    cut.folder = 'f1';
    const hero = doc.layers.find((l) => l.name === 'Hero')!;
    hero.folder = 'f1';
    // Sky is outside the folder, so the mask never reaches it.
    expect(partOf(doc, 'Sky').masks).toBeUndefined();
    expect(partOf(doc, 'Glow').masks).toBeUndefined();
  });

  it('draws symbols with bones into a masked layer instead of keeping them live', () => {
    const doc = bonesExtrasDoc();
    const stage = bonesStage(doc, { start: 0, end: 11 });
    expect(stage.nested.length).toBe(2);
    maskLayer(doc, 'Cut', 'show', doc.layers.length - 1);
    const masked = bonesStage(doc, { start: 0, end: 11 });
    expect(masked.nested.length).toBe(0);
    expect(masked.parts.map((p) => p.layer.name)).toContain('Hero');
    expect(bonesNotes(doc).skipped.join('|')).toContain('Symbols with bones are drawn into the pictures');
  });

  it('a clipped layer fades and blends with its base', () => {
    const doc = bonesExtrasDoc();
    const paint = maskLayer(doc, 'Paint', undefined, 1);
    paint.clipToBelow = true;
    paint.opacity = 0.5;
    doc.layers[0].opacity = 0.6;
    doc.layers[0].blend = 'add';
    expect(partOf(doc, 'Paint').look).toMatchObject({ opacity: 0.3, blend: 'add' });
  });

  it('writes the masked scene: the mask layer is no node, the clipped one is', () => {
    const doc = bonesExtrasDoc({ masked: true });
    expect(names(doc)).toEqual(['Sky', 'Stripe', 'Glow']);
    expect(partOf(doc, 'Sky').masks!.map((m) => m.layer.name)).toEqual(['Window']);
    expect(partOf(doc, 'Stripe').masks!.map((m) => m.layer.name)).toEqual(['Sky', 'Window']);
    expect(bonesNotes(doc).baked).toEqual(expect.arrayContaining(['Show mask on Sky, Stripe', 'Clip to the layer below on Stripe']));
    const { tscn } = sceneOf(doc, 1);
    expect(tscn).toContain('name="Stripe" type="Sprite2D"');
    expect(tscn).not.toContain('name="Window"');
  });
});

// ---------------------------------------------------------------- fading a symbol as one picture

describe('Godot bones: a faded symbol is a CanvasGroup', () => {
  const armGroup = (doc: Doc) => sceneOf(doc, 1).tscn;

  it('writes the parts in drawing order, with no z_index, and fades with self_modulate', () => {
    const tscn = armGroup(bonesExtrasDoc({ fade: true }));
    expect(tscn).toContain('[node name="Arm" type="CanvasGroup" parent="."]');
    const block = tscn.split('[node name="Arm" type="CanvasGroup" parent="."]')[1].split('[node name="Arm 2"')[0];
    expect(block).toContain('self_modulate = Color(1, 1, 1, 0.5)');
    expect(block).not.toMatch(/\nmodulate = /);
    const at = (s: string) => block.indexOf(s);
    // Back to front: upper arm, then the lower arm (a child bone), then the hand.
    expect(at('name="Upper arm"')).toBeGreaterThan(-1);
    expect(at('name="Upper arm"')).toBeLessThan(at('name="Lower arm"'));
    expect(at('name="Lower arm"')).toBeLessThan(at('name="Hand"'));
    // The group itself has a z_index (its layer's step); its parts do not.
    expect(block.split('\n\n').slice(1).join('\n\n')).not.toContain('z_index');
    expect(tscn).toContain('NodePath("Arm:self_modulate")');
  });

  it('stays plain nodes with a fade on each part when the parts cannot be ordered by the tree', () => {
    const doc = bonesExtrasDoc({ fade: true });
    const sym = Object.values(doc.symbols!)[0];
    // The hand (not on a bone) between the two arm pieces: a skeleton's nodes can't be split around it.
    const [rig, upper, lower, hand] = sym.layers;
    sym.layers = [rig, upper, hand, lower];
    const tscn = armGroup(doc);
    expect(tscn).toContain('[node name="Arm" type="Node2D" parent="."]');
    expect(tscn).toContain('NodePath("Arm:modulate")');
    expect(tscn.split('[node name="Hand" type="Sprite2D" parent="Arm"]')[1].split('\n\n')[0]).toContain('z_index');
  });

  it('is not a group for a copy that never fades, or under an Add layer', () => {
    expect(armGroup(bonesExtrasDoc())).toContain('[node name="Arm 2" type="Node2D"');
    const doc = bonesExtrasDoc({ fade: true });
    doc.layers.find((l) => l.name === 'Hero')!.blend = 'add';
    expect(armGroup(doc)).not.toContain('CanvasGroup');
  });

  it('lays out the layers around a skeleton that sit wholly behind or in front of it', () => {
    const doc = bonesExtrasDoc({ fade: true });
    const sym = Object.values(doc.symbols!)[0];
    const [rig, upper, lower, hand] = sym.layers;
    const shadow = { ...hand, id: uid('l'), name: 'Shadow', cels: hand.cels };
    sym.layers = [shadow, rig, upper, lower, hand];
    const top = bonesStage(doc, { start: 0, end: 11 });
    const lay = groupLayout(top.nested[0].scope);
    expect(lay.ok).toBe(true);
    const names = lay.top.map((i) => ('part' in i ? i.part.layer.name : 'skeleton'));
    expect(names).toEqual(['Shadow', 'skeleton', 'Hand']);
  });
});
