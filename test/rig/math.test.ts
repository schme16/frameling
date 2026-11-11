import { describe, expect, it } from 'vitest';
import type { Bone, Rig } from '../../src/core/format';
import {
  aimBone,
  applyPins,
  autoWeights,
  boneBetween,
  capturePins,
  deformMesh,
  gridMesh,
  ikChain,
  lerpPose,
  mapply,
  mirrorName,
  mirrorPose,
  moveBone,
  rigState,
  skinMesh,
  solveIK,
  solvePoints,
  tidyPose,
  triangleTransform,
  unposeOnMesh,
  wrapAngle,
} from '../../src/rig/math';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

/** An arm along +x: upper (0..50), lower (50..100), hand (100..120). */
function arm(): Rig {
  const upper = boneBetween('u', 'Upper arm', { x: 0, y: 0 }, { x: 50, y: 0 }, null);
  const lower = boneBetween('l', 'Lower arm', { x: 50, y: 0 }, { x: 100, y: 0 }, 'u');
  const hand = boneBetween('h', 'Hand', { x: 100, y: 0 }, { x: 120, y: 0 }, 'l');
  return { bones: [upper, lower, hand] };
}

describe('bone maths', () => {
  it('rest pose puts every bone where it was drawn, and its skin matrix is the identity', () => {
    const st = rigState(arm());
    const l = st.get('l')!;
    close(l.base.x, 50);
    close(l.tip.x, 100);
    close(l.skin[0], 1);
    close(l.skin[4], 0);
  });

  it('turning a parent carries its children (FK)', () => {
    const rig = arm();
    const st = rigState(rig, { u: { r: 90 } });
    close(st.get('l')!.base.x, 0, 1e-6);
    close(st.get('l')!.base.y, 50);
    close(st.get('h')!.tip.y, 120);
    close(st.get('h')!.angle, 90);
  });

  it('skin matrices move rest art with the bone', () => {
    const st = rigState(arm(), { l: { r: 90 } });
    const p = mapply(st.get('l')!.skin, 75, 0);
    close(p.x, 50);
    close(p.y, 25);
  });

  it('moving a root moves the whole skeleton', () => {
    const rig = arm();
    const pose = moveBone(rig, {}, 'u', 10, 5);
    const st = rigState(rig, pose);
    close(st.get('h')!.tip.x, 130);
    close(st.get('h')!.tip.y, 5);
  });

  it('moving a child bone is measured in its turned parent', () => {
    const rig = arm();
    const pose = moveBone(rig, { u: { r: 90 } }, 'l', 10, 0);
    close(rigState(rig, pose).get('l')!.base.x, 10);
  });

  it('aims a bone at the pointer', () => {
    const rig = arm();
    const pose = aimBone(rig, {}, 'u', { x: 40, y: 0 }, { x: 0, y: 40 });
    close(pose.u.r, 90);
  });

  it('wraps angles', () => {
    expect(wrapAngle(190)).toBe(-170);
    expect(wrapAngle(-190)).toBe(170);
    expect(wrapAngle(540)).toBe(180);
  });

  it('eases between poses and tidies rest bones away', () => {
    const p = lerpPose({ a: { r: 0 } }, { a: { r: 90, x: 10 } }, 0.5);
    close(p.a.r, 45);
    close(p.a.x!, 5);
    expect(tidyPose({ a: { r: 0 }, b: { r: 1e-9 }, c: { r: 3 } })).toEqual({ c: { r: 3 } });
  });
});

