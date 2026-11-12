import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { allScopes, bonesNotes, bonesParts, bonesStage, cameraKeys, gdFloat, godotBonesScene, godotBonesShaders, hasBonesToExport, nativeBlend, tintShader, type BonesScope } from '../../src/export/godot-bones';
import { buildAnimations } from '../../src/export/sheet';
import { makePuppet } from '../../src/templates/puppet';

const CAM = { a: { x: 180, y: 135, zoom: 1, rotation: 0 }, b: { x: 220, y: 150, zoom: 1.5, rotation: 10 } };

function scene(doc = bonesExtrasDoc({ camera: CAM }), scale = 1) {
  const range = { start: 0, end: doc.length - 1 };
  const top = bonesStage(doc, range);
  let n = 0;
  for (const sc of allScopes(top)) sc.textures = sc.parts.map((p) => p.pictures.map(() => ({ path: `res://p${n++}.png`, x: 1, y: 2, w: 3, h: 4 })));
  const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: doc.length - 1, fps: doc.fps, whole: true });
  const input = { doc, range, parts: top.parts, textures: top.textures!, scale, animations, rootName: 'Extras', nested: top.nested };
  return { doc, top, input, tscn: godotBonesScene(input) };
}

describe('Godot bones: symbols with bones', () => {
  it('finds a stage with only a symbol that has bones', () => {
    expect(hasBonesToExport(bonesExtrasDoc())).toBe(true);
    expect(hasBonesToExport(makePuppet())).toBe(true);
    expect(hasBonesToExport(newDoc())).toBe(false);
  });

  it('takes a symbol with bones out of its layer and makes a nested rig of it', () => {
    const { top } = scene();
    // The hero layer holds nothing but arms, so only the backdrop and the glow are parts.
    expect(top.parts.map((p) => p.layer.name)).toEqual(['Sky', 'Glow']);
    expect(top.nested.map((n) => n.name)).toEqual(['Arm', 'Arm']);
    const arm = top.nested[0].scope;
    expect(arm.rigs.length).toBe(1);
    expect(arm.parts.map((p) => p.layer.name)).toEqual(['Upper arm', 'Lower arm', 'Hand']);
    expect(arm.parts.map((p) => p.kind)).toEqual(['cut', 'cut', 'free']);
  });

  it('shares one scope per symbol, so its pictures are drawn once', () => {
    const { top } = scene();
    expect(top.nested[0].scope).toBe(top.nested[1].scope);
    expect(allScopes(top).length).toBe(2);
  });

  it("follows the instance's timeline: loop, play once and a single frame, restarting at each key", () => {
    const frames = (opts: Parameters<typeof bonesExtrasDoc>[0]) => bonesStage(bonesExtrasDoc(opts), { start: 0, end: 11 }).nested[0].at.map((s) => s?.frame);
    expect(frames({ play: 'loop' })).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
    expect(frames({ play: 'once', firstFrame: 8 })).toEqual([8, 9, 10, 11, 11, 11, 8, 9, 10, 11, 11, 11]);
    expect(frames({ play: 'single', firstFrame: 3 })).toEqual(Array(12).fill(3));
  });

  it('writes the nested skeleton under the instance, with its bones and the symbol animation tracks', () => {
    const { tscn } = scene();
    // It fades, so it is a CanvasGroup (a copy that never fades is a plain Node2D).
    expect(tscn).toContain('[node name="Arm" type="CanvasGroup" parent="."]');
    expect(tscn).toContain('[node name="Arm bones" type="Skeleton2D" parent="Arm"]');
    expect(tscn).toContain('[node name="Lower" type="Bone2D" parent="Arm/Arm bones/Upper"]');
    expect(tscn).toContain('[node name="Upper arm" type="Sprite2D" parent="Arm/Arm bones/Upper"]');
    // The second copy has its own nodes.
    expect(tscn).toContain('[node name="Arm 2" type="Node2D" parent="."]');
    expect(tscn.split('[node name="Arm 2"')[1].split('\n\n')[0]).not.toContain('modulate');
    expect(tscn).toContain('[node name="Hand" type="Sprite2D" parent="Arm 2"]');
    expect(tscn).toContain('NodePath("Arm/Arm bones/Upper:rotation")');
    expect(tscn).toContain('NodePath("Arm 2/Arm bones/Upper/Lower:rotation")');
    expect(tscn).toContain('NodePath("Arm:transform")');
    // A fading, tinted copy: the group's own fade (plain modulate would fade each part again) and the wash.
    expect(tscn).toContain('NodePath("Arm:self_modulate")');
    expect(tscn).not.toContain('NodePath("Arm:modulate")');
    expect(tscn).toContain('shader_parameter/tint_amount');
  });

  it("keeps a symbol's own layers between its neighbours' when drawing order is by z", () => {
    const { tscn } = scene();
    const z = (name: string, parent: string, type = 'Node2D') => Number(tscn.split(`[node name="${name}" type="${type}" parent="${parent}"]`)[1].match(/z_index = (-?\d+)/)![1]);
    const glow = Number(tscn.split('[node name="Glow" type="Sprite2D"')[1].match(/z_index = (\d+)/)![1]);
    // The second copy never fades: its node sits at its layer's step, its parts are relative to it and all fit before the next layer's step.
    const hand = Number(tscn.split('[node name="Hand" type="Sprite2D" parent="Arm 2"]')[1].match(/z_index = (\d+)/)![1]);
    expect(z('Arm 2', '.') + hand).toBeLessThan(glow);
    // The faded one is a group, which only holds children on its own z: the parts have none and the tree orders them.
    expect(tscn.split('[node name="Hand" type="Sprite2D" parent="Arm"]')[1].split('\n\n')[0]).not.toContain('z_index');
    expect(z('Arm', '.', 'CanvasGroup')).toBeLessThan(glow);
  });

  it('draws the symbol into the pictures when its layer has effects (it cannot stay live)', () => {
    const doc = bonesExtrasDoc({ fxOnHero: true });
    const top = bonesStage(doc, { start: 0, end: 11 });
    expect(top.nested.length).toBe(0);
    expect(top.parts.map((p) => p.layer.name)).toEqual(['Sky', 'Hero', 'Glow']);
    expect(bonesNotes(doc).skipped.join('|')).toContain('Symbols with bones are drawn into the pictures');
  });

  it('writes nothing for a symbol nobody placed', () => {
    const doc = bonesExtrasDoc();
    doc.layers = doc.layers.filter((l) => l.name !== 'Hero');
    expect(bonesStage(doc, { start: 0, end: 11 }).nested.length).toBe(0);
  });
});

