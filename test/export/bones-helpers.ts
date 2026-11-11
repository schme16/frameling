import type { Doc, VectorDrawing } from '../../src/core/format';
import { bonesRigs } from '../../src/export/godot-bones';
import { gridMesh, skinMesh } from '../../src/rig/math';
import { makePuppet } from '../../src/templates/puppet';

/** The puppet, with a glide that eases in and out, one that overshoots (baked), a squashed chest and a bent body. */
export function testPuppet(): Doc {
  const doc = makePuppet();
  const rig = bonesRigs(doc)[0];
  rig.cels[0].tween = { ease: 'easeInOut' };
  rig.cels[1].tween = { ease: 'backOut' };
  const chest = rig.rig.bones.find((b) => b.name === 'Chest')!.id;
  const thigh = rig.rig.bones.find((b) => b.name === 'Left thigh')!.id;
  const d1 = doc.drawings[rig.cels[1].drawingId] as VectorDrawing;
  d1.pose = { ...d1.pose!, [chest]: { ...d1.pose![chest], s: 0.8 }, [thigh]: { ...d1.pose![thigh], s: 1.25 } };
  const body = doc.layers.find((l) => l.name === 'Body')!;
  body.bind = { rig: rig.id, bone: chest, mesh: skinMesh(rig.rig, gridMesh({ x: 320, y: 178, w: 80, h: 150 }, 6)) };
  return doc;
}

