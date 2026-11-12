// The page side of shadow-clip.cjs: small documents with a Shadow on a layer only as big as its drawing (so the shadow
// lies outside the layer's own box), drawn by the editor, by lottie-web's SVG and canvas players and by the dotLottie
// web player (ThorVG) from the Lottie export. Frames come back as PNG data URLs over white, with the darkness of each.
import lottieSvg from 'lottie-web/build/player/lottie_svg';
import lottieCanvas from 'lottie-web/build/player/lottie_canvas';
import type { Doc, InstanceShape, LayerEffect } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { defaultValues } from '../../src/effects/model';
import { renderFrameToCanvas } from '../../src/core/render';
import { docToLottie } from '../../src/export/lottie';
import { newCameraLayer, setCameraKey } from '../../src/core/camera';
import { addPixelLayer, addVectorLayer, ellipsePath, fill, hold, pixelDrawing, rectPath, vectorDrawing } from '../../src/templates/build';

const W = 300;
const H = 200;
const fx = (kind: LayerEffect['kind'], values: Record<string, number | string>): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });
const SHADOW = { color: '#000000', opacity: 0.8, x: 34, y: 24, softness: 5 };

const fresh = (name: string, length = 8): Doc => {
  const doc = newDoc({ name, width: W, height: H, length, fps: 12 });
  doc.layers = [];
  return doc;
};

const DOCS: Record<string, () => Doc> = {
  /** A box with a shadow thrown well past its own edge. */
  box() {
    const doc = fresh('Box');
    const l = addVectorLayer(doc, 'Box');
    l.effects = [fx('shadow', SHADOW)];
    hold(l, vectorDrawing(doc, [fill([rectPath(40, 40, 60, 44)], '#5ab8ff')]).id, 0, 8);
    return doc;
  },
  /** A dot smaller than its own shadow's offset: nothing of the shadow lies inside the drawing's box. */
  dot() {
    const doc = fresh('Dot');
    const l = addVectorLayer(doc, 'Dot');
    l.effects = [fx('shadow', { ...SHADOW, x: 50, y: 30 })];
    hold(l, vectorDrawing(doc, [fill([ellipsePath(60, 50, 9, 9)], '#ff6f91')]).id, 0, 8);
    return doc;
  },
  /** Two held drawings at different places (a Lottie layer each). */
  cels() {
    const doc = fresh('Cels');
    const l = addVectorLayer(doc, 'Hop');
    l.effects = [fx('shadow', SHADOW)];
    hold(l, vectorDrawing(doc, [fill([rectPath(30, 40, 40, 40)], '#9b7bff')]).id, 0, 4);
    hold(l, vectorDrawing(doc, [fill([rectPath(180, 70, 40, 40)], '#9b7bff')]).id, 4, 4);
    return doc;
  },
  /** A folder with two layers and a shadow on the folder. */
  folder() {
    const doc = fresh('Folder');
    doc.folders = { f1: { id: 'f1', name: 'Pair', visible: true, opacity: 1, effects: [fx('shadow', SHADOW)] } };
    const a = addVectorLayer(doc, 'A');
    a.folder = 'f1';
    hold(a, vectorDrawing(doc, [fill([rectPath(40, 40, 40, 40)], '#4fd1a5')]).id, 0, 8);
    const b = addVectorLayer(doc, 'B');
    b.folder = 'f1';
    hold(b, vectorDrawing(doc, [fill([ellipsePath(120, 70, 20, 20)], '#ffc94a')]).id, 0, 8);
    return doc;
  },
  /** A copy of a symbol on a layer with a shadow (a precomp in Lottie). */
  symbol() {
    const doc = fresh('Symbol');
    const inner = addVectorLayer(doc, 'Disc');
    hold(inner, vectorDrawing(doc, [fill([ellipsePath(0, 0, 18, 18)], '#ff6f91')]).id, 0, 1);
    doc.symbols = { disc: { id: 'disc', name: 'Disc', layers: doc.layers, length: 1, origin: { x: 0, y: 0 } } };
    doc.layers = [];
    const l = addVectorLayer(doc, 'Copy');
    l.effects = [fx('shadow', SHADOW)];
    const inst: InstanceShape = { id: 'i1', type: 'instance', symbolId: 'disc', transform: { x: 70, y: 60, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 };
    const d = vectorDrawing(doc, []);
    d.shapes = [inst];
    hold(l, d.id, 0, 8);
    return doc;
  },
  /** A pixel layer with a shadow (a picture layer in Lottie). */
  pixel() {
    const doc = fresh('Pixel');
    const l = addPixelLayer(doc, 'Sprite', 6);
    l.effects = [fx('shadow', SHADOW)];
    hold(l, pixelDrawing(doc, ['.##.', '####', '####', '.##.'], { '#': '#5ab8ff' }).id, 0, 8);
    return doc;
  },
  /** Shadow and blur on one layer. */
  stack() {
    const doc = fresh('Stack');
    const l = addVectorLayer(doc, 'Box');
    l.effects = [fx('shadow', SHADOW), fx('blur', { radius: 1.5 })];
    hold(l, vectorDrawing(doc, [fill([rectPath(40, 40, 50, 40)], '#ffc94a')]).id, 0, 8);
    return doc;
  },
  /** Blur first, then shadow (lottie-web gives the whole layer the region of the last effect). */
  stack2() {
    const doc = fresh('Stack2');
    const l = addVectorLayer(doc, 'Box');
    l.effects = [fx('blur', { radius: 1.5 }), fx('shadow', SHADOW)];
    hold(l, vectorDrawing(doc, [fill([rectPath(40, 40, 50, 40)], '#ffc94a')]).id, 0, 8);
    return doc;
  },
  /** A shadowed box with a camera that pans. */
  camera() {
    const doc = fresh('Camera');
    const l = addVectorLayer(doc, 'Box');
    l.effects = [fx('shadow', SHADOW)];
    hold(l, vectorDrawing(doc, [fill([rectPath(80, 60, 50, 40)], '#9b7bff')]).id, 0, 8);
    const { layer, drawing } = newCameraLayer(doc);
    doc.drawings[drawing.id] = drawing;
    doc.layers.push(layer);
    setCameraKey(doc, layer, 0, { x: W / 2, y: H / 2, zoom: 1, rotation: 0 });
    setCameraKey(doc, layer, 7, { x: 200, y: 120, zoom: 1, rotation: 0 });
    layer.cels[0].tween = { ease: 'linear' };
    return doc;
  },
};

async function over(draw: (g: CanvasRenderingContext2D) => void | Promise<void>) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  await draw(g);
  const px = g.getImageData(0, 0, W, H).data;
  return { png: c.toDataURL('image/png'), px: Array.from(px) };
}