describe('Godot bones: camera and depth', () => {
  it('makes a Camera2D that turns with the stage camera and tracks for position, zoom and turn', () => {
    const { tscn } = scene(bonesExtrasDoc({ camera: CAM }), 2);
    expect(tscn).toContain('[node name="Camera" type="Camera2D" parent="."]');
    expect(tscn).toContain('position = Vector2(360, 270)');
    expect(tscn).toContain('ignore_rotation = false');
    expect(tscn).toContain('NodePath("Camera:position")');
    expect(tscn).toContain('NodePath("Camera:zoom")');
    // Rotation keys are floats from the start, or Godot stops blending them.
    const rot = tscn.split('NodePath("Camera:rotation")')[1].match(/"values": \[([^\]]*)\]/)![1];
    expect(rot.startsWith('0.0,')).toBe(true);
    // The pan is in output pixels (scale 2): the second key is (220, 150) * 2.
    expect(tscn).toContain('Vector2(440, 300)');
  });

  it('has no camera node without a camera layer', () => {
    expect(scene(bonesExtrasDoc()).tscn).not.toContain('Camera2D');
  });

  it('puts a layer with depth under a Parallax2D with the matching scroll scale', () => {
    const { tscn } = scene();
    expect(tscn).toContain('[node name="Depth 1" type="Parallax2D" parent="."]');
    expect(tscn).toContain('scroll_scale = Vector2(0.5, 0.5)');
    // This camera zooms, so a node under it takes up the difference in how far layers zoom.
    expect(tscn).toContain('[node name="Zoom" type="Node2D" parent="Depth 1"]');
    expect(tscn).toContain('[node name="Sky" type="Sprite2D" parent="Depth 1/Zoom"]');
    expect(tscn).toContain('NodePath("Depth 1/Zoom:transform")');
  });

  it('skips the zoom node when the camera only pans', () => {
    const doc = bonesExtrasDoc({ camera: { a: CAM.a, b: { ...CAM.b, zoom: 1 } } });
    const { tscn } = scene(doc);
    expect(tscn).toContain('[node name="Sky" type="Sprite2D" parent="Depth 1"]');
    expect(tscn).not.toContain('Zoom');
  });

  it('ignores depth when there is no camera, as the stage does', () => {
    const { tscn } = scene(bonesExtrasDoc());
    expect(tscn).not.toContain('Parallax2D');
    expect(tscn).toContain('[node name="Sky" type="Sprite2D" parent="."]');
  });

  it('keys the camera per frame while it glides and snaps while it holds', () => {
    const doc = bonesExtrasDoc({ camera: CAM });
    const keys = cameraKeys(doc, [0, 1, 2, 3, 4, 5, 6, 7], 12);
    expect(keys.slice(0, 6).every((k) => k.glide)).toBe(true);
    expect(keys[6].glide).toBe(false);
    expect(cameraKeys(bonesExtrasDoc(), [0, 1], 12).every((k) => !k.glide)).toBe(true);
  });
});