describe('IK', () => {
  it('two bones reach a target exactly, keeping their lengths', () => {
    const pts = solvePoints([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], { x: 60, y: 30 });
    close(pts[2].x, 60, 1e-6);
    close(pts[2].y, 30, 1e-6);
    close(Math.hypot(pts[1].x, pts[1].y), 50);
    close(Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y), 50);
  });

  it('two bones keep bending the way they already bend', () => {
    const down = solvePoints([{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 0 }], { x: 70, y: 0 });
    expect(down[1].y).toBeGreaterThan(0);
    const up = solvePoints([{ x: 0, y: 0 }, { x: 30, y: -40 }, { x: 60, y: 0 }], { x: 70, y: 0 });
    expect(up[1].y).toBeLessThan(0);
  });

  it('a target out of reach straightens the chain toward it', () => {
    const pts = solvePoints([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], { x: 0, y: 500 });
    close(pts[2].x, 0, 1e-6);
    close(pts[2].y, 100, 1e-6);
  });

  it('longer chains use CCD and get there', () => {
    const joints = [0, 1, 2, 3, 4].map((i) => ({ x: i * 25, y: 0 }));
    const pts = solvePoints(joints, { x: 40, y: 60 });
    expect(Math.hypot(pts[4].x - 40, pts[4].y - 60)).toBeLessThan(0.05);
    for (let i = 0; i < 4; i++) close(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y), 25, 1e-6);
  });

  it('solveIK turns the chain bones so the tip lands on the target', () => {
    const rig = arm();
    const pose = solveIK(rig, {}, ['u', 'l'], { x: 70, y: 40 });
    const st = rigState(rig, pose);
    close(st.get('l')!.tip.x, 70, 1e-6);
    close(st.get('l')!.tip.y, 40, 1e-6);
    // The hand rides along without turning on its own.
    expect(pose.h).toBeUndefined();
  });

  it('the IK chain stops at pins, branches and roots', () => {
    const rig = arm();
    expect(ikChain(rig, 'h')).toEqual(['u', 'l', 'h']);
    expect(ikChain(rig, 'h', 2)).toEqual(['l', 'h']);
    rig.bones[0] = { ...rig.bones[0], pin: true };
    expect(ikChain(rig, 'h')).toEqual(['l', 'h']);
    const chest: Bone = boneBetween('c', 'Chest', { x: 0, y: 50 }, { x: 0, y: 0 }, null);
    const branched: Rig = { bones: [chest, { ...boneBetween('a1', 'A', { x: 0, y: 0 }, { x: 20, y: 0 }, 'c') }, boneBetween('a2', 'B', { x: 20, y: 0 }, { x: 40, y: 0 }, 'a1'), boneBetween('n', 'Neck', { x: 0, y: 0 }, { x: 0, y: -10 }, 'c')] };
    expect(ikChain(branched, 'a2')).toEqual(['a1', 'a2']);
  });
});

describe('pins', () => {
  /** Hips with a leg hanging down: thigh, shin, foot. */
  function leg(): Rig {
    return {
      bones: [
        boneBetween('hip', 'Hips', { x: 0, y: 0 }, { x: 0, y: -20 }, null),
        boneBetween('th', 'Left thigh', { x: 0, y: 0 }, { x: 5, y: 50 }, 'hip'),
        boneBetween('sh', 'Left shin', { x: 5, y: 50 }, { x: 0, y: 100 }, 'th'),
        { ...boneBetween('ft', 'Left foot', { x: 0, y: 100 }, { x: 20, y: 100 }, 'sh'), pin: true },
      ],
    };
  }

  it('a pinned foot stays put when the hips move down', () => {
    const rig = leg();
    const holds = capturePins(rig, {});
    const moved = moveBone(rig, {}, 'hip', 3, 15);
    const pose = applyPins(rig, moved, holds, new Set(['hip']));
    const st = rigState(rig, pose);
    close(st.get('ft')!.base.x, 0, 1e-4);
    close(st.get('ft')!.base.y, 100, 1e-4);
    close(st.get('ft')!.angle, 0, 1e-4);
    close(st.get('hip')!.base.y, 15);
  });

  it('pins on dragged bones are left alone', () => {
    const rig = leg();
    const holds = capturePins(rig, {});
    const turned = { th: { r: 30 } };
    expect(applyPins(rig, turned, holds, new Set(['ft']))).toBe(turned);
  });
});

