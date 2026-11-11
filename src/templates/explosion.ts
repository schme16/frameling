import { newDoc, uid } from '../core/doc';
import type { Doc, LayerEffect, ParticlesShape } from '../core/format';
import { newParticles } from '../particles/model';
import { addClip, addMarker, addVectorLayer, emptyOf, fill, hold, smoothClosed, swatchesFrom, vectorDrawing, type XY } from './build';

const SIZE = 512;
const C: XY = [256, 300];
const LENGTH = 36;

/** A lumpy round blob: the radius wobbles with a few sine waves, so every puff looks hand drawn. */
function lumpy(cx: number, cy: number, r: number, seed: number, bumps = 9, wobble = 0.16): XY[] {
  const pts: XY[] = [];
  const n = bumps * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (i % 2 ? -wobble : wobble) + Math.sin(a * 3 + seed) * wobble * 0.5;
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * 0.92]);
  }
  return pts;
}

/** A spiky flash, like a cartoon "bang". */
function spikes(cx: number, cy: number, r1: number, r2: number, n: number, turn: number): XY[] {
  const pts: XY[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = turn + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1 * (0.8 + 0.2 * Math.abs(Math.sin(i * 1.7)));
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// The fireball, drawn frame by frame on twos: it swells, burns out from the middle and turns to smoke.
const BALL = [
  { r: 40, rise: 0, outer: '#fff3b0', mid: '#ffffff', core: 0.6 },
  { r: 78, rise: 6, outer: '#ffc94a', mid: '#fff3b0', core: 0.62 },
  { r: 104, rise: 14, outer: '#ff9e3d', mid: '#ffd76a', core: 0.58 },
  { r: 116, rise: 26, outer: '#ff6f3d', mid: '#ffb347', core: 0.5 },
  { r: 118, rise: 40, outer: '#d9483b', mid: '#ff8a3d', core: 0.38 },
  { r: 112, rise: 56, outer: '#7a5a5a', mid: '#c4553b', core: 0.26 },
  { r: 100, rise: 72, outer: '#6a6470', mid: '#8a7070', core: 0.14 },
  { r: 84, rise: 88, outer: '#7c7884', mid: '#7c7884', core: 0 },
];

function glow(color: string, size: number, strength: number): LayerEffect {
  return { id: uid('e'), kind: 'glow', values: { color, size, strength } };
}

/**
 * An explosion for games and titles: a frame-by-frame flash and fireball (on twos) with particle sparks and smoke on
 * their own layers. Transparent background, plays once.
 */
export function makeExplosion(): Doc {
  const doc = emptyOf(newDoc({ name: 'Explosion and smoke', width: SIZE, height: SIZE, fps: 24, length: LENGTH, background: null }));
  swatchesFrom(doc, [['Flash', '#fff3b0'], ['Fire', '#ffc94a'], ['Flame', '#ff6f3d'], ['Ember', '#d9483b'], ['Smoke', '#7c7884']]);

  // Smoke rises from where the fireball was, after the bang.
  const smoke = addVectorLayer(doc, 'Smoke');
  const puff: ParticlesShape = {
    ...newParticles(uid('pt'), 'smoke', { x: C[0], y: C[1] - 40 }, undefined, 7),
    emitter: 'area',
    width: 120,
    height: 60,
    rate: 44,
    emitFor: 0.8,
    life: 1.6,
    speed: 70,
    sizeStart: 70,
    sizeEnd: 170,
    colorStart: '#6a6470',
    colorEnd: '#c9c6d0',
    opacityStart: 0.9,
  };
  delete puff.prewarm;
  hold(smoke, vectorDrawing(doc, [puff as never]).id, 6, LENGTH - 6);

  const ball = addVectorLayer(doc, 'Fireball');
  ball.effects = [glow('#ff9e3d', 18, 1)];
  BALL.forEach((b, i) => {
    const cy = C[1] - b.rise;
    const shapes = [fill([smoothClosed(lumpy(C[0], cy, b.r, i * 1.3))], b.outer)];
    if (b.core > 0) shapes.push(fill([smoothClosed(lumpy(C[0], cy + b.r * 0.1, b.r * b.core, i * 2.1 + 1, 7, 0.12))], b.mid));
    hold(ball, vectorDrawing(doc, shapes).id, i * 2, 2);
  });

  // A bright bang for the first few frames, added on top so it lights up the fire under it.
  const flash = addVectorLayer(doc, 'Flash');
  flash.blend = 'add';
  [
    { r1: 150, r2: 60, a: 0 },
    { r1: 210, r2: 80, a: 0.3 },
    { r1: 120, r2: 70, a: 0.15 },
  ].forEach((f, i) => hold(flash, vectorDrawing(doc, [fill([{ closed: true, points: spikes(C[0], C[1], f.r1, f.r2, 9, f.a).map(([x, y]) => ({ x, y })) }], i === 2 ? '#ffc94a' : '#fff3b0', i === 2 ? 0.6 : 1)]).id, i * 2, 2));

  // Sparks and bits fly out in every direction and fall.
  const sparks = addVectorLayer(doc, 'Sparks');
  const burst: ParticlesShape = {
    ...newParticles(uid('pt'), 'sparkle', { x: C[0], y: C[1] }, undefined, 11),
    burst: 48,
    life: 1.1,
    speed: 420,
    drag: 1.6,
    gravity: 380,
    sizeStart: 14,
    sizeEnd: 3,
    colorStart: '#fff3b0',
    colorEnd: '#ff6f3d',
    sprite: 'streak',
    spin: 0,
  };
  hold(sparks, vectorDrawing(doc, [burst as never]).id, 1, LENGTH - 1);

  addClip(doc, 'explode', 0, LENGTH - 1, false);
  addMarker(doc, 'boom', 0);
  return doc;
}
