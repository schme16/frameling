import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Doc, VectorDrawing } from '../../src/core/format';
import { allScopes, bonesRigs, type BonesScope } from '../../src/export/godot-bones';
import { encodePng } from '../../src/io/png';
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

/** A flat card per picture, so the scene has something to load. */
export function cards(top: BonesScope, dir: string) {
  let n = 0;
  for (const sc of allScopes(top)) {
    sc.textures = sc.parts.map((p) =>
      p.pictures.map(() => {
        const i = n++;
        const px = new Uint8ClampedArray(4 * 4 * 4);
        for (let j = 0; j < 16; j++) px.set([40 + ((i * 53) % 200), 90, 160, 255], j * 4);
        writeFileSync(path.join(dir, `parts/c${i}.png`), encodePng({ width: 4, height: 4, pixels: px }));
        return { path: `res://parts/c${i}.png`, x: 2 * i, y: 3 * i, w: 4, h: 4 };
      }),
    );
  }
}

