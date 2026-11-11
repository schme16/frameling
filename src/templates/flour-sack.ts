import { newDoc } from '../core/doc';
import type { Doc, FillShape, PathShape, StrokeShape } from '../core/format';
import {
  GRAPE, INK, MINT, PEACH, ROSE, SUNNY,
  addClip, addMarker, addVectorLayer, arc, ellipsePath, emptyOf, fill, hold, linePath, pathShape, rectPath, smoothClosed, stroke, vectorDrawing,
  type XY,
} from './build';

const GROUND = 450;
const CX = 480;
const SACK = '#fffdf7';
const SACK_SHADE = '#f1e3c4';

// The sack drawn once in its own coordinates (origin at the middle of its base, y negative going up), then
// squashed, stretched and leaned for every pose.
const BODY: XY[] = [
  [-24, -178], [-60, -150], [-86, -96], [-82, -30], [-52, -2], [0, 4], [52, -2], [82, -30], [86, -96], [60, -150], [24, -178], [0, -182],
];
const TUFT: XY[] = [[-34, -170], [-44, -204], [-20, -194], [0, -218], [20, -194], [44, -204], [34, -170]];

export interface Pose {
  /** Horizontal squash (1 = none) and vertical stretch (1 = none). */
  sx: number;
  sy: number;
  /** How high the base is off the ground, in pixels. */
  lift: number;
  /** Lean, in pixels the top shifts sideways. */
  lean?: number;
  /** The tuft lags behind the body: positive hangs it lower. */
  flop?: number;
  eyes: 'open' | 'happy';
  mouth: 'smile' | 'open';
}

function sackShapes(p: Pose): (StrokeShape | FillShape | PathShape)[] {
  const lean = p.lean ?? 0;
  const flop = p.flop ?? 0;
  const at = ([x, y]: XY): XY => [CX + x * p.sx + (lean * -y) / 200, GROUND - p.lift + y * p.sy];
  const tuft = TUFT.map(([x, y]): XY => at([x, y < -176 ? y + flop : y]));
  const body = BODY.map(at);
  const eyeY = -112;
  const out: (StrokeShape | FillShape | PathShape)[] = [];

  out.push(pathShape([smoothClosed(tuft)], SACK, { color: INK, width: 7 }));
  out.push(pathShape([smoothClosed(body)], SACK, { color: INK, width: 8 }));
  // A soft shaded side, a mint patch and the rope tied round the neck.
  out.push(stroke([at([62, -138]), at([78, -96]), at([70, -44])], SACK_SHADE, 16, { taperStart: 10, taperEnd: 10 }));
  out.push(pathShape([smoothClosed([at([30, -62]), at([62, -64]), at([62, -32]), at([30, -30])])], MINT, { color: INK, width: 5 }));
  out.push(stroke([at([-31, -168]), at([0, -160]), at([31, -168])], ROSE, 13));
  out.push(stroke([at([-31, -168]), at([0, -160]), at([31, -168])], INK, 3, { opacity: 0.35 }));

  for (const s of [-1, 1]) {
    const [ex, ey] = at([s * 28, eyeY]);
    if (p.eyes === 'open') {
      out.push(fill([ellipsePath(ex, ey, 9 * p.sx, 13 * p.sy)], INK));
      out.push(fill([ellipsePath(ex - 3, ey - 5 * p.sy, 3.5, 4.5)], '#ffffff'));
    } else {
      // Happy squeezed-shut eyes, an upside-down U.
      out.push(stroke(arc(ex, ey + 6 * p.sy, 11 * p.sx, 10 * p.sy, Math.PI * 1.1, Math.PI * 1.9, 8), INK, 6));
    }
    const [cx, cy] = at([s * 52, -84]);
    out.push(fill([ellipsePath(cx, cy, 14 * p.sx, 9 * p.sy)], ROSE, 0.55));
  }
  const [mx, my] = at([0, -84]);
  if (p.mouth === 'smile') {
    out.push(stroke(arc(mx, my - 6 * p.sy, 15 * p.sx, 12 * p.sy, Math.PI * 0.15, Math.PI * 0.85, 8), INK, 5));
  } else {
    out.push(pathShape([ellipsePath(mx, my, 11 * p.sx, 13 * p.sy)], ROSE, { color: INK, width: 5 }));
  }
  return out;
}

