// The page side of shadow-sigma.cjs: a white box with a Shadow or a Glow of a chosen softness, drawn by the editor's
// renderer (native canvas filter or the JS fallback), the SVG and moving SVG writers and lottie-web (SVG player), then the
// blur width measured from the pixels. PDF, .ai and PSD bytes are handed back for the driver to rasterise.
import lottieSvg from 'lottie-web/build/player/lottie_svg';
import type { Doc, LayerEffect } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { defaultValues } from '../../src/effects/model';
import { setFilterOverride } from '../../src/effects/filterSupport';
import { renderFrameToCanvas } from '../../src/core/render';
import { frameToSvg } from '../../src/export/svg';
import { animatedSvg } from '../../src/export/svg-anim';
import { docToLottie } from '../../src/export/lottie';
import { loadShapeExports } from '../../src/export/shapeExport';
import { pdfFile, psdFile } from '../../src/export/layered-run';
import { addVectorLayer, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

export const W = 260;
export const H = 200;
/** The box's right edge, and where the shadow's edge lands (box edge + SHIFT). */
export const EDGE = 100;
export const SHIFT = 30;

type Kind = 'shadow' | 'glow';

function makeDoc(kind: Kind, amount: number, spread = true): Doc {
  const doc = newDoc({ name: 'Sigma', width: W, height: H, length: 2, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Box');
  const values = kind === 'shadow' ? { color: '#000000', opacity: 1, x: SHIFT, y: 0, softness: amount } : { color: '#000000', size: amount, strength: 1 };
  l.effects = [{ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } } as LayerEffect];
  // The second, invisible shape spreads the layer over the whole stage: Lottie players cut an effect off at the layer's bounds.
  hold(l, vectorDrawing(doc, [fill([rectPath(20, -10, EDGE - 20, H + 20)], '#ffffff'), ...(spread ? [fill([rectPath(0, 0, W, H)], '#ffffff', 0)] : [])]).id, 0, 2);
  return doc;
}

/** Inverse of the standard normal's cumulative distribution (Acklam). */
function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -probit(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * The gaussian sigma of a falling edge from a row of darkness (0..1, one value per pixel): every pixel the edge takes
 * between 4% and 96% of full strength (the test shadow and glow are black at full opacity) gives a point on x = edge - sigma * probit(p), and a line through them gives both.
 */
export function fit(dark: number[], from: number): { sigma: number; edge: number; n: number } {
  const pts: [number, number][] = [];
  const top = 1;
  for (let x = from; x < dark.length; x++) {
    const p = dark[x] / top;
    if (p > 0.04 && p < 0.96) pts.push([probit(p), x + 0.5]);
  }
  if (pts.length < 3) return { sigma: 0, edge: 0, n: pts.length };
  const n = pts.length;
  const mz = pts.reduce((s, q) => s + q[0], 0) / n;
  const mx = pts.reduce((s, q) => s + q[1], 0) / n;
  let sxz = 0;
  let szz = 0;
  for (const [z, x] of pts) {
    sxz += (z - mz) * (x - mx);
    szz += (z - mz) * (z - mz);
  }
  const slope = sxz / szz;
  return { sigma: -slope, edge: mx - slope * mz, n };
}

const rowOf = (data: Uint8ClampedArray, w: number, y: number) => Array.from({ length: w }, (_, x) => 1 - data[(y * w + x) * 4] / 255);

function imageRow(c: OffscreenCanvas | HTMLCanvasElement): number[] {
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  return rowOf(d, c.width, H >> 1);
}

async function rasterSvg(svg: string): Promise<number[]> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((ok, no) => {
    img.onload = () => ok(null);
    img.onerror = () => no(new Error('the SVG did not load'));
    img.src = url;
  });
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0, W, H);
  return imageRow(c);
}

const from = (kind: Kind) => (kind === 'shadow' ? EDGE + SHIFT - 25 : EDGE);

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

(window as unknown as { sig: unknown }).sig = {
  W,
  H,
  EDGE,
  SHIFT,
  fit,
  from,
  editor(kind: Kind, amount: number, mode: 'native' | 'fallback') {
    setFilterOverride(mode);
    const row = imageRow(renderFrameToCanvas(makeDoc(kind, amount), 0, 1));
    setFilterOverride(null);
    return row;
  },
  async svg(kind: Kind, amount: number) {
    await loadShapeExports();
    const svg = frameToSvg(makeDoc(kind, amount), 0, { scale: 1 });
    return { svg, row: await rasterSvg(svg) };
  },
  async svganim(kind: Kind, amount: number) {
    await loadShapeExports();
    const svg = animatedSvg(makeDoc(kind, amount), {});
    return { svg, row: await rasterSvg(svg) };
  },
  async lottie(kind: Kind, amount: number, spread = true) {
    const holder = document.createElement('div');
    holder.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
    document.body.appendChild(holder);
    const data = docToLottie(makeDoc(kind, amount, spread));
    const anim = lottieSvg.loadAnimation({ container: holder, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(data)), rendererSettings: { preserveAspectRatio: 'none' } as never });
    await new Promise((r) => setTimeout(r, 200));
    anim.goToAndStop(0, true);
    await new Promise((r) => setTimeout(r, 100));
    const el = holder.querySelector('svg')!;
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    el.setAttribute('width', String(W));
    el.setAttribute('height', String(H));
    const svg = new XMLSerializer().serializeToString(el);
    const row = await rasterSvg(svg);
    anim.destroy();
    holder.remove();
    return { svg, row, json: JSON.stringify(data) };
  },
  /** The Lottie file in the dotLottie web player (ThorVG), from the player package served at `base`. */
  async thorvg(kind: Kind, amount: number, base: string, spread = true) {
    const mod = await import(/* @vite-ignore */ base + '/index.js');
    mod.DotLottie.setWasmUrl(base + '/dotlottie-player.wasm');
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    document.body.appendChild(canvas);
    const player = new mod.DotLottie({ canvas, data: JSON.stringify(docToLottie(makeDoc(kind, amount, spread))), autoplay: false, renderConfig: { devicePixelRatio: 1, autoResize: false }, layout: { fit: 'fill', align: [0.5, 0.5] } });
    await new Promise<void>((res, rej) => {
      player.addEventListener('load', () => res());
      player.addEventListener('loadError', (e: unknown) => rej(new Error('load error ' + JSON.stringify(e))));
      setTimeout(() => rej(new Error('player did not load')), 15000);
    });
    player.setFrame(0);
    await new Promise((r) => setTimeout(r, 300));
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    const d = g.getImageData(0, 0, W, H).data;
    const y = H >> 1;
    const row = Array.from({ length: W }, (_, x) => 1 - d[(y * W + x) * 4] / 255);
    player.destroy();
    canvas.remove();
    return row;
  },
  async pdf(kind: Kind, amount: number, ai: boolean) {
    await loadShapeExports();
    return b64(pdfFile(makeDoc(kind, amount), [0], 1, false, false, () => undefined, ai, ai));
  },
  psd(kind: Kind, amount: number) {
    return b64(psdFile(makeDoc(kind, amount), 0, 1, 'doc', false));
  },
};
