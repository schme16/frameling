import type { Doc } from '../../src/core/format';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';

export function rgba(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set(fn(x, y), (y * w + x) * 4);
  return a;
}

export interface ParsedGif {
  signature: string;
  width: number;
  height: number;
  globalColours: number;
  frames: number;
  delays: number[];
  transparentFlags: boolean[];
  loopCount: number | null;
  trailer: boolean;
}

/** Walks a GIF's blocks, the way a viewer would, to count frames and read their settings. */
export function parseGif(b: Uint8Array): ParsedGif {
  const sig = String.fromCharCode(...b.subarray(0, 6));
  const width = b[6] | (b[7] << 8);
  const height = b[8] | (b[9] << 8);
  const packed = b[10];
  let at = 13;
  const globalColours = packed & 0x80 ? 1 << ((packed & 7) + 1) : 0;
  at += globalColours * 3;
  const out: ParsedGif = { signature: sig, width, height, globalColours, frames: 0, delays: [], transparentFlags: [], loopCount: null, trailer: false };
  const skipBlocks = () => {
    while (b[at] !== 0) at += b[at] + 1;
    at++;
  };
  while (at < b.length) {
    const t = b[at++];
    if (t === 0x3b) {
      out.trailer = true;
      break;
    } else if (t === 0x21) {
      const label = b[at++];
      if (label === 0xf9) {
        out.transparentFlags.push((b[at + 1] & 1) === 1);
        out.delays.push((b[at + 2] | (b[at + 3] << 8)) * 10);
      } else if (label === 0xff && String.fromCharCode(...b.subarray(at + 1, at + 12)) === 'NETSCAPE2.0') {
        out.loopCount = b[at + 14] | (b[at + 15] << 8);
      }
      skipBlocks();
    } else if (t === 0x2c) {
      const flags = b[at + 8];
      at += 9;
      if (flags & 0x80) at += (1 << ((flags & 7) + 1)) * 3;
      at++; // lzw minimum code size
      skipBlocks();
      out.frames++;
    } else throw new Error('unexpected block ' + t);
  }
  return out;
}

/** A small document with one vector layer and one pixel layer, for exporter tests. */
export function sampleDoc(): Doc {
  const doc = newDoc({ name: 'Hero Run', width: 16, height: 16, fps: 10, length: 4, background: null });
  const v = newVectorDrawing();
  v.shapes.push({ id: 's', type: 'path', paths: [{ closed: true, points: [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 9 }] }], fill: '#ff0000', stroke: null, opacity: 1 });
  doc.drawings[v.id] = v;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 4, drawingId: v.id });
  const layer = newPixelLayer('Pixels', 2);
  const p = newPixelDrawing(8, 8);
  p.pixels.set([0, 0, 255, 255], 0);
  doc.drawings[p.id] = p;
  layer.cels.push({ id: 'c2', start: 1, length: 2, drawingId: p.id });
  doc.layers.push(layer);
  doc.clips.push({ id: 'k1', name: 'idle', start: 0, end: 1, loop: true }, { id: 'k2', name: 'run', start: 2, end: 3, loop: false });
  return doc;
}

/**
 * Every frame of a pixel-only document at art size (one art pixel = one pixel), composited in plain JS the way the
 * canvas does it: visible, non-reference layers bottom first, "source over". Lets sheet tests run without a canvas.
 */
export function artFrames(doc: Doc): { width: number; height: number; pixels: Uint8ClampedArray }[] {
  const layers = doc.layers.filter((l) => l.visible && !l.reference);
  const p = layers[0].kind === 'pixel' ? layers[0].pixelSize : 1;
  const w = Math.ceil(doc.width / p);
  const h = Math.ceil(doc.height / p);
  const out = [];
  for (let f = 0; f < doc.length; f++) {
    const px = new Uint8ClampedArray(w * h * 4);
    for (const l of layers) {
      const cel = l.cels.find((c) => f >= c.start && f < c.start + c.length);
      const d = cel && doc.drawings[cel.drawingId];
      if (!d || d.kind !== 'pixel') continue;
      for (let i = 0; i < w * h; i++) {
        const sa = (d.pixels[i * 4 + 3] / 255) * l.opacity;
        if (!sa) continue;
        const da = px[i * 4 + 3] / 255;
        const oa = sa + da * (1 - sa);
        for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.round((d.pixels[i * 4 + k] * sa + px[i * 4 + k] * da * (1 - sa)) / oa);
        px[i * 4 + 3] = Math.round(oa * 255);
      }
    }
    out.push({ width: w, height: h, pixels: px });
  }
  return out;
}
