/**
 * The "kitchen sink": one document that uses every feature at once (symbols with tweens and a motion path, a symbol
 * with its own tilemap and an effect inside, blend modes, effects, a folder with a mask and a clipped layer, tiles with
 * an animated one, a skeleton with a rigid part and a bending part, and a sound). Not a template people see: tests and
 * scripts/e2e/export.cjs load it to check that saving, opening, undo and every export cope with all of it together.
 */
import { newDoc, newPixelDrawing, newTilemapDrawing, newTilemapLayer, uid } from '../core/doc';
import type { AudioClip, Doc, InstanceShape, LayerEffect, PixelDrawing, VectorLayer } from '../core/format';
import { defaultValues } from '../effects/model';
import { boneBetween, gridMesh, skinMesh } from '../rig/math';
import { addTile, ensureTileset, makeCell } from '../tiles/model';
import { addClip, addMarker, addPixelLayer, addVectorLayer, ellipsePath, emptyOf, GRAPE, hold, INK, MINT, pathShape, PEACH, rectPath, ROSE, SKY, stroke, SUNNY, vectorDrawing } from '../templates/build';

/** A short sine beep as a 16-bit mono WAV. */
export function beepWav(seconds = 1, hz = 440, rate = 8000): Uint8Array {
  const n = Math.round(seconds * rate);
  const b = new Uint8Array(44 + n * 2);
  const v = new DataView(b.buffer);
  const str = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((i / rate) * hz * Math.PI * 2) * 12000 * Math.min(1, (n - i) / 400)), true);
  return b;
}

const fx = (kind: LayerEffect['kind'], values: LayerEffect['values'], keys?: LayerEffect['keys']): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values }, ...(keys ? { keys } : {}) });

const solid = (d: PixelDrawing, rgba: [number, number, number, number], every = 1) => {
  for (let p = 0; p < d.width * d.height; p++) if (p % every === 0) d.pixels.set(rgba, p * 4);
};

