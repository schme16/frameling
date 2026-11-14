// Layer folders as Node2D nodes in the Godot bones scene: nested like the folders, hidden ones hidden, a fade on the
// node when nothing in the folder overlaps (else on each layer), names clean and unique among siblings.
import { describe, expect, it } from 'vitest';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { allScopes, bonesNotes, bonesRigs, bonesStage, godotBonesScene, nativeFolderFades } from '../../src/export/godot-bones';
import { buildAnimations } from '../../src/export/sheet';
import { makePuppet } from '../../src/templates/puppet';
import type { Doc } from '../../src/core/format';

/** The scene text, every picture a 30 x 30 square at `at(layer name, index)` (default: spread out, nothing overlaps). */
function scene(doc: Doc, at: (name: string, i: number) => { x: number; y: number } = (_n, i) => ({ x: i * 100, y: 0 })) {
  const range = { start: 0, end: doc.length - 1 };
  const top = bonesStage(doc, range);
  let i = 0;
  for (const sc of allScopes(top)) sc.textures = sc.parts.map((p) => p.pictures.map(() => ({ path: `res://p${i}.png`, w: 30, h: 30, ...at(p.layer.name, i++) })));
  const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: doc.length - 1, fps: doc.fps, whole: true });
  const input = { doc, range, parts: top.parts, textures: top.textures!, scale: 1, animations, rootName: 'Extras', nested: top.nested };
  return { top, input, tscn: godotBonesScene(input) };
}

/** The lines of one node's block. */
const node = (tscn: string, header: string) => {
  const at = tscn.indexOf(header);
  expect(at, header).toBeGreaterThanOrEqual(0);
  return tscn.slice(at, tscn.indexOf('\n\n', at));
};

