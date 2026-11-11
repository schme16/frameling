import { newDoc, uid } from '../core/doc';
import type { CameraDrawing, CameraLayer, Doc } from '../core/format';
import { GRAPE, INK, MINT, PEACH, ROSE, SKY, SUNNY, addVectorLayer, ellipsePath, emptyOf, fill, pathShape, rectPath, smoothClosed, vectorDrawing, type XY } from './build';

const W = 800;
const H = 450;
const LENGTH = 72;

function hills(y: number, from: number, to: number, bump: number, step: number, seed: number): XY[] {
  const pts: XY[] = [[to, H + 200], [from, H + 200]];
  for (let x = from; x <= to; x += step) pts.push([x, y - Math.abs(Math.sin(x * 0.007 + seed)) * bump]);
  return pts;
}

/** A wide valley the camera pans across and then zooms into, with far hills drifting slower (parallax). */
export function makeCameraPan(): Doc {
  const doc = emptyOf(newDoc({ name: 'Camera and parallax', width: W, height: H, fps: 24, length: LENGTH, background: '#bfe6ff' }));

  const sky = addVectorLayer(doc, 'Far hills');
  sky.depth = 3;
  sky.cels.push({ id: uid('c'), start: 0, length: LENGTH, drawingId: vectorDrawing(doc, [fill([ellipsePath(160, 90, 46, 46)], SUNNY), fill([smoothClosed(hills(300, -600, 1500, 90, 60, 1))], '#9fc6e8')]).id });

  const mid = addVectorLayer(doc, 'Near hills');
  mid.depth = 1;
  mid.cels.push({ id: uid('c'), start: 0, length: LENGTH, drawingId: vectorDrawing(doc, [fill([smoothClosed(hills(360, -600, 2000, 60, 50, 3))], MINT)]).id });

  const ground = addVectorLayer(doc, 'Ground');
  const trees = [];
  for (let x = -300; x <= 1900; x += 220) {
    trees.push(pathShape([rectPath(x - 8, 330, 16, 70)], '#8b5a3c', null));
    trees.push(pathShape([ellipsePath(x, 315, 44, 50)], x % 440 === 0 ? '#4fa36b' : '#6abf4b', { color: INK, width: 4 }));
  }
  const house = [
    pathShape([rectPath(1180, 300, 150, 110)], PEACH, { color: INK, width: 5 }),
    pathShape([{ closed: true, points: [{ x: 1165, y: 302 }, { x: 1255, y: 230 }, { x: 1345, y: 302 }] }], ROSE, { color: INK, width: 5 }),
    pathShape([rectPath(1240, 350, 32, 60)], GRAPE, { color: INK, width: 4 }),
    pathShape([rectPath(1198, 325, 30, 26)], SKY, { color: INK, width: 4 }),
  ];
  ground.cels.push({ id: uid('c'), start: 0, length: LENGTH, drawingId: vectorDrawing(doc, [fill([rectPath(-800, 400, 3400, 300)], '#7ccf63'), ...trees, ...house]).id });

  // The camera: starts at the left, pans right, then zooms in on the house with a small tilt.
  const views = [
    { at: 0, view: { x: 300, y: 225, zoom: 1, rotation: 0 }, ease: 'easeInOut' as const },
    { at: 36, view: { x: 1100, y: 240, zoom: 1, rotation: 0 }, ease: 'easeInOut' as const },
    { at: 60, view: { x: 1255, y: 330, zoom: 2.4, rotation: -6 } },
  ];
  const cam: CameraLayer = { id: uid('l'), name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, onion: false, cels: [] };
  views.forEach((k, i) => {
    const d: CameraDrawing = { id: uid('k'), kind: 'camera', view: k.view };
    doc.drawings[d.id] = d;
    const end = views[i + 1]?.at ?? LENGTH;
    cam.cels.push({ id: uid('c'), start: k.at, length: end - k.at, drawingId: d.id, ...(k.ease ? { tween: { ease: k.ease } } : {}) });
  });
  doc.layers.push(cam);
  return doc;
}
