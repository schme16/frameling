import { newDoc } from '../core/doc';
import type { Doc } from '../core/format';
import { INK, MINT, PEACH, ROSE, SUNNY, addClip, addMarker, addVectorLayer, ellipsePath, emptyOf, fill, hold, pathShape, rectPath, smoothClosed, stroke, vectorDrawing, type XY } from './build';

const W = 800;
const H = 600;
const GROUND = 500;
const DRAWINGS = 8;
const THIGH = 80;
const SHIN = 76;
const FAR = '#8a80b0';

const rad = (d: number) => (d * Math.PI) / 180;

/** One leg at a point in the cycle (0 to 1): thigh swings, the knee bends on the way forward. Angles from straight down. */
function leg(p: number): { thigh: number; shin: number } {
  const s = Math.sin(p * Math.PI * 2);
  const thigh = 26 * Math.cos(p * Math.PI * 2);
  // Swinging forward when s < 0: lift the foot. A little bend all the time so it never looks locked.
  const bend = 6 + Math.max(0, -s) * 62;
  return { thigh, shin: thigh - bend };
}

function legPoints(hip: XY, p: number): XY[] {
  const { thigh, shin } = leg(p);
  const knee: XY = [hip[0] + Math.sin(rad(thigh)) * THIGH, hip[1] + Math.cos(rad(thigh)) * THIGH];
  const ankle: XY = [knee[0] + Math.sin(rad(shin)) * SHIN, knee[1] + Math.cos(rad(shin)) * SHIN];
  // The foot points forward, tipping up a bit as the leg trails behind.
  const toe: XY = [ankle[0] + 26, ankle[1] + Math.min(4, (thigh + 26) * 0.3) - 4];
  return [hip, knee, ankle, toe];
}

/** How far below the hip the lowest foot reaches, so the body sits on whichever leg is down (that makes the bob). */
function reach(p: number): number {
  return Math.max(...[p, p + 0.5].flatMap((q) => legPoints([0, 0], q).map((pt) => pt[1])));
}

function armPoints(shoulder: XY, swing: number): XY[] {
  const elbow: XY = [shoulder[0] + Math.sin(rad(swing)) * 54, shoulder[1] + Math.cos(rad(swing)) * 54];
  const fore = swing + 24 + Math.max(0, swing) * 0.6;
  return [shoulder, elbow, [elbow[0] + Math.sin(rad(fore)) * 48, elbow[1] + Math.cos(rad(fore)) * 48]];
}

/** One drawing of the walk: far limbs, body, head, near limbs. */
function pose(doc: Doc, i: number) {
  const p = i / DRAWINGS;
  const hip: XY = [W / 2 - 10, GROUND - reach(p)];
  const shoulder: XY = [hip[0] + 10, hip[1] - 104];
  const head: XY = [shoulder[0] + 12, shoulder[1] - 70];
  const swing = 24 * Math.cos(p * Math.PI * 2);
  // A bean of a body, a little wider at the bottom, leaning into the walk.
  const body = smoothClosed([
    [hip[0] - 40, hip[1] + 4],
    [hip[0] - 46, hip[1] - 50],
    [shoulder[0] - 36, shoulder[1] - 6],
    [shoulder[0] + 2, shoulder[1] - 24],
    [shoulder[0] + 38, shoulder[1] - 4],
    [hip[0] + 48, hip[1] - 46],
    [hip[0] + 38, hip[1] + 8],
    [hip[0], hip[1] + 16],
  ]);
  const limb = (pts: XY[], color: string, size: number, end: string) => {
    const tip = pts[pts.length - 1];
    return [stroke(pts, color, size, { step: 6 }), pathShape([ellipsePath(tip[0], tip[1], size * 0.7, size * 0.7)], end, { color: INK, width: 4 })];
  };
  const foot = (pts: XY[], color: string) => {
    const [, , ankle, toe] = pts;
    return pathShape([ellipsePath((ankle[0] + toe[0]) / 2 + 2, (ankle[1] + toe[1]) / 2 + 2, 24, 11)], color, { color: INK, width: 4 });
  };
  const far = legPoints(hip, p + 0.5);
  const near = legPoints(hip, p);
  return vectorDrawing(doc, [
    stroke(far.slice(0, 3), FAR, 20, { step: 6 }),
    foot(far, FAR),
    ...limb(armPoints(shoulder, swing), FAR, 16, FAR),
    pathShape([body], PEACH, { color: INK, width: 6 }),
    pathShape([ellipsePath(head[0], head[1], 52, 54)], SUNNY, { color: INK, width: 6 }),
    fill([ellipsePath(head[0] + 24, head[1] - 8, 6, 10)], INK),
    stroke([[head[0] + 10, head[1] + 20], [head[0] + 22, head[1] + 27], [head[0] + 36, head[1] + 20]], INK, 5),
    fill([ellipsePath(head[0] + 4, head[1] + 12, 11, 7)], ROSE, 0.6),
    stroke(near.slice(0, 3), INK, 22, { step: 6 }),
    foot(near, ROSE),
    ...limb(armPoints(shoulder, -swing), INK, 18, SUNNY),
  ]);
}

/**
 * A walk cycle on twos: 8 drawings each held for 2 frames (16 frames at 12 fps), walking on the spot so it loops.
 * The body bobs because it always rests on whichever foot is lowest. Onion skin is set up for the walker only.
 */
export function makeWalkCycle(): Doc {
  const doc = emptyOf(newDoc({ name: 'Walk cycle', width: W, height: H, fps: 12, length: DRAWINGS * 2, background: '#f4f0ff' }));

  const ground = addVectorLayer(doc, 'Ground');
  ground.onion = false;
  ground.locked = true;
  hold(ground, vectorDrawing(doc, [fill([rectPath(0, GROUND + 12, W, H - GROUND)], MINT), fill([ellipsePath(W / 2, GROUND + 16, 120, 12)], INK, 0.15)]).id, 0, DRAWINGS * 2);

  const walker = addVectorLayer(doc, 'Walker');
  for (let i = 0; i < DRAWINGS; i++) hold(walker, pose(doc, i).id, i * 2, 2);

  addClip(doc, 'walk', 0, DRAWINGS * 2 - 1, true);
  addMarker(doc, 'contact', 0);
  addMarker(doc, 'passing', 4);
  addMarker(doc, 'contact', 8);
  addMarker(doc, 'passing', 12);
  return doc;
}