describe('Godot bones: folders as nodes', () => {
  it('makes a Node2D for every folder, nested like the folders, with the layers inside', () => {
    const { tscn } = scene(bonesExtrasDoc({ folders: true }));
    expect(tscn).toContain('[node name="Scenery" type="Node2D" parent="."]');
    expect(tscn).toContain('[node name="Hills_far" type="Sprite2D" parent="Scenery"]');
    expect(tscn).toContain('[node name="Props_faded" type="Node2D" parent="Scenery"]');
    expect(tscn).toContain('[node name="Crate" type="Sprite2D" parent="Scenery/Props_faded"]');
    expect(tscn).toContain('[node name="Crate 2" type="Sprite2D" parent="Scenery/Props_faded"]');
    expect(tscn).toContain('[node name="Cast" type="Node2D" parent="."]');
    // The symbol copies on the Hero layer sit inside the Cast folder.
    expect(tscn).toContain('type="CanvasGroup" parent="Cast"');
    // A layer outside every folder stays at the root.
    expect(tscn).toContain('[node name="Sky" type="Sprite2D" parent="."]');
  });

  it('writes parents before their children', () => {
    const { tscn } = scene(bonesExtrasDoc({ folders: true }));
    const seen = new Set<string>(['.']);
    for (const m of tscn.matchAll(/\[node name="([^"]*)" type="[^"]*"(?: parent="([^"]*)")?\]/g)) {
      const parent = m[2];
      if (parent !== undefined) expect(seen.has(parent), `${m[1]} before its parent ${parent}`).toBe(true);
      seen.add(parent === undefined ? '.' : parent === '.' ? m[1] : `${parent}/${m[1]}`);
    }
  });

  it('hides a hidden folder and keeps its layers inside, nested ones too', () => {
    const { tscn } = scene(bonesExtrasDoc({ folders: true }));
    expect(node(tscn, '[node name="Ghosts"')).toContain('visible = false');
    expect(node(tscn, '[node name="Inner"')).toContain('visible = false');
    expect(tscn).toContain('[node name="Inner" type="Node2D" parent="Ghosts"]');
    expect(node(tscn, '[node name="Ghost" type="Sprite2D" parent="Ghosts"]')).not.toContain('visible');
    expect(tscn).toContain('[node name="Ghost 2" type="Sprite2D" parent="Ghosts/Inner"]');
  });

  it('puts a fade on the folder node when its layers do not overlap, and takes it off the layers', () => {
    const { tscn } = scene(bonesExtrasDoc({ folders: true }));
    expect(node(tscn, '[node name="Props_faded"')).toContain('modulate = Color(1, 1, 1, 0.5)');
    expect(node(tscn, '[node name="Crate" type="Sprite2D"')).not.toContain('modulate');
    expect(node(tscn, '[node name="Crate 2" type="Sprite2D"')).not.toContain('modulate');
  });

  it('keeps the fade on each layer when the layers overlap (a group would be needed)', () => {
    const { tscn, top } = scene(bonesExtrasDoc({ folders: true }), () => ({ x: 10, y: 10 }));
    expect(node(tscn, '[node name="Props_faded"')).not.toContain('modulate');
    expect(node(tscn, '[node name="Crate" type="Sprite2D"')).toContain('modulate = Color(1, 1, 1, 0.5)');
    expect(node(tscn, '[node name="Crate 2" type="Sprite2D"')).toContain('modulate = Color(1, 1, 1, 0.5)');
    expect(nativeFolderFades(bonesExtrasDoc({ folders: true }), top, top.textures!, false).size).toBe(0);
  });

  it('multiplies nested fades without doubling them: only the folders whose nodes carry one are taken off', () => {
    const doc = bonesExtrasDoc({ folders: true });
    doc.folders!.scenery.opacity = 0.5;
    // Scenery holds Hills.far and the two crates: they are apart, so both folders fade on their nodes.
    const { tscn } = scene(doc);
    expect(node(tscn, '[node name="Scenery"')).toContain('modulate = Color(1, 1, 1, 0.5)');
    expect(node(tscn, '[node name="Props_faded"')).toContain('modulate = Color(1, 1, 1, 0.5)');
    expect(node(tscn, '[node name="Crate" type="Sprite2D"')).not.toContain('modulate');
    // Crates overlapping: the inner fade goes on each crate, Scenery (which now overlaps itself) is folded too.
    const over = scene(doc, (n) => (n === 'Crate' ? { x: 10, y: 10 } : { x: 0, y: 0 })).tscn;
    expect(node(over, '[node name="Scenery"')).not.toContain('modulate');
    expect(node(over, '[node name="Crate" type="Sprite2D"')).toContain('modulate = Color(1, 1, 1, 0.25)');
  });

  it('keeps a folder fade on a symbol copy (a group fades as one picture), with the node left plain', () => {
    const doc = bonesExtrasDoc({ folders: true });
    doc.folders!.cast.opacity = 0.5;
    const { tscn } = scene(doc);
    expect(node(tscn, '[node name="Cast"')).not.toContain('modulate');
    // The folder's 0.5 is the copy's own fade.
    expect(node(tscn, '[node name="Arm" type="CanvasGroup" parent="Cast"]')).toContain('self_modulate = Color(1, 1, 1, 0.5)');
  });

  it('keeps blends and effects on each layer', () => {
    const doc = bonesExtrasDoc({ folders: true });
    doc.folders!.scenery.blend = 'add';
    const { tscn } = scene(doc);
    expect(node(tscn, '[node name="Hills_far"')).toContain('material = SubResource("Blend_add")');
    expect(node(tscn, '[node name="Scenery"')).not.toContain('material');
    expect(bonesNotes(doc).folded.join('|')).toContain('Blend mode on Scenery');
  });

  it('names folders and layers apart among siblings', () => {
    const doc = bonesExtrasDoc({ folders: true });
    doc.folders!.scenery.name = 'Sky';
    const { tscn } = scene(doc);
    expect(tscn).toContain('[node name="Sky" type="Sprite2D" parent="."]');
    expect(tscn).toContain('[node name="Sky 2" type="Node2D" parent="."]');
    expect(tscn).toContain('[node name="Hills_far" type="Sprite2D" parent="Sky 2"]');
  });

  it('one node for a folder whose layers sit apart in the list', () => {
    const doc = bonesExtrasDoc({ folders: true });
    const crates = doc.layers.filter((l) => l.name === 'Crate');
    // Move the second crate to the top of the stack: it is still in Props.faded.
    doc.layers.splice(doc.layers.indexOf(crates[1]), 1);
    doc.layers.push(crates[1]);
    const { tscn } = scene(doc);
    expect(tscn.match(/name="Props_faded"/g)).toHaveLength(1);
    expect(tscn).toContain('[node name="Crate 2" type="Sprite2D" parent="Scenery/Props_faded"]');
  });

  it('a hidden folder keeps the pictures of its layers and its layers are drawn at their z', () => {
    const { top } = scene(bonesExtrasDoc({ folders: true }));
    expect(top.parts.map((p) => p.layer.name)).toEqual(expect.arrayContaining(['Ghost', 'Ghost 2']));
  });

  it('leaves out a layer on a bone in a hidden folder (it cannot sit in the folder node) and says so', () => {
    const doc = makePuppet();
    doc.folders = { f: { id: 'f', name: 'Gear', visible: false, opacity: 1 } };
    const rigId = bonesRigs(doc)[0].id;
    const onBone = doc.layers.find((l) => l.bind?.rig === rigId)!;
    onBone.folder = 'f';
    const range = { start: 0, end: doc.length - 1 };
    expect(bonesStage(doc, range).parts.some((p) => p.layer === onBone)).toBe(false);
    expect(bonesNotes(doc).skipped.join('|')).toContain(`on ${onBone.name}`);
    // Visible, it stays, and the notes say it stays under its bone instead of in the folder.
    doc.folders.f.visible = true;
    expect(bonesStage(doc, range).parts.some((p) => p.layer === onBone)).toBe(true);
    expect(bonesNotes(doc).folded.join('|')).toContain(`Layers on a bone in Gear (${onBone.name}`);
  });

  it('says what folders become, and warns about a faded folder with several layers', () => {
    const n = bonesNotes(bonesExtrasDoc({ folders: true }));
    expect(n.native.join('|')).toContain('Layer folders: a Node2D each');
    expect(n.folded.join('|')).toContain('Fade on Props.faded');
    expect(bonesNotes(bonesExtrasDoc()).folded).toEqual([]);
    expect(bonesNotes(bonesExtrasDoc()).native.join('|')).not.toContain('Layer folders');
  });
});