describe('mirror', () => {
  it('finds the other side by name', () => {
    expect(mirrorName('Left arm')).toBe('Right arm');
    expect(mirrorName('right leg')).toBe('left leg');
    expect(mirrorName('arm.L')).toBe('arm.R');
    expect(mirrorName('R hand')).toBe('L hand');
    expect(mirrorName('Head')).toBeUndefined();
  });

  it('swaps paired bones and reverses every turn', () => {
    const rig: Rig = { bones: [boneBetween('la', 'Left arm', { x: 0, y: 0 }, { x: -10, y: 0 }, null), boneBetween('ra', 'Right arm', { x: 0, y: 0 }, { x: 10, y: 0 }, null), boneBetween('hd', 'Head', { x: 0, y: 0 }, { x: 0, y: -10 }, null)] };
    const out = mirrorPose(rig, { la: { r: 20 }, hd: { r: 5, x: 3, y: 1 } });
    expect(out.ra).toEqual({ r: -20 });
    expect(out.la).toBeUndefined();
    expect(out.hd).toEqual({ r: -5, x: -3, y: 1 });
  });
});

describe('weights, meshes and skinning', () => {
  it('auto weights favour the nearest bone and sum to 1', () => {
    const segs = [
      { base: { x: 0, y: 0 }, tip: { x: 50, y: 0 } },
      { base: { x: 50, y: 0 }, tip: { x: 100, y: 0 } },
    ];
    const near = autoWeights({ x: 10, y: 2 }, segs);
    expect(near[0]).toBe(0);
    expect(near[1]).toBeGreaterThan(0.9);
    const mid = autoWeights({ x: 50, y: 10 }, segs);
    let sum = 0;
    for (let i = 1; i < mid.length; i += 2) sum += mid[i];
    close(sum, 1);
    expect(mid.length).toBe(4);
    close(mid[1], 0.5, 1e-6);
  });

  it('grid meshes drop empty squares and unused points', () => {
    const all = gridMesh({ x: 0, y: 0, w: 100, h: 50 }, 4);
    expect(all.triangles.length).toBe(4 * 2 * 6);
    expect(all.points.length).toBe(5 * 3 * 2);
    const half = gridMesh({ x: 0, y: 0, w: 100, h: 50 }, 4, (x) => x < 50);
    expect(half.triangles.length).toBe(2 * 2 * 6);
    expect(half.points.length).toBe(3 * 3 * 2);
  });

  it('a skinned mesh stays put at rest and bends with its bones', () => {
    const rig = arm();
    const mesh = skinMesh(rig, gridMesh({ x: 0, y: -10, w: 100, h: 20 }, 10));
    const rest = deformMesh(mesh, rigState(rig));
    for (let i = 0; i < rest.length; i++) close(rest[i], mesh.points[i], 1e-9);
    const bent = deformMesh(mesh, rigState(rig, { l: { r: 90 } }));
    // The point at the far end of the lower arm swings down under the elbow.
    const i = mesh.points.findIndex((v, k) => k % 2 === 0 && v === 100 && mesh.points[k + 1] === 0);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(bent[i + 1]).toBeGreaterThan(40);
    expect(Math.abs(bent[i] - 50)).toBeLessThan(6);
    // A point at the shoulder hardly moves.
    const j = mesh.points.findIndex((v, k) => k % 2 === 0 && v === 0 && mesh.points[k + 1] === 0);
    close(bent[j], 0, 0.5);
    close(bent[j + 1], 0, 0.5);
  });

  it('maps a posed point back to rest through its triangle', () => {
    const rig = arm();
    const mesh = skinMesh(rig, gridMesh({ x: 0, y: -10, w: 100, h: 20 }, 10));
    const st = rigState(rig, { u: { r: 30 } });
    const posed = deformMesh(mesh, st);
    // A point on the upper arm at rest, where it ends up, and back.
    const at = mapply(st.get('u')!.skin, 20, 3);
    const back = unposeOnMesh(mesh, posed, at)!;
    close(back.x, 20, 0.5);
    close(back.y, 3, 0.5);
    expect(unposeOnMesh(mesh, posed, { x: 500, y: 500 })).toBeUndefined();
  });

  it('triangle transforms map corners onto corners', () => {
    const m = triangleTransform([0, 0, 10, 0, 0, 10], [5, 5, 5, 15, -5, 5])!;
    const p = mapply(m, 10, 0);
    close(p.x, 5);
    close(p.y, 15);
    expect(triangleTransform([0, 0, 1, 1, 2, 2], [0, 0, 1, 1, 2, 2])).toBeNull();
  });
});
