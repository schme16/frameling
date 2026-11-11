// The page side of vector-check.cjs: builds test documents, renders frames with Frameling's own renderer, with
// lottie-web from the Lottie export, and lays the animated SVG out so the driver can capture it at any frame.
// Bundled by esbuild into one script (see vector-check.cjs).
import { makePuppet } from '../../src/templates/puppet';
import lottie from 'lottie-web/build/player/lottie_canvas';
import type { Doc, InstanceShape } from '../../src/core/format';
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

const DOCS: Record<string, () => Doc> = {
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
const holder = document.getElementById('lottie')!;
const svgHolder = document.getElementById('svg')!;

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
  svgSeek(frame: number) {
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
