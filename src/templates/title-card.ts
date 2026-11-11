import { newCameraDrawing } from '../core/camera';
import { newDoc, uid } from '../core/doc';
import type { CameraLayer, Doc, TextAnimator, TextShape } from '../core/format';
import { newAnimator } from '../text/model';
import { GRAPE, INK, MINT, PAPER, PEACH, ROSE, SKY, SUNNY, addVectorLayer, ellipsePath, emptyOf, fill, hold, pathShape, rectPath, vectorDrawing, type XY } from './build';

const W = 1280;
const H = 720;
const LENGTH = 72;

/** Rays from the middle, alternating two colours, reaching well past the edges so the camera can move. */
function sunburst(cx: number, cy: number, n: number, r: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.5) / n) * Math.PI * 2;
    const pts: XY[] = [[cx, cy], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]];
    out.push(fill([{ closed: true, points: pts.map(([x, y]) => ({ x, y })) }], '#8a6bf0'));
  }
  return out;
}

function text(t: string, x: number, y: number, size: number, color: string, animators: TextAnimator[], weight = 900): TextShape {
  return { id: uid('t'), type: 'text', text: t, font: 'Nunito', size, weight, color, align: 'center', opacity: 1, transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, animators };
}

function anim(kind: TextAnimator['kind'], over: Partial<TextAnimator>): TextAnimator {
  return { ...newAnimator(kind, uid('a')), ...over };
}

/**
 * A title card: the title pops in letter by letter and then bobs in a wave, the subtitle slides up word by word,
 * and a camera starts close and tilted then eases back, with the background further away for depth.
 */
export function makeTitleCard(): Doc {
  const doc = emptyOf(newDoc({ name: 'Title card', width: W, height: H, fps: 24, length: LENGTH, background: GRAPE }));

  const back = addVectorLayer(doc, 'Sunburst');
  back.depth = 2;
  hold(back, vectorDrawing(doc, sunburst(W / 2, H / 2 - 20, 18, 1600)).id, 0, LENGTH);

  const confetti = addVectorLayer(doc, 'Confetti');
  confetti.depth = 0.6;
  const bits = [];
  const colours = [SUNNY, ROSE, MINT, SKY, PEACH, PAPER];
  for (let i = 0; i < 46; i++) {
    const x = ((i * 397) % 1500) - 110;
    const y = ((i * 263) % 860) - 70;
    // Keep the middle clear for the words.
    if (Math.abs(x - W / 2) < 380 && Math.abs(y - H / 2) < 150) continue;
    const c = colours[i % colours.length];
    bits.push(i % 3 ? pathShape([ellipsePath(x, y, 9 + (i % 4) * 3, 9 + (i % 4) * 3)], c, null) : pathShape([rectPath(x, y, 26, 12)], c, null));
  }
  hold(confetti, vectorDrawing(doc, bits).id, 0, LENGTH);

  const words = addVectorLayer(doc, 'Title');
  hold(
    words,
    vectorDrawing(doc, [
      fill([{ closed: true, points: [{ x: 150, y: 236 }, { x: 1120, y: 218 }, { x: 1140, y: 506 }, { x: 132, y: 520 }] }], INK, 0.9),
      text('Chapter One', W / 2, 368, 150, SUNNY, [anim('scale', { by: 'letter', start: 6, duration: 10, stagger: 2, ease: 'backOut' }), anim('wave', { by: 'letter', start: 36, duration: 30, stagger: 3, amount: 8 })]) as never,
      text('The great paper chase', W / 2, 460, 56, PAPER, [anim('slide', { by: 'word', start: 26, duration: 12, stagger: 4, amount: 50, ease: 'backOut' }), anim('fade', { by: 'word', start: 26, duration: 8, stagger: 4 })], 700) as never,
    ]).id,
    0,
    LENGTH,
  );

  // The camera starts close in and tilted on the title, then eases back to show the whole card.
  const cam: CameraLayer = { id: uid('l'), name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, onion: false, cels: [] };
  const a = newCameraDrawing({ x: W / 2 - 40, y: H / 2 + 10, zoom: 1.7, rotation: -5 });
  const b = newCameraDrawing({ x: W / 2, y: H / 2, zoom: 1, rotation: 0 });
  doc.drawings[a.id] = a;
  doc.drawings[b.id] = b;
  cam.cels.push({ id: uid('c'), start: 0, length: 44, drawingId: a.id, tween: { ease: 'easeInOut' } });
  cam.cels.push({ id: uid('c'), start: 44, length: LENGTH - 44, drawingId: b.id });
  doc.layers.push(cam);
  return doc;
}
