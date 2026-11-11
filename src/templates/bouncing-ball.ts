import { newDoc } from '../core/doc';
import type { Doc } from '../core/format';
import {
  GRAPE, INK, PAPER, PEACH, ROSE, SUNNY,
  addClip, addMarker, addVectorLayer, arc, ellipsePath, emptyOf, fill, hold, linePath, pathShape, rectPath, stroke, vectorDrawing,
} from './build';

const LENGTH = 16;
const GROUND = 600;
const R = 80;
const TRAVEL = 380;
const CX = 640;

/** The classic first exercise: a ball that falls, squashes on the ground and stretches as it rises. */
export function makeBouncingBall(): Doc {
  const doc = emptyOf(newDoc({ name: 'Bouncing ball', width: 1280, height: 720, fps: 12, length: LENGTH, background: PAPER }));

  const ground = addVectorLayer(doc, 'Ground');
  const shadow = addVectorLayer(doc, 'Shadow');
  const ball = addVectorLayer(doc, 'Ball');

  // The ground never changes, so one drawing is held for the whole length.
  const floor = vectorDrawing(doc, [
    pathShape([rectPath(0, GROUND, 1280, 720 - GROUND)], '#ffe2bd', null),
    pathShape([linePath([[0, GROUND], [1280, GROUND]])], null, { color: INK, width: 7 }),
    stroke([[160, GROUND + 50], [330, GROUND + 50]], PEACH, 8, { opacity: 0.55 }),
    stroke([[860, GROUND + 80], [1090, GROUND + 80]], PEACH, 8, { opacity: 0.55 }),
  ]);
  hold(ground, floor.id, 0, LENGTH);

  for (let f = 0; f < LENGTH; f++) {
    // d is how many frames away from the top of the arc we are (0 at the top, 8 on the ground), so the ball
    // speeds up as it falls and is fastest right at the ground.
    const d = f <= 8 ? f : LENGTH - f;
    const h = 1 - (d / 8) ** 2;
    let sx = 1;
    let sy = 1;
    if (d === 8) {
      sx = 1.34;
      sy = 0.66;
    } else {
      sy = 1 + 0.22 * (d / 8);
      sx = 1 / sy;
    }
    const rx = R * sx;
    const ry = R * sy;
    const cy = GROUND - ry - h * TRAVEL;

    const body = [
      fill([ellipsePath(CX, cy, rx, ry)], ROSE),
      // A sunny band across the middle, kept inside the outline.
      stroke(
        Array.from({ length: 13 }, (_, i): [number, number] => {
          const t = -1 + (i / 6);
          const w = rx * 0.74;
          return [CX + t * w, cy + ry * (0.18 + 0.2 * (1 - t * t))];
        }),
        SUNNY,
        ry * 0.3,
      ),
      // The outline goes on last, so it tidies the edges of the fill and the band.
      stroke(arc(CX, cy, rx, ry, -Math.PI * 0.6, Math.PI * 1.45, 52), INK, 8),
      stroke(arc(CX, cy, rx * 0.68, ry * 0.68, Math.PI * 1.08, Math.PI * 1.4, 8), '#ffffff', 9, { taperEnd: 14, opacity: 0.85 }),
    ];
    hold(ball, vectorDrawing(doc, body).id, f);

    const sw = 78 * (1 - 0.42 * h) * (0.8 + 0.2 * sx);
    const shade = vectorDrawing(doc, [fill([ellipsePath(CX, GROUND + 22, sw, 11 * (1 - 0.3 * h))], GRAPE, 0.3 - 0.12 * h)]);
    hold(shadow, shade.id, f);
  }

  addClip(doc, 'bounce', 0, LENGTH - 1, true);
  addMarker(doc, 'apex', 0);
  addMarker(doc, 'contact', 8);
  return doc;
}
