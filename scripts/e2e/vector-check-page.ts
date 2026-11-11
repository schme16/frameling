// The page side of vector-check.cjs: builds test documents, renders frames with Frameling's own renderer, with
// lottie-web from the Lottie export, and lays the animated SVG out so the driver can capture it at any frame.
// Bundled by esbuild into one script (see vector-check.cjs).
import { makePuppet } from '../../src/templates/puppet';
import lottie from 'lottie-web/build/player/lottie_canvas';
import lottieSvg from 'lottie-web/build/player/lottie_svg';
import type { Doc, InstanceShape, LayerEffect } from '../../src/core/format';
import { newTextShape, newAnimator } from '../../src/text/model';
import { newParticles } from '../../src/particles/model';
import { defaultValues } from '../../src/effects/model';
import { makeSymbol } from '../../src/core/symbols';
import { newDoc, newPixelDrawing, uid } from '../../src/core/doc';
import { renderFrame } from '../../src/core/render';
import { newCameraLayer, setCameraKey } from '../../src/core/camera';
import { docToLottie } from '../../src/export/lottie';
import { animatedSvg } from '../../src/export/svg-anim';
import { makeBouncingLogo } from '../../src/templates/bouncing-logo';
import { makeBouncingBall } from '../../src/templates/bouncing-ball';
import { makeMorph } from '../../src/templates/morph';
import { makeCameraPan } from '../../src/templates/camera-pan';
import { addPixelLayer, addVectorLayer, ellipsePath, fill, hold, pathShape, rectPath, vectorDrawing } from '../../src/templates/build';