describe('Godot bones: looks', () => {
  it('maps the blend modes Godot has and says which are approximate', () => {
    expect(nativeBlend('add')).toEqual({ blend: 'add', exact: true });
    expect(nativeBlend('multiply')).toEqual({ blend: 'mul', exact: true });
    expect(nativeBlend(undefined)).toEqual({ blend: 'mix', exact: true });
    expect(nativeBlend('screen').exact).toBe(false);
    expect(nativeBlend('overlay')).toEqual({ blend: 'mix', exact: false });
    expect(nativeBlend('linear-dodge')).toEqual({ blend: 'dodge', exact: true });
    expect(nativeBlend('subtract')).toEqual({ blend: 'sub', exact: true });
    expect(nativeBlend('divide')).toEqual({ blend: 'div', exact: true });
  });

  it('writes a shader for linear dodge, subtract and divide that reads what is behind', () => {
    for (const b of ['dodge', 'sub', 'div'] as const) {
      const t = tintShader(b);
      expect(t).toContain('hint_screen_texture');
      expect(t).toContain('render_mode blend_mix;');
      expect(t).toContain('uniform float tint_amount');
    }
    expect(tintShader('dodge')).toContain('min(cb + cs');
    expect(tintShader('sub')).toContain('max(cb - cs');
    const doc = bonesExtrasDoc({ glowBlend: 'divide' });
    const { input } = scene(doc);
    const tscn = godotBonesScene(input);
    expect(tscn).toContain('type="ShaderMaterial"');
    expect(tscn).toContain('frameling-blend-div.gdshader');
    expect(godotBonesShaders(input).map((s) => s.name)).toContain('frameling-blend-div.gdshader');
    expect(bonesNotes(doc).skipped.join('|')).not.toContain('Divide');
  });

  it('gives an Add layer a CanvasItemMaterial and a fade a modulate, and keeps the effects for baking', () => {
    const { tscn, top } = scene();
    const glow = top.parts.find((p) => p.layer.name === 'Glow')!;
    expect(glow.look).toMatchObject({ opacity: 0.7, blend: 'add' });
    expect(glow.look!.effects.map((e) => e.kind)).toEqual(['glow']);
    expect(tscn).toContain('[sub_resource type="CanvasItemMaterial" id="Blend_add"]\nblend_mode = 1');
    const node = tscn.split('[node name="Glow" type="Sprite2D" parent="."]')[1].split('\n\n')[0];
    expect(node).toContain('modulate = Color(1, 1, 1, 0.7)');
    expect(node).toContain('material = SubResource("Blend_add")');
  });

  it('puts a folder\'s fade and blend on its layers and leaves out hidden folders and mask layers', () => {
    const doc = bonesExtrasDoc();
    doc.folders = { f1: { id: 'f1', name: 'Group', visible: true, opacity: 0.5, blend: 'multiply' } };
    const sky = doc.layers.find((l) => l.name === 'Sky')!;
    sky.folder = 'f1';
    const p = bonesParts(doc, { start: 0, end: 11 }).find((x) => x.layer.name === 'Sky')!;
    expect(p.look).toMatchObject({ opacity: 0.5, blend: 'mul' });
    doc.folders.f1.visible = false;
    expect(bonesParts(doc, { start: 0, end: 11 }).some((x) => x.layer.name === 'Sky')).toBe(false);
    sky.folder = undefined;
    doc.layers.find((l) => l.name === 'Glow')!.mask = 'show';
    expect(bonesParts(doc, { start: 0, end: 11 }).some((x) => x.layer.name === 'Glow')).toBe(false);
  });

  it('makes one picture per step for an effect that changes over time, and one for a steady one', () => {
    const doc = bonesExtrasDoc();
    const glow = doc.layers.find((l) => l.name === 'Glow')!;
    const steady = bonesParts(doc, { start: 0, end: 11 }).find((p) => p.layer.name === 'Glow')!;
    expect(steady.pictures.length).toBe(1);
    glow.effects![0].keys = [{ frame: 0, values: { size: 0 } }, { frame: 11, values: { size: 22 } }];
    const moving = bonesParts(doc, { start: 0, end: 11 }).find((p) => p.layer.name === 'Glow')!;
    expect(moving.pictures.length).toBe(12);
    expect(moving.frameOf).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('lists what Godot does itself, what is baked and what cannot go', () => {
    const doc = bonesExtrasDoc({ camera: CAM });
    doc.layers.find((l) => l.name === 'Sky')!.blend = 'overlay';
    doc.layers.find((l) => l.name === 'Sky')!.clipToBelow = true;
    const n = bonesNotes(doc);
    expect(n.baked).toEqual(['Glow on Glow']);
    expect(n.native.join('|')).toContain('Camera2D');
    expect(n.native.join('|')).toContain('Parallax2D');
    expect(n.native.join('|')).toContain('nested Skeleton2D');
    expect(n.native.join('|')).toContain('CanvasItemMaterial');
    expect(n.skipped.join('|')).toContain('Overlay drawn as normal on Sky');
    // Clipped with nothing under it, so it is just drawn.
    expect(n.skipped.join('|')).not.toContain('Clip');
  });

  it('says nothing for the plain puppet', () => {
    expect(bonesNotes(makePuppet())).toEqual({ native: [], baked: [], skipped: [], fades: [] });
  });

  it('writes the tint shader only for a tinted symbol, one per blend', () => {
    const { input } = scene();
    expect(godotBonesShaders(input).map((s) => s.name)).toEqual(['frameling-tint-mix.gdshader']);
    expect(tintShader('add')).toContain('render_mode blend_add;');
    expect(tintShader('mix')).toContain('uniform float tint_amount');
    const plain = scene(bonesExtrasDoc());
    plain.top.nested.forEach((n) => n.at.forEach((s) => s && delete s.tint));
    expect(godotBonesShaders(plain.input)).toEqual([]);
  });

  it('writes whole floats with a point so Godot keeps blending them', () => {
    expect(gdFloat(0)).toBe('0.0');
    expect(gdFloat(2)).toBe('2.0');
    expect(gdFloat(0.5)).toBe('0.5');
  });

  it('gives every scope a picture list for each of its parts', () => {
    const { top } = scene();
    const scopes: BonesScope[] = allScopes(top);
    expect(scopes.every((s) => s.textures?.length === s.parts.length)).toBe(true);
  });
});
