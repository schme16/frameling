import { describe, expect, it } from 'vitest';
import { uid } from '../../src/core/doc';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { allScopes, bakeScales, bonesNotes, bonesStage, godotBonesScene, MAX_BAKE, maxStretch } from '../../src/export/godot-bones';
import { buildAnimations } from '../../src/export/sheet';
import type { Doc, InstanceShape } from '../../src/core/format';

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
