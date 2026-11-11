import { describe, expect, it } from 'vitest';
import { BONE_STRETCH, type Rig, type VectorLayer } from '../../src/core/format';
import { boneBetween, lerpPose, mirrorPose, rigState, setStretch, stretchBone, stretchOf, tidyPose } from '../../src/rig/math';
import { loadFile, saveFile } from '../../src/io/file';
import { newDoc, newVectorDrawing } from '../../src/core/doc';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

function arm(): Rig {
  return {
    bones: [boneBetween('u', 'Upper arm', { x: 0, y: 0 }, { x: 50, y: 0 }, null), boneBetween('l', 'Lower arm', { x: 50, y: 0 }, { x: 100, y: 0 }, 'u')],
  };
}

describe('squash and stretch', () => {
  it('stretches a bone along its length and carries what hangs from it', () => {
    const st = rigState(arm(), { u: { r: 0, s: 1.5 } });
    close(st.get('u')!.tip.x, 75);
    close(st.get('l')!.base.x, 75);
    close(st.get('l')!.tip.x, 150);
    // Art on the bone stretches along it, not across.
    const skin = st.get('u')!.skin;
    close(skin[0], 1.5);
    close(skin[3], 1);
  });

  it('is capped so it can never flip inside out', () => {
    expect(stretchOf({ r: 0, s: -2 })).toBe(BONE_STRETCH.min);
    expect(stretchOf({ r: 0, s: 99 })).toBe(BONE_STRETCH.max);
    expect(stretchOf({ r: 0 })).toBe(1);
    expect(setStretch({}, 'u', 0)['u'].s).toBe(BONE_STRETCH.min);
  });

  it('eases between keys, tidies away, and survives mirroring', () => {
    const p = lerpPose({ u: { r: 0, s: 2 } }, {}, 0.5);
    close(p.u.s!, 1.5);
    expect(tidyPose({ u: { r: 0, s: 1 } })).toEqual({});
    expect(tidyPose({ u: { r: 0, s: 1.2 } })).toEqual({ u: { r: 0, s: 1.2 } });
    expect(mirrorPose(arm(), { u: { r: 10, s: 1.2 } }).u).toEqual({ r: -10, s: 1.2 });
  });

  it('dragging a tip out stretches the bone to reach it', () => {
    const pose = stretchBone(arm(), {}, 'u', { x: 80, y: 3 });
    close(pose.u.s!, 1.6);
    close(rigState(arm(), pose).get('u')!.tip.x, 80);
  });

  it('is saved and read back, and old files without it still open', () => {
    const doc = newDoc({ width: 100, height: 100 });
    const d = newVectorDrawing();
    d.pose = { u: { r: 5, s: 1.4 }, l: { r: 2 } };
    doc.drawings[d.id] = d;
    (doc.layers[0] as VectorLayer).rig = arm();
    doc.layers[0].cels = [{ id: 'c', start: 0, length: 1, drawingId: d.id }];
    const back = loadFile(saveFile(doc, 'test')).doc;
    const pose = (back.drawings[d.id] as typeof d).pose!;
    expect(pose.u).toEqual({ r: 5, s: 1.4 });
    expect(pose.l).toEqual({ r: 2 });
  });
});
