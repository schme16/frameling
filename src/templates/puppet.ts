/**
 * Paper doll puppet: a side-on cut-out character with every part on its own layer, a skeleton, and a walk made of
 * four poses (contact, passing, then the same two with the legs swapped).
 */
import { newDoc, uid } from '../core/doc';
import type { Bone, Doc, Pose, VectorLayer } from '../core/format';
import { boneBetween, lerpPose, swapSides } from '../rig/math';
import { GRAPE, INK, PAPER, PEACH, ROSE, SKY, SUNNY, addClip, addMarker, addVectorLayer, ellipsePath, emptyOf, hold, linePath, pathShape, rectPath, stroke, vectorDrawing, type XY } from './build';

const CX = 360;
const GROUND = 456;
const LEN = 25;

const SKIN = '#ffd9b8';
const SKIN_FAR = '#e9b993';
const SHIRT_FAR = '#7a5fd6';
const TROUSERS_FAR = '#3f8fd1';
const SHOE = '#ff7a59';
const SHOE_FAR = '#d75e40';

/** A rounded bar from a to b, `r` wide each side: a paper cut-out limb. */
function capsule(a: XY, b: XY, r: number): { closed: true; points: { x: number; y: number }[] } {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = ang - Math.PI / 2 - (Math.PI * i) / 10;
    pts.push({ x: a[0] + Math.cos(t) * r, y: a[1] + Math.sin(t) * r });
  }
  for (let i = 0; i <= 10; i++) {
    const t = ang + Math.PI / 2 - (Math.PI * i) / 10;
    pts.push({ x: b[0] + Math.cos(t) * r, y: b[1] + Math.sin(t) * r });
  }
  return { closed: true, points: pts };
}

const line = { color: INK, width: 4 };

/** The walk's poses. Bones point down at rest, so a negative turn swings a limb forward (to the right). */
function walkPoses(b: Record<string, string>): { contact: Pose; passing: Pose; wave: Pose } {
  const contact: Pose = {
    [b.hips]: { r: 0, y: 12 },
    [b.chest]: { r: 4 },
    [b.head]: { r: -3 },
    [b.lThigh]: { r: -28 },
    [b.lShin]: { r: 8 },
    [b.lFoot]: { r: -16 },
    [b.rThigh]: { r: 24 },
    [b.rShin]: { r: 14 },
    [b.rFoot]: { r: 34 },
    [b.lUpper]: { r: 26 },
    [b.lLower]: { r: -14 },
    [b.rUpper]: { r: -26 },
    [b.rLower]: { r: -30 },
  };
  const passing: Pose = {
    [b.hips]: { r: 0, y: -1 },
    [b.chest]: { r: 2 },
    [b.head]: { r: 1 },
    [b.lThigh]: { r: 2 },
    [b.lShin]: { r: 3 },
    [b.lFoot]: { r: -2 },
    [b.rThigh]: { r: -20 },
    [b.rShin]: { r: 62 },
    [b.rFoot]: { r: 14 },
    [b.lUpper]: { r: 4 },
    [b.lLower]: { r: -12 },
    [b.rUpper]: { r: -6 },
    [b.rLower]: { r: -18 },
  };
  const wave: Pose = {
    [b.chest]: { r: -3 },
    [b.head]: { r: -8 },
    [b.lUpper]: { r: -150 },
    [b.lLower]: { r: -30 },
    [b.rUpper]: { r: 8 },
  };
  return { contact, passing, wave };
}

