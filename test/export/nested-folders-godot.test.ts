// Folders inside folders in the Godot bones scene: every folder around a layer adds its fade, blend, effects and hiding.
import { describe, expect, it } from 'vitest';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { bonesParts } from '../../src/export/godot-bones-scope';

const range = { start: 0, end: 11 };

describe('nested folders in the Godot bones scene', () => {
  it('multiplies the fades of the folders around a layer and takes the nearest blend', () => {
    const doc = bonesExtrasDoc();
    doc.folders = {
      outer: { id: 'outer', name: 'Outer', visible: true, opacity: 0.5, blend: 'add' },
      inner: { id: 'inner', name: 'Inner', visible: true, opacity: 0.5, blend: 'multiply', parent: 'outer' },
    };
    const sky = doc.layers.find((l) => l.name === 'Sky')!;
    sky.folder = 'inner';
    const p = bonesParts(doc, range).find((x) => x.layer.name === 'Sky')!;
    expect(p.look!.opacity).toBeCloseTo(0.25, 5);
    expect(p.look!.blend).toBe('mul');
    // With no blend on the inner folder the outer one's applies.
    delete doc.folders.inner.blend;
    expect(bonesParts(doc, range).find((x) => x.layer.name === 'Sky')!.look!.blend).toBe('add');
  });

  it('keeps a layer whose outer folder is hidden (the folder node is hidden), and stacks folder effects', () => {
    const doc = bonesExtrasDoc();
    doc.folders = {
      outer: { id: 'outer', name: 'Outer', visible: true, opacity: 1, effects: [{ id: 'e1', kind: 'blur', values: { radius: 3 } }] },
      inner: { id: 'inner', name: 'Inner', visible: true, opacity: 1, effects: [{ id: 'e2', kind: 'glow', values: { color: '#ffffff', size: 4, strength: 1 } }], parent: 'outer' },
    };
    doc.layers.find((l) => l.name === 'Sky')!.folder = 'inner';
    const p = bonesParts(doc, range).find((x) => x.layer.name === 'Sky')!;
    expect(p.look!.effects.map((e) => e.kind)).toEqual(['glow', 'blur']);
    doc.folders.outer.visible = false;
    expect(bonesParts(doc, range).some((x) => x.layer.name === 'Sky')).toBe(true);
  });
});