export function kitchenSinkDoc(): Doc {
  const doc = emptyOf(newDoc({ name: 'Kitchen sink', width: 320, height: 192, fps: 12, length: 24, background: '#fffaf0' }));

  // ---- tiles: grass, and water that animates (two frames)
  ensureTileset(doc, 8, 8);
  const grass = addTile(doc, { name: 'Grass' });
  solid(doc.drawings[grass.frames[0].drawingId] as PixelDrawing, [80, 180, 60, 255]);
  const water = addTile(doc, { name: 'Water' });
  solid(doc.drawings[water.frames[0].drawingId] as PixelDrawing, [60, 120, 230, 255]);
  const w2 = newPixelDrawing(8, 8);
  solid(w2, [120, 170, 250, 255]);
  doc.drawings[w2.id] = w2;
  water.frames = [{ drawingId: water.frames[0].drawingId, duration: 2 }, { drawingId: w2.id, duration: 2 }];

  // ---- ground: a tilemap on the stage, with an outline effect
  const ground = newTilemapLayer('Ground tiles', 2);
  const map = newTilemapDrawing(20, 12);
  for (let x = 0; x < 20; x++) map.cells[11 * 20 + x] = makeCell(x % 5 === 2 ? water.key : grass.key);
  doc.drawings[map.id] = map;
  hold(ground, map.id, 0, 24);
  ground.effects = [fx('outline', { width: 1, color: INK })];
  doc.layers.push(ground);

  // ---- a folder with a mask, a clipped layer, a blend mode and effects
  doc.folders = { f1: { id: 'f1', name: 'Sky things', visible: true, opacity: 0.9, effects: [fx('shadow', { x: 4, y: 4, softness: 3, opacity: 0.4 })] } };
  const sun = addVectorLayer(doc, 'Sun');
  sun.folder = 'f1';
  sun.blend = 'screen';
  sun.effects = [fx('glow', { size: 8, strength: 1, color: SUNNY }, [{ frame: 0, values: { size: 4 } }, { frame: 23, values: { size: 14 } }])];
  hold(sun, vectorDrawing(doc, [pathShape([ellipsePath(260, 40, 22, 22)], SUNNY, null)]).id, 0, 24);
  const rays = addVectorLayer(doc, 'Rays (clipped)');
  rays.folder = 'f1';
  rays.clipToBelow = true;
  hold(rays, vectorDrawing(doc, [stroke([[230, 20], [290, 60]], PEACH, 8)]).id, 0, 24);
  const clouds = addPixelLayer(doc, 'Clouds', 4);
  clouds.folder = 'f1';
  clouds.blend = 'multiply';
  clouds.effects = [fx('blur', { radius: 2 })];
  const cd = newPixelDrawing(80, 48);
  for (let y = 4; y < 10; y++) for (let x = 10 + y; x < 40; x++) cd.pixels.set([200, 210, 240, 255], (y * 80 + x) * 4);
  doc.drawings[cd.id] = cd;
  hold(clouds, cd.id, 0, 24);
  const mask = addVectorLayer(doc, 'Window (mask)');
  mask.folder = 'f1';
  mask.mask = 'show';
  hold(mask, vectorDrawing(doc, [pathShape([rectPath(0, 0, 320, 120)], '#000000', null)]).id, 0, 24);

  // ---- a symbol with a little animation inside, its own tilemap layer and an effect (ignored inside symbols)
  const inner = (r: number) => vectorDrawing(doc, [pathShape([ellipsePath(0, 0, r, r)], ROSE, { color: INK, width: 2 })]);
  const ballLayer: VectorLayer = { id: uid('l'), name: 'Ball', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [], effects: [fx('blur', { radius: 3 })] };
  hold(ballLayer, inner(12).id, 0, 2);
  hold(ballLayer, inner(14).id, 2, 2);
  const innerTiles = newTilemapLayer('Ball tiles', 1);
  const im = newTilemapDrawing(2, 1);
  im.cells[0] = makeCell(water.key);
  im.cells[1] = makeCell(grass.key);
  doc.drawings[im.id] = im;
  hold(innerTiles, im.id, 0, 4);
  doc.symbols = { ball: { id: 'ball', name: 'Ball', layers: [innerTiles, ballLayer], length: 4, origin: { x: 0, y: 0 } } };
  const inst = (x: number, y: number, rot: number, extra: Partial<InstanceShape> = {}): InstanceShape => ({
    id: 'ball-1',
    type: 'instance',
    symbolId: 'ball',
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: rot, skew: 0 },
    opacity: 1,
    play: 'loop',
    firstFrame: 0,
    ...extra,
  });
  const balls = addVectorLayer(doc, 'Bouncing ball');
  const k0 = vectorDrawing(doc, []);
  k0.shapes.push(inst(40, 140, 0));
  const k1 = vectorDrawing(doc, []);
  k1.shapes.push(inst(280, 140, 90, { opacity: 0.6, tint: { color: SKY, amount: 0.4 } }));
  balls.cels.push({ id: uid('c'), start: 0, length: 12, drawingId: k0.id, tween: { ease: 'easeInOut', spin: 1, path: { orient: false, points: [{ x: 40, y: 140 }, { x: 160, y: 40, c1: { x: 60, y: 40 }, c2: { x: 120, y: 30 } }, { x: 280, y: 140 }] } } });
  balls.cels.push({ id: uid('c'), start: 12, length: 12, drawingId: k1.id });

  // ---- a skeleton: an arm (two bones) with a rigid hand and a bending sleeve
  const upper = boneBetween(uid('b'), 'Upper arm', { x: 120, y: 80 }, { x: 160, y: 80 }, null);
  const lower = boneBetween(uid('b'), 'Lower arm', { x: 160, y: 80 }, { x: 200, y: 80 }, upper.id);
  const bones = addVectorLayer(doc, 'Bones');
  bones.rig = { bones: [upper, lower], poses: [{ id: uid('o'), name: 'Bent', pose: { [lower.id]: { r: -50 } } }] };
  bones.onion = false;
  const p0 = vectorDrawing(doc, []);
  p0.pose = {};
  const p1 = vectorDrawing(doc, []);
  p1.pose = { [upper.id]: { r: 20 }, [lower.id]: { r: -60 } };
  bones.cels.push({ id: uid('c'), start: 0, length: 12, drawingId: p0.id, tween: { ease: 'linear' } });
  bones.cels.push({ id: uid('c'), start: 12, length: 12, drawingId: p1.id });
  const sleeve = addVectorLayer(doc, 'Sleeve (bends)');
  hold(sleeve, vectorDrawing(doc, [pathShape([rectPath(116, 72, 88, 16)], GRAPE, { color: INK, width: 2 })]).id, 0, 24);
  const rig = bones.rig;
  sleeve.bind = { rig: bones.id, bone: upper.id, mesh: skinMesh(rig, gridMesh({ x: 112, y: 68, w: 96, h: 24 }, 8)) };
  sleeve.effects = [fx('shadow', { x: 0, y: 3, softness: 2, opacity: 0.35 })];
  sleeve.blend = 'multiply';
  const hand = addVectorLayer(doc, 'Hand (follows)');
  hold(hand, vectorDrawing(doc, [pathShape([ellipsePath(206, 80, 8, 8)], MINT, { color: INK, width: 2 })]).id, 0, 24);
  hand.bind = { rig: bones.id, bone: lower.id };
  hand.effects = [fx('adjust', { brightness: 110, saturation: 120 })];
  // Bones layers sit on top, like the app puts them.
  doc.layers.splice(doc.layers.indexOf(bones), 1);
  doc.layers.push(bones);

  // ---- a sound from the start
  const beep: AudioClip = { id: uid('a'), name: 'Beep', start: 0, data: beepWav(1), mime: 'audio/wav', duration: 1 };
  doc.audio = [beep];

  addClip(doc, 'whole', 0, 23);
  addMarker(doc, 'top', 6);
  return doc;
}