function shapeTweenDoc(): Doc {
  const doc = newDoc({ name: 'Morph', width: 400, height: 300, length: 24, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Morph');
  const a = vectorDrawing(doc, [fill([rectPath(40, 60, 140, 140)], '#ff6f91')]);
  const b = vectorDrawing(doc, [pathShape([ellipsePath(280, 150, 80, 80)], '#5ab8ff', { color: '#1d1b26', width: 6 })]);
  hold(l, a.id, 0, 16);
  hold(l, b.id, 16, 8);
  l.cels[0].tween = { kind: 'shape', ease: 'easeInOut', hints: [{ id: 'h1', from: { x: 40, y: 60 }, to: { x: 280, y: 70 } }, { id: 'h2', from: { x: 180, y: 200 }, to: { x: 280, y: 230 } }] };
  return doc;
}

function cameraDoc(): Doc {
  const doc = newDoc({ name: 'Camera', width: 400, height: 300, length: 24, fps: 12 });
  doc.layers = [];
  const back = addVectorLayer(doc, 'Hills');
  back.depth = 1;
  hold(back, vectorDrawing(doc, [fill([ellipsePath(100, 300, 160, 90)], '#6abf4b'), fill([ellipsePath(330, 290, 140, 80)], '#4fd1a5')]).id, 0, 24);
  const front = addVectorLayer(doc, 'House');
  hold(front, vectorDrawing(doc, [fill([rectPath(170, 150, 80, 70)], '#ff9e6d'), pathShape([rectPath(190, 180, 20, 40)], '#9b7bff', { color: '#1d1b26', width: 3 })]).id, 0, 24);
  const { layer, drawing } = newCameraLayer(doc);
  doc.drawings[drawing.id] = drawing;
  doc.layers.push(layer);
  layer.cels[0].tween = { ease: 'easeOut' };
  setCameraKey(doc, layer, 16, { x: 230, y: 170, zoom: 2, rotation: 10 });
  return doc;
}

/** A symbol copy that slants, follows a curved path while turning along it, then springs, then a custom curve. */
function tweenExtrasDoc(): Doc {
  const doc = newDoc({ name: 'Extras', width: 400, height: 300, length: 30, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Mover');
  const k1 = vectorDrawing(doc, [fill([rectPath(20, 20, 40, 24)], '#9b7bff'), pathShape([ellipsePath(40, 32, 8, 8)], '#ffc94a', null)]);
  makeSymbol(doc, k1.id, k1.shapes.map((s) => s.id), { x: 40, y: 32 }, 'Box');
  const at = (x: number, y: number, more: Partial<InstanceShape['transform']> = {}, opacity = 1) => {
    const d = vectorDrawing(doc, []);
    const inst = { ...(k1.shapes[0] as InstanceShape), id: uid('s'), transform: { ...(k1.shapes[0] as InstanceShape).transform, x, y, ...more }, opacity };
    d.shapes = [inst];
    return d.id;
  };
  hold(l, at(60, 240, { skew: 20 }), 0, 10);
  hold(l, at(340, 240, { skew: -10, scaleX: 1.5 }), 10, 10);
  hold(l, at(200, 80, { rotation: 30 }, 0.4), 20, 6);
  hold(l, at(300, 150), 26, 4);
  l.cels[0].tween = { ease: 'easeOut', path: { orient: true, points: [{ x: 60, y: 240 }, { x: 200, y: 40, c1: { x: 80, y: 60 }, c2: { x: 160, y: 40 } }, { x: 340, y: 240, c1: { x: 260, y: 40 }, c2: { x: 330, y: 120 } }] } };
  l.cels[1].tween = { ease: 'elasticOut' };
  l.cels[2].tween = { ease: [0.2, 0.9, 0.3, 1.2] };
  return doc;
}

function pixelDoc(): Doc {
  const doc = newDoc({ name: 'Pixels', width: 256, height: 256, length: 6, fps: 8 });
  doc.layers = [];
  const l = addPixelLayer(doc, 'Art', 8);
  for (let k = 0; k < 3; k++) {
    const d = newPixelDrawing(32, 32);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const on = (x - 16 + k * 3) ** 2 + (y - 16) ** 2 < 64;
        if (on) d.pixels.set([255, 111 + k * 40, 145, 255], (y * 32 + x) * 4);
      }
    d.id = uid('p');
    doc.drawings[d.id] = d;
    hold(l, d.id, k * 2, 2);
  }
  return doc;
}

// ---------------------------------------------------------------- compositing and the second-part shapes

const sq = (x: number, y: number, s: number, c: string) => fill([rectPath(x, y, s, s)], c);

function textDoc(): Doc {
  const doc = newDoc({ name: 'Text', width: 400, height: 300, length: 24, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Words');
  const still = newTextShape(uid('s'), { x: 30, y: 70 }, { text: 'Hello there', size: 40, color: '#ff6f91' });
  const spaced = newTextShape(uid('s'), { x: 30, y: 140 }, { text: 'Spaced out', size: 28, letterSpacing: 6, color: '#5ab8ff', transform: { x: 30, y: 140, scaleX: 1.2, scaleY: 1, rotation: -8, skew: 0 } });
  const moving = newTextShape(uid('s'), { x: 40, y: 230 }, { text: 'Wave hi!', size: 36, color: '#9b7bff', animators: [{ ...newAnimator('wave', 'a1'), amount: 14 }, { ...newAnimator('fade', 'a2'), start: 0, duration: 6, stagger: 1 }] });
  const d = vectorDrawing(doc, []);
  d.shapes = [still, spaced, moving];
  hold(l, d.id, 0, 24);
  return doc;
}

function particlesDoc(): Doc {
  const doc = newDoc({ name: 'Particles', width: 400, height: 300, length: 24, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Sparks');
  const star = { ...newParticles(uid('s'), 'sparkle', { x: 120, y: 120 }), burst: 24 };
  const conf = { ...newParticles(uid('s'), 'confetti', { x: 280, y: 200 }), burst: 30 };
  const smoke = { ...newParticles(uid('s'), 'smoke', { x: 200, y: 280 }), rate: 6 };
  const d = vectorDrawing(doc, []);
  d.shapes = [smoke, star, conf];
  hold(l, d.id, 0, 24);
  return doc;
}

function symbolParticlesDoc(): Doc {
  const doc = newDoc({ name: 'Symbol particles', width: 400, height: 300, length: 18, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Hearts');
  const k = vectorDrawing(doc, [fill([ellipsePath(20, 20, 10, 10)], '#ff6f91'), fill([rectPath(15, 15, 10, 10)], '#ffc94a')]);
  const sym = makeSymbol(doc, k.id, k.shapes.map((s) => s.id), { x: 20, y: 20 }, 'Blob');
  const p = { ...newParticles(uid('s'), 'sparkle', { x: 200, y: 150 }), burst: 16, sprite: 'symbol' as const, symbolId: sym!.symbolId };
  const d = vectorDrawing(doc, []);
  d.shapes = [p];
  hold(l, d.id, 0, 18);
  return doc;
}

function tintDoc(): Doc {
  const doc = newDoc({ name: 'Tint', width: 400, height: 300, length: 12, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Copies');
  const k = vectorDrawing(doc, [fill([ellipsePath(80, 150, 50, 50)], '#ffc94a'), pathShape([rectPath(60, 130, 40, 40)], '#5ab8ff', { color: '#1d1b26', width: 4 }, 0.6)]);
  makeSymbol(doc, k.id, k.shapes.map((s) => s.id), { x: 80, y: 150 }, 'Coin');
  const inst = k.shapes[0] as InstanceShape;
  const a = { ...inst, id: uid('s'), transform: { ...inst.transform, x: 200 }, tint: { color: '#ff0000', amount: 0.6 } };
  const b = { ...inst, id: uid('s'), transform: { ...inst.transform, x: 320 }, tint: { color: '#00aa55', amount: 1 }, opacity: 0.7 };
  k.shapes.push(a, b);
  hold(l, k.id, 0, 12);
  return doc;
}

function blendDoc(): Doc {
  const doc = newDoc({ name: 'Blend', width: 400, height: 300, length: 6, fps: 12 });
  doc.layers = [];
  const back = addVectorLayer(doc, 'Back');
  hold(back, vectorDrawing(doc, [fill([rectPath(0, 0, 200, 300)], '#5ab8ff'), fill([rectPath(200, 0, 200, 300)], '#ffc94a')]).id, 0, 6);
  const modes = ['multiply', 'screen', 'overlay', 'difference'] as const;
  modes.forEach((m, i) => {
    const l = addVectorLayer(doc, m);
    l.blend = m;
    hold(l, vectorDrawing(doc, [sq(20 + i * 95, 60, 80, '#ff6f91'), sq(40 + i * 95, 160, 60, '#9b7bff')]).id, 0, 6);
  });
  const half = addVectorLayer(doc, 'Half');
  half.opacity = 0.5;
  hold(half, vectorDrawing(doc, [sq(150, 230, 50, '#1d1b26'), sq(175, 250, 50, '#1d1b26')]).id, 0, 6);
  return doc;
}

function maskDoc(): Doc {
  const doc = newDoc({ name: 'Masks', width: 400, height: 300, length: 12, fps: 12 });
  doc.layers = [];
  const a = addVectorLayer(doc, 'Stripes');
  hold(a, vectorDrawing(doc, [0, 1, 2, 3, 4].map((i) => fill([rectPath(0, i * 60, 400, 30)], '#ff6f91'))).id, 0, 12);
  const b = addVectorLayer(doc, 'Dot');
  const d0 = vectorDrawing(doc, [fill([ellipsePath(120, 150, 60, 60)], '#5ab8ff')]);
  const d1 = vectorDrawing(doc, [fill([ellipsePath(160, 150, 60, 60)], '#5ab8ff')]);
  hold(b, d0.id, 0, 6);
  hold(b, d1.id, 6, 6);
  const m = addVectorLayer(doc, 'Window');
  m.mask = 'show';
  hold(m, vectorDrawing(doc, [fill([ellipsePath(150, 150, 110, 90)], '#000000')]).id, 0, 12);
  // A folder with a hiding mask inside and a clipped layer.
  doc.folders = { f1: { id: 'f1', name: 'Box', visible: true, opacity: 1 } };
  const c = addVectorLayer(doc, 'Box');
  c.folder = 'f1';
  hold(c, vectorDrawing(doc, [sq(260, 60, 120, '#4fd1a5')]).id, 0, 12);
  const clip = addVectorLayer(doc, 'Shine');
  clip.folder = 'f1';
  clip.clipToBelow = true;
  hold(clip, vectorDrawing(doc, [fill([rectPath(240, 40, 60, 220)], '#ffc94a')]).id, 0, 12);
  const hole = addVectorLayer(doc, 'Hole');
  hole.folder = 'f1';
  hole.mask = 'hide';
  hold(hole, vectorDrawing(doc, [fill([ellipsePath(320, 120, 25, 25)], '#000000')]).id, 0, 12);
  return doc;
}

function effectsDoc(): Doc {
  const doc = newDoc({ name: 'Effects', width: 400, height: 300, length: 12, fps: 12 });
  doc.layers = [];
  const fx = (kind: LayerEffect['kind'], values: Record<string, number | string>): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });
  const soft = addVectorLayer(doc, 'Soft');
  soft.effects = [fx('blur', { radius: 5 })];
  hold(soft, vectorDrawing(doc, [sq(30, 40, 80, '#ff6f91')]).id, 0, 12);
  const shadow = addVectorLayer(doc, 'Shadow');
  shadow.effects = [fx('shadow', { x: 8, y: 6, softness: 6, opacity: 0.6 })];
  hold(shadow, vectorDrawing(doc, [sq(160, 40, 80, '#5ab8ff')]).id, 0, 12);
  const glow = addVectorLayer(doc, 'Glow');
  glow.effects = [fx('glow', { size: 14 })];
  const g0 = vectorDrawing(doc, [fill([ellipsePath(330, 80, 35, 35)], '#9b7bff')]);
  const g1 = vectorDrawing(doc, [fill([ellipsePath(330, 120, 35, 35)], '#9b7bff')]);
  hold(glow, g0.id, 0, 6);
  hold(glow, g1.id, 6, 6);
  doc.folders = { f1: { id: 'f1', name: 'Group', visible: true, opacity: 0.7, effects: [fx('adjust', { hue: 90 })] } };
  const inA = addVectorLayer(doc, 'In A');
  inA.folder = 'f1';
  hold(inA, vectorDrawing(doc, [sq(60, 180, 90, '#ffc94a')]).id, 0, 12);
  const inB = addVectorLayer(doc, 'In B');
  inB.folder = 'f1';
  hold(inB, vectorDrawing(doc, [sq(100, 210, 90, '#ff6f91')]).id, 0, 12);
  const out = addVectorLayer(doc, 'Outline');
  out.effects = [fx('outline', { width: 4 })];
  hold(out, vectorDrawing(doc, [sq(280, 200, 70, '#4fd1a5')]).id, 0, 12);
  return doc;
}

/** A symbol with looks on its own layers (shadow, multiply, clipping, a hiding mask, blur), placed three ways. */
function symbolLooksDoc(): Doc {
  const doc = newDoc({ name: 'Symbol looks', width: 400, height: 300, length: 24, fps: 12 });
  doc.layers = [];
  const fx = (kind: LayerEffect['kind'], values: Record<string, number | string>): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });
  const back = addVectorLayer(doc, 'Back');
  hold(back, vectorDrawing(doc, [fill([rectPath(0, 0, 400, 150)], '#ffc94a'), fill([rectPath(0, 150, 400, 150)], '#4fd1a5')]).id, 0, 24);
  const stage = doc.layers;
  doc.layers = [];
  const disc = addVectorLayer(doc, 'Disc');
  disc.effects = [fx('shadow', { x: 6, y: 6, softness: 4, opacity: 0.6 })];
  hold(disc, vectorDrawing(doc, [fill([ellipsePath(0, 0, 40, 40)], '#5ab8ff')]).id, 0, 24);
  const ink = addVectorLayer(doc, 'Ink');
  ink.blend = 'multiply';
  hold(ink, vectorDrawing(doc, [sq(-22, -22, 44, '#ff6f91')]).id, 0, 24);
  const shine = addVectorLayer(doc, 'Shine');
  shine.clipToBelow = true;
  hold(shine, vectorDrawing(doc, [fill([rectPath(-40, -40, 30, 80)], '#ffffff')]).id, 0, 24);
  const hole = addVectorLayer(doc, 'Hole');
  hole.mask = 'hide';
  hold(hole, vectorDrawing(doc, [fill([ellipsePath(18, -18, 9, 9)], '#000000')]).id, 0, 24);
  const dot = addVectorLayer(doc, 'Dot');
  dot.effects = [fx('blur', { radius: 3 })];
  hold(dot, vectorDrawing(doc, [fill([ellipsePath(0, 28, 7, 7)], '#1d1b26')]).id, 0, 24);
  doc.symbols = { badge: { id: 'badge', name: 'Badge', layers: doc.layers, length: 1, origin: { x: 0, y: 0 } } };
  doc.layers = stage;
  const inst = (x: number, y: number, more: Partial<InstanceShape> = {}, t: Partial<InstanceShape['transform']> = {}): InstanceShape => ({ id: 'b1', type: 'instance', symbolId: 'badge', transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0, ...t }, opacity: 1, play: 'loop', firstFrame: 0, ...more });
  const mover = addVectorLayer(doc, 'Mover');
  const k0 = vectorDrawing(doc, []);
  k0.shapes = [inst(90, 200)];
  const k1 = vectorDrawing(doc, []);
  k1.shapes = [inst(310, 200, {}, { rotation: 90 })];
  hold(mover, k0.id, 0, 16);
  hold(mover, k1.id, 16, 8);
  mover.cels[0].tween = { ease: 'linear' };
  const still = addVectorLayer(doc, 'Still');
  hold(still, vectorDrawing(doc, [{ ...inst(120, 75, { opacity: 0.8 }, { scaleX: 1.4, scaleY: 1.4 }), id: 'b2' }, { ...inst(290, 75, { tint: { color: '#9b7bff', amount: 0.5 } }, { scaleX: 0.8, scaleY: 0.8, skew: 10 }), id: 'b3' }]).id, 0, 24);
  return doc;
}

const DOCS: Record<string, () => Doc> = {
  text: textDoc,
  particles: particlesDoc,
  'symbol-particles': symbolParticlesDoc,
  tint: tintDoc,
  blend: blendDoc,
  masks: maskDoc,
  effects: effectsDoc,
  'symbol-looks': symbolLooksDoc,
  'bouncing-logo': makeBouncingLogo,
  'shape-tween': shapeTweenDoc,
  camera: cameraDoc,
  'frame-by-frame': makeBouncingBall,
  pixel: pixelDoc,
  'tween-extras': tweenExtrasDoc,
  'morph-template': makeMorph,
  'camera-pan-template': makeCameraPan,
  'puppet-template': makePuppet,
};

let doc: Doc;
let anim: ReturnType<typeof lottie.loadAnimation> | null = null;
let animSvg: ReturnType<typeof lottieSvg.loadAnimation> | null = null;
const holder = document.getElementById('lottie')!;
const svgHolder = document.getElementById('svg')!;
const lsvgHolder = document.getElementById('lsvg')!;

function pixelsOf(c: HTMLCanvasElement): Uint8ClampedArray {
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
}

function frameling(frame: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = doc.width;
  c.height = doc.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  renderFrame(g, doc, frame, { layerFilter: (l) => !l.reference });
  return pixelsOf(c);
}

export function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, tol = 48): { mean: number; off: number } {
  let sum = 0;
  let off = 0;
  for (let i = 0; i < a.length; i += 4) {
    let m = 0;
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a[i + k] - b[i + k]);
      sum += d;
      m = Math.max(m, d);
    }
    if (m > tol) off++;
  }
  return { mean: sum / ((a.length / 4) * 3), off: (off / (a.length / 4)) * 100 };
}

const api = {
  names: () => Object.keys(DOCS),
  async load(name: string) {
    doc = DOCS[name]();
    anim?.destroy();
    holder.innerHTML = '';
    const data = docToLottie(doc);
    const canvas = document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    holder.appendChild(canvas);
    anim = lottie.loadAnimation({ renderer: 'canvas', loop: false, autoplay: false, animationData: data, rendererSettings: { context: canvas.getContext('2d')!, clearCanvas: true, preserveAspectRatio: 'none' } as never });
    (window as any).__anim = anim;
    await new Promise<void>((r) => (anim!.isLoaded ? r() : anim!.addEventListener('DOMLoaded', () => r())));
    // Images (pixel layers) load on their own time.
    await new Promise((r) => setTimeout(r, 300));
    animSvg?.destroy();
    lsvgHolder.innerHTML = '';
    lsvgHolder.style.width = doc.width + 'px';
    lsvgHolder.style.height = doc.height + 'px';
    animSvg = lottieSvg.loadAnimation({ container: lsvgHolder, renderer: 'svg', loop: false, autoplay: false, animationData: docToLottie(doc), rendererSettings: { preserveAspectRatio: 'none' } as never });
    await new Promise<void>((r) => (animSvg!.isLoaded ? r() : animSvg!.addEventListener('DOMLoaded', () => r())));
    await new Promise((r) => setTimeout(r, 300));
    svgHolder.innerHTML = animatedSvg(doc);
    return { length: doc.length, width: doc.width, height: doc.height, lottieBytes: JSON.stringify(data).length, svgBytes: svgHolder.innerHTML.length };
  },
  lottieAt(frame: number) {
    try {
      anim!.goToAndStop(frame, true);
    } catch (e) {
      console.error('lottie error ' + (e as Error).stack);
    }
    const c = holder.querySelector('canvas')!;
    // lottie-web leaves the stage colour to the solid layer it was given, so compare straight.
    return compare(frameling(frame), pixelsOf(c));
  },
  /** Both pictures as PNG data URLs, to look at when a frame is off. */
  lottiePictures(frame: number) {
    anim!.goToAndStop(frame, true);
    const c = holder.querySelector('canvas')!;
    const f = document.createElement('canvas');
    f.width = doc.width;
    f.height = doc.height;
    f.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frameling(frame)), doc.width, doc.height), 0, 0);
    return { lottie: c.toDataURL(), frameling: f.toDataURL() };
  },
  /** Lottie's SVG renderer (it plays effects, which the canvas renderer ignores), shown in place of the SVG. */
  lsvgSeek(frame: number) {
    svgHolder.style.visibility = 'hidden';
    lsvgHolder.style.visibility = 'visible';
    animSvg!.goToAndStop(frame, true);
    const r = lsvgHolder.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  },
  svgSeek(frame: number) {
    svgHolder.style.visibility = 'visible';
    lsvgHolder.style.visibility = 'hidden';
    // SMIL (animated effect settings) is moved too.
    const root = svgHolder.querySelector('svg') as SVGSVGElement | null;
    if (root?.pauseAnimations) {
      root.pauseAnimations();
      root.setCurrentTime(frame / doc.fps + 0.0005);
    }
    // Half a millisecond past the frame's start, so step-end switches have happened.
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = (frame / doc.fps) * 1000 + 0.5;
    }
    const r = svgHolder.querySelector('svg')!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  },
  svgCompare(frame: number, rgba: number[]) {
    return compare(frameling(frame), new Uint8ClampedArray(rgba));
  },
};
(window as unknown as { check: typeof api }).check = api;
