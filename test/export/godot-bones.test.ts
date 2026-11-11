import { describe, expect, it } from 'vitest';
import { ease } from '../../src/core/ease';
import { bonesParts, bonesRigs, exactTransition, gdNum, godotBonesScene, reduceKeys, rigKeys } from '../../src/export/godot-bones';
import { buildAnimations } from '../../src/export/sheet';
import { makePuppet } from '../../src/templates/puppet';
import { testPuppet } from './bones-helpers';

/** Godot's own ease(x, c), from its source. */
function godotEase(x: number, c: number): number {
  if (c > 0) return c < 1 ? 1 - Math.pow(1 - x, 1 / c) : Math.pow(x, c);
  if (c < 0) return x < 0.5 ? Math.pow(x * 2, -c) * 0.5 : (1 - Math.pow(1 - (x - 0.5) * 2, -c)) * 0.5 + 0.5;
  return 0;
}

describe('Godot bones export', () => {
  it("only uses Godot's easing where it matches Frameling's exactly", () => {
    for (const e of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      const c = exactTransition(e)!;
      for (let t = 0; t <= 1; t += 0.05) expect(Math.abs(godotEase(t, c) - ease(e, t))).toBeLessThan(1e-9);
    }
    expect(exactTransition('backOut')).toBeUndefined();
    expect(exactTransition([0.1, 0.2, 0.3, 0.4])).toBeUndefined();
  });

  it('keys: two for an exact glide, one per frame for a baked one, a snap for a held pose', () => {
    const doc = testPuppet();
    const rig = bonesRigs(doc)[0];
    const frames = Array.from({ length: 24 }, (_, i) => i);
    const keys = rigKeys(rig, frames, 12);
    // Frames 0 to 6 ease in and out: one key at 0 with Godot's -3 curve.
    expect(keys[0]).toEqual({ t: 0, f: 0, trans: -3 });
    expect(keys[1].f).toBe(6);
    // 6 to 12 overshoots, so every frame gets a key.
    expect(keys.filter((k) => k.f >= 6 && k.f < 12).map((k) => k.f)).toEqual([6, 7, 8, 9, 10, 11]);
    // The last key (23) holds, then snaps back to the start.
    const last = keys.filter((k) => k.f === 23);
    expect(last.length).toBe(2);
    expect(last[1].t).toBeLessThan(2);
    expect(last[1].t).toBeGreaterThan(23 / 12);
  });

  it('drops keys a straight line already gives', () => {
    const k = (t: number, v: number, trans = 1) => ({ t, trans, v: [v] });
    expect(reduceKeys([k(0, 0), k(1, 1), k(2, 2), k(3, 5)]).map((x) => x.t)).toEqual([0, 2, 3]);
    expect(reduceKeys([k(0, 3), k(1, 3), k(2, 3)]).map((x) => x.t)).toEqual([0]);
    // An eased key keeps its neighbour.
    expect(reduceKeys([k(0, 0, -3), k(1, 1), k(2, 2)]).map((x) => x.t)).toEqual([0, 1, 2]);
  });

  it('lists parts by kind with a picture per frame', () => {
    const doc = testPuppet();
    const parts = bonesParts(doc, { start: 0, end: 23 });
    expect(parts.find((p) => p.layer.name === 'Body')!.kind).toBe('mesh');
    expect(parts.find((p) => p.layer.name === 'Head')!.kind).toBe('cut');
    expect(parts.find((p) => p.layer.name === 'Ground')!.kind).toBe('free');
    expect(parts.find((p) => p.layer.name === 'Bones')).toBeUndefined();
    for (const p of parts) expect(p.frameOf.every((x) => x === 0)).toBe(true);
  });

  it('writes a scene with the skeleton, parts in layer order and a walk', () => {
    const doc = makePuppet();
    const range = { start: 0, end: 23 };
    const parts = bonesParts(doc, range);
    const textures = parts.map((p, i) => p.pictures.map(() => ({ path: `res://p${i}.png`, x: 1, y: 2, w: 3, h: 4 })));
    const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: 23, fps: 12, whole: true });
    const tscn = godotBonesScene({ doc, range, parts, textures, scale: 1, animations, rootName: 'Puppet' });
    expect(tscn).toMatch(/^\[gd_scene load_steps=\d+ format=3\]/);
    expect(tscn).toContain('[node name="Bones" type="Skeleton2D" parent="."]');
    expect(tscn).toContain('[node name="Chest" type="Bone2D" parent="Bones/Hips"]');
    expect(tscn).toContain('[node name="Head" type="Sprite2D" parent="Bones/Hips/Chest/Head"]');
    expect(tscn).toContain('resource_name = "walk"');
    expect(tscn).toContain('NodePath("Bones/Hips/Left thigh:rotation")');
    expect(tscn).toContain('autoplay = &"walk"');
    // No squash in the plain puppet, so no scale tracks.
    expect(tscn).not.toContain(':scale")');
    // Ground at the back, the near arm at the front.
    const z = (n: string) => Number(tscn.split(`[node name="${n}" type="Sprite2D"`)[1].match(/z_index = (\d+)/)![1]);
    expect(z('Ground')).toBeLessThan(z('Left lower arm'));
    expect(gdNum(-0)).toBe('0');
    expect(gdNum(1 / 3)).toBe('0.333333');
  });
});