/**
 * The kitchen sink stretched for timing playback (scripts/perf, test `rigfx`): `frames` long at 24 fps, the arm and
 * the ball moving all the time, ten layers with effects on several and a bending layer.
 */
export function kitchenSinkPerfDoc(frames = 300): Doc {
  const doc = kitchenSinkDoc();
  doc.fps = 24;
  doc.length = frames;
  doc.clips = [];
  doc.markers = [];
  for (const l of doc.layers) {
    if (l.cels.length === 1) l.cels[0].length = frames;
  }
  // Keys every 12 frames, back and forth, gliding between.
  const bones = doc.layers.find((l) => l.kind === 'vector' && l.rig)!;
  const balls = doc.layers.find((l) => l.name === 'Bouncing ball')!;
  for (const l of [bones, balls]) {
    const [a, b] = l.cels;
    l.cels = [];
    for (let f = 0, i = 0; f < frames; f += 12, i++) {
      const src = i % 2 ? b : a;
      l.cels.push({ ...src, id: uid('c'), start: f, length: Math.min(12, frames - f), ...(f + 12 < frames ? { tween: a.tween } : { tween: undefined }) });
    }
  }
  const glowPx = addPixelLayer(doc, 'Sparkles', 4);
  const g = newPixelDrawing(80, 48);
  for (let k = 0; k < 40; k++) g.pixels.set([255, 220, 120, 255], ((k * 7) % 48) * 80 * 4 + ((k * 13) % 80) * 4);
  doc.drawings[g.id] = g;
  hold(glowPx, g.id, 0, frames);
  glowPx.effects = [fx('glow', { size: 6, color: SUNNY })];
  // Under the bones layer, which stays on top.
  const top = doc.layers.pop()!;
  doc.layers.splice(doc.layers.length - 1, 0, top);
  return doc;
}