export function makePuppet(): Doc {
  const doc = emptyOf(newDoc({ name: 'Paper doll puppet', width: 720, height: 540, fps: 12, length: 24, background: '#fff4e0' }));

  // Back to front: ground, far arm, far leg, hips and body, head, near leg, near arm, then the bones.
  const ground = addVectorLayer(doc, 'Ground');
  hold(ground, vectorDrawing(doc, [
    pathShape([rectPath(0, GROUND, 720, 540 - GROUND)], '#ffe2b0', null),
    pathShape([linePath([[0, GROUND], [720, GROUND]])], null, { color: INK, width: 5 }),
    stroke([[120, GROUND + 30], [230, GROUND + 30]], PEACH, 6, { opacity: 0.6 }),
    stroke([[480, GROUND + 52], [620, GROUND + 52]], PEACH, 6, { opacity: 0.6 }),
  ]).id, 0, 24);
  const shadow = addVectorLayer(doc, 'Shadow');
  hold(shadow, vectorDrawing(doc, [pathShape([ellipsePath(CX + 8, GROUND + 2, 70, 9)], GRAPE, null, 0.18)]).id, 0, 24);

  const part = (name: string, shapes: Parameters<typeof vectorDrawing>[1]): VectorLayer => {
    const l = addVectorLayer(doc, name);
    hold(l, vectorDrawing(doc, shapes).id, 0, 24);
    return l;
  };

  // Joint positions at rest.
  const SH: XY = [CX, 222];
  const EL: XY = [CX - 3, 276];
  const WR: XY = [CX, 326];
  const HIP: XY = [CX, 304];
  const KN: XY = [CX + 4, 372];
  const AN: XY = [CX, 436];

  const rUpper = part('Right upper arm', [pathShape([capsule(SH, EL, 13)], SHIRT_FAR, line)]);
  const rLower = part('Right lower arm', [pathShape([capsule(EL, WR, 10)], SKIN_FAR, line), pathShape([ellipsePath(WR[0], WR[1] + 6, 13, 14)], SKIN_FAR, line)]);
  const rThigh = part('Right thigh', [pathShape([capsule(HIP, KN, 16)], TROUSERS_FAR, line)]);
  const rShin = part('Right shin', [pathShape([capsule(KN, AN, 13)], TROUSERS_FAR, line)]);
  const rFoot = part('Right foot', [pathShape([capsule([CX - 4, AN[1] + 8], [CX + 26, AN[1] + 10], 10)], SHOE_FAR, line)]);
  const hips = part('Hips', [pathShape([capsule([CX - 6, 292], [CX + 6, 292], 30)], SKY, line)]);
  const body = part('Body', [
    pathShape([capsule([CX, 218], [CX, 286], 36)], GRAPE, line),
    // A sunny stripe across the shirt.
    pathShape([rectPath(CX - 34, 246, 68, 14)], SUNNY, null),
    pathShape([linePath([[CX - 34, 246], [CX + 34, 246]]), linePath([[CX - 34, 260], [CX + 34, 260]])], null, { color: INK, width: 3 }),
  ]);
  const head = part('Head', [
    pathShape([capsule([CX, 196], [CX, 210], 9)], SKIN, line),
    pathShape([ellipsePath(CX + 4, 158, 46, 44)], SKIN, line),
    // A nose bump, an eye looking forward, a rosy cheek and a tuft of hair.
    pathShape([ellipsePath(CX + 50, 162, 9, 8)], SKIN, line),
    pathShape([ellipsePath(CX + 24, 148, 5, 7)], INK, null),
    pathShape([ellipsePath(CX + 22, 172, 9, 6)], ROSE, null, 0.6),
    stroke([[CX + 18, 184], [CX + 28, 188], [CX + 38, 184]], INK, 4),
    pathShape([{ closed: true, points: [[CX - 40, 140], [CX - 30, 104], [CX - 6, 112], [CX + 6, 96], [CX + 22, 114], [CX + 46, 120], [CX + 44, 136], [CX + 10, 128], [CX - 24, 138]].map(([x, y]) => ({ x, y })) }], SUNNY, line),
  ]);
  const lThigh = part('Left thigh', [pathShape([capsule(HIP, KN, 16)], SKY, line)]);
  const lShin = part('Left shin', [pathShape([capsule(KN, AN, 13)], SKY, line)]);
  const lFoot = part('Left foot', [pathShape([capsule([CX - 4, AN[1] + 8], [CX + 26, AN[1] + 10], 10)], SHOE, line)]);
  const lUpper = part('Left upper arm', [pathShape([capsule(SH, EL, 13)], GRAPE, line)]);
  const lLower = part('Left lower arm', [pathShape([capsule(EL, WR, 10)], SKIN, line), pathShape([ellipsePath(WR[0], WR[1] + 6, 13, 14)], SKIN, line)]);

  // The skeleton.
  const id = () => uid('b');
  const b = {
    hips: id(), chest: id(), head: id(),
    lUpper: id(), lLower: id(), rUpper: id(), rLower: id(),
    lThigh: id(), lShin: id(), lFoot: id(), rThigh: id(), rShin: id(), rFoot: id(),
  };
  const bone = (bid: string, name: string, a: XY, z: XY, parent: string | null): Bone => boneBetween(bid, name, { x: a[0], y: a[1] }, { x: z[0], y: z[1] }, parent);
  const bones: Bone[] = [
    bone(b.hips, 'Hips', HIP, [CX, 262], null),
    bone(b.chest, 'Chest', [CX, 262], [CX, 214], b.hips),
    bone(b.head, 'Head', [CX, 214], [CX, 120], b.chest),
    bone(b.lUpper, 'Left upper arm', SH, EL, b.chest),
    bone(b.lLower, 'Left lower arm', EL, [WR[0], WR[1] + 14], b.lUpper),
    bone(b.rUpper, 'Right upper arm', SH, EL, b.chest),
    bone(b.rLower, 'Right lower arm', EL, [WR[0], WR[1] + 14], b.rUpper),
    bone(b.lThigh, 'Left thigh', HIP, KN, b.hips),
    bone(b.lShin, 'Left shin', KN, AN, b.lThigh),
    bone(b.lFoot, 'Left foot', AN, [AN[0] + LEN, AN[1]], b.lShin),
    bone(b.rThigh, 'Right thigh', HIP, KN, b.hips),
    bone(b.rShin, 'Right shin', KN, AN, b.rThigh),
    bone(b.rFoot, 'Right foot', AN, [AN[0] + LEN, AN[1]], b.rShin),
  ];
  const rig = { bones, poses: [] as { id: string; name: string; pose: Pose }[] };
  const { contact, passing, wave } = walkPoses(b);
  rig.poses.push({ id: uid('o'), name: 'Contact', pose: contact }, { id: uid('o'), name: 'Passing', pose: passing }, { id: uid('o'), name: 'Wave', pose: wave });

  const bonesLayer = addVectorLayer(doc, 'Bones');
  bonesLayer.rig = rig;
  bonesLayer.onion = false;
  const keys: [number, Pose][] = [
    [0, contact],
    [6, passing],
    [12, swapSides(rig, contact)],
    [18, swapSides(rig, passing)],
  ];
  for (const [f, pose] of keys) {
    const d = vectorDrawing(doc, []);
    d.pose = pose;
    bonesLayer.cels.push({ id: uid('c'), start: f, length: f === 18 ? 5 : 6, drawingId: d.id, tween: { ease: 'linear' } });
  }
  // The last frame is already 5/6 of the way back to the first pose, so frame 23 leads straight into frame 0.
  const loop = vectorDrawing(doc, []);
  loop.pose = lerpPose(swapSides(rig, passing), contact, 5 / 6);
  bonesLayer.cels.push({ id: uid('c'), start: 23, length: 1, drawingId: loop.id });

  const attach: [VectorLayer, string][] = [
    [rUpper, b.rUpper], [rLower, b.rLower], [rThigh, b.rThigh], [rShin, b.rShin], [rFoot, b.rFoot],
    [hips, b.hips], [body, b.chest], [head, b.head],
    [lThigh, b.lThigh], [lShin, b.lShin], [lFoot, b.lFoot], [lUpper, b.lUpper], [lLower, b.lLower],
  ];
  for (const [l, bone] of attach) l.bind = { rig: bonesLayer.id, bone };

  addClip(doc, 'walk', 0, 23, true);
  addMarker(doc, 'step', 0);
  addMarker(doc, 'step', 12);
  return doc;
}