async function rasterSvg(svg: string, g: CanvasRenderingContext2D) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((ok, no) => {
    img.onload = () => ok(null);
    img.onerror = () => no(new Error('the SVG did not load'));
    img.src = url;
  });
  g.drawImage(img, 0, 0, W, H);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frameOf = (doc: Doc, frame: number) => frame;

(window as unknown as { clip: unknown }).clip = {
  W,
  H,
  names: () => Object.keys(DOCS),
  json: (name: string, opts: Record<string, unknown> = {}) => JSON.stringify(docToLottie(DOCS[name](), opts)),
  async editor(name: string, frame: number) {
    return over((g) => void g.drawImage(renderFrameToCanvas(DOCS[name](), frame, 1), 0, 0));
  },
  async lottieSvg(name: string, frame: number) {
    const holder = document.createElement('div');
    holder.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
    document.body.appendChild(holder);
    const doc = DOCS[name]();
    const anim = lottieSvg.loadAnimation({ container: holder, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(docToLottie(doc))), rendererSettings: { preserveAspectRatio: 'none' } as never });
    await wait(200);
    anim.goToAndStop(frameOf(doc, frame), true);
    await wait(100);
    const el = holder.querySelector('svg')!;
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    el.setAttribute('width', String(W));
    el.setAttribute('height', String(H));
    const svg = new XMLSerializer().serializeToString(el);
    const res = await over((g) => rasterSvg(svg, g));
    anim.destroy();
    holder.remove();
    return res;
  },
  async lottieCanvas(name: string, frame: number) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const anim = lottieCanvas.loadAnimation({ renderer: 'canvas', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(docToLottie(DOCS[name]()))), rendererSettings: { context: canvas.getContext('2d')!, clearCanvas: true, preserveAspectRatio: 'none' } as never });
    await wait(200);
    anim.goToAndStop(frame, true);
    await wait(100);
    const res = await over((g) => void g.drawImage(canvas, 0, 0));
    anim.destroy();
    canvas.remove();
    return res;
  },
  async thorvg(name: string, frame: number, base: string) {
    const mod = await import(/* @vite-ignore */ base + '/index.js');
    mod.DotLottie.setWasmUrl(base + '/dotlottie-player.wasm');
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const player = new mod.DotLottie({ canvas, data: JSON.stringify(docToLottie(DOCS[name]())), autoplay: false, renderConfig: { devicePixelRatio: 1, autoResize: false }, layout: { fit: 'fill', align: [0.5, 0.5] } });
    await new Promise<void>((res, rej) => {
      player.addEventListener('load', () => res());
      player.addEventListener('loadError', (e: unknown) => rej(new Error('load error ' + JSON.stringify(e))));
      setTimeout(() => rej(new Error('player did not load')), 15000);
    });
    player.setFrame(frame);
    await wait(300);
    const res = await over((g) => void g.drawImage(canvas, 0, 0));
    player.destroy();
    canvas.remove();
    return res;
  },
};