// idle, anticipation, push off, then up, over the top and down, landing and settling, back to idle.
const POSES: Pose[] = [
  { sx: 1, sy: 1, lift: 0, eyes: 'open', mouth: 'smile' },
  { sx: 1.14, sy: 0.86, lift: 0, lean: -6, flop: -8, eyes: 'open', mouth: 'smile' },
  { sx: 1.26, sy: 0.7, lift: 0, lean: -10, flop: -14, eyes: 'happy', mouth: 'smile' },
  { sx: 0.84, sy: 1.2, lift: 40, lean: 8, flop: 14, eyes: 'open', mouth: 'open' },
  { sx: 0.88, sy: 1.14, lift: 130, lean: 6, flop: 18, eyes: 'open', mouth: 'open' },
  { sx: 0.96, sy: 1.04, lift: 190, lean: 2, flop: 4, eyes: 'open', mouth: 'open' },
  { sx: 0.96, sy: 1.04, lift: 196, lean: -2, flop: -6, eyes: 'open', mouth: 'open' },
  { sx: 0.9, sy: 1.12, lift: 150, lean: -4, flop: -16, eyes: 'open', mouth: 'open' },
  { sx: 0.86, sy: 1.18, lift: 60, lean: -6, flop: -20, eyes: 'open', mouth: 'open' },
  { sx: 1.36, sy: 0.64, lift: 0, lean: 0, flop: -16, eyes: 'happy', mouth: 'smile' },
  { sx: 1.18, sy: 0.84, lift: 0, lean: 4, flop: -4, eyes: 'happy', mouth: 'smile' },
  { sx: 0.95, sy: 1.07, lift: 0, lean: 3, flop: 8, eyes: 'open', mouth: 'smile' },
  { sx: 1.04, sy: 0.96, lift: 0, lean: 0, flop: 3, eyes: 'open', mouth: 'smile' },
];

/** The frame each pose plays on, as [pose index, frames held]. */
const TIMING: [number, number][] = [
  [0, 3], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1],
];

/** A flour sack that squashes down, jumps, and lands with a wobble. */
export function makeFlourSack(): Doc {
  const doc = emptyOf(newDoc({ name: 'Flour sack hop', width: 960, height: 540, fps: 12, length: 20, background: '#d9f0ff' }));
  const ground = addVectorLayer(doc, 'Ground');
  const shadow = addVectorLayer(doc, 'Shadow');
  const sack = addVectorLayer(doc, 'Sack');

  hold(ground, vectorDrawing(doc, [
    pathShape([rectPath(0, GROUND, 960, 540 - GROUND)], '#a8e6cf', null),
    pathShape([linePath([[0, GROUND], [960, GROUND]])], null, { color: INK, width: 6 }),
    stroke([[90, GROUND + 40], [210, GROUND + 40]], MINT, 7, { opacity: 0.7 }),
    stroke([[700, GROUND + 62], [860, GROUND + 62]], MINT, 7, { opacity: 0.7 }),
  ]).id, 0, 20);

  // Same pose, same drawing: the opening idle and the closing idle share one.
  const drawings = POSES.map((p) => vectorDrawing(doc, sackShapes(p)));
  const shadows = POSES.map((p) => vectorDrawing(doc, [
    fill([ellipsePath(CX, GROUND + 20, 96 * p.sx * (1 - p.lift / 520), 12 * (1 - p.lift / 700))], GRAPE, 0.28 - p.lift / 1400),
  ]));

  let frame = 0;
  for (const [pi, len] of TIMING) {
    hold(sack, drawings[pi].id, frame, len);
    hold(shadow, shadows[pi].id, frame, len);
    frame += len;
  }
  // The last five frames settle back into the opening pose.
  hold(sack, drawings[0].id, frame, 20 - frame);
  hold(shadow, shadows[0].id, frame, 20 - frame);

  addClip(doc, 'idle', 0, 2, true);
  addClip(doc, 'hop', 3, 14, false);
  addMarker(doc, 'launch', 5);
  addMarker(doc, 'land', 11);
  return doc;
}
