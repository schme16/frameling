// An animated PNG reader (APNG), built on the PNG pieces in io/png.ts: every frame as a full picture (RGBA) with how long it
// shows, the way the file plays (dispose and blend steps are handled). Plain functions, no canvas.
import { decodePngData, joinBytes, PNG_SIGNATURE, readChunks, u32, type PngKind } from '../../io/png';
import { GIF_MAX_FRAMES, GIF_MAX_PIXELS } from './gif';

export class ApngProblem extends Error {}

export interface ApngFrame {
  /** RGBA of the whole picture as it looks when this frame shows. */
  pixels: Uint8ClampedArray;
  /** How long it shows, in milliseconds. */
  delay: number;
}

export interface ApngPicture {
  width: number;
  height: number;
  frames: ApngFrame[];
  /** Times it plays: 0 = forever. */
  loops: number;
  notes: string[];
}

/** True for a PNG that carries animation: an `acTL` chunk before the first picture data. */
export function isApng(b: Uint8Array): boolean {
  if (b.length < 40 || PNG_SIGNATURE.some((v, i) => b[i] !== v)) return false;
  let at = 8;
  while (at + 12 <= b.length) {
    const len = u32(b, at);
    const type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    at += 12 + len;
  }
  return false;
}

/** Same rule as GIF: a delay of 0 or a hundredth of a second shows as a tenth, as browsers do. */
export const apngDelayMs = (num: number, den: number): number => {
  const ms = Math.round((num * 1000) / (den || 100));
  return ms <= 10 ? 100 : ms;
};

interface Ctl {
  width: number;
  height: number;
  x: number;
  y: number;
  delay: number;
  dispose: number;
  blend: number;
}

/** Reads every frame of an APNG. Throws ApngProblem in plain words when it can't. */
export function decodeApng(bytes: Uint8Array): ApngPicture {
  let chunks;
  try {
    chunks = readChunks(bytes);
  } catch (e) {
    throw new ApngProblem(e instanceof Error ? `${e.message}.` : 'Frameling could not read that animated PNG.');
  }
  const head = chunks.find((c) => c.type === 'IHDR')?.data;
  if (!head || head.length < 13) throw new ApngProblem('The PNG picture has no header.');
  const kind: PngKind = { width: u32(head, 0), height: u32(head, 4), depth: head[8], ctype: head[9], interlaced: head[12] === 1 };
  const { width: W, height: H } = kind;
  if (W < 1 || H < 1 || W * H > 1 << 28) throw new ApngProblem('The animated PNG has an odd size.');
  const actl = chunks.find((c) => c.type === 'acTL')?.data;
  if (!actl || actl.length < 8) throw new ApngProblem('That PNG is not animated.');
  const loops = u32(actl, 4);
  const plte = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;
  const notes: string[] = [];

  // Frames in file order: each starts at an fcTL chunk and takes the IDAT (first frame) or fdAT pieces that follow it.
  // Picture data with no fcTL before it is a stand-in for viewers that can't animate, and is left out.
  const found: { ctl: Ctl; parts: Uint8Array[] }[] = [];
  for (const c of chunks) {
    if (c.type === 'fcTL' && c.data.length >= 26) {
      const d = c.data;
      const w = u32(d, 4);
      const h = u32(d, 8);
      const x = u32(d, 12);
      const y = u32(d, 16);
      if (w < 1 || h < 1 || x + w > W || y + h > H) throw new ApngProblem('A frame of the animated PNG lies outside the picture, so the file may be damaged.');
      found.push({ ctl: { width: w, height: h, x, y, delay: apngDelayMs((d[20] << 8) | d[21], (d[22] << 8) | d[23]), dispose: d[24], blend: d[25] }, parts: [] });
    } else if (c.type === 'IDAT' && found.length === 1) found[0].parts.push(c.data);
    else if (c.type === 'fdAT' && found.length && c.data.length > 4) found[found.length - 1].parts.push(c.data.subarray(4));
  }
  if (!found.length || found.some((f) => !f.parts.length)) throw new ApngProblem('The animated PNG has a frame with no picture in it, so the file may be damaged.');

  const frames: ApngFrame[] = [];
  const canvas = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < found.length; i++) {
    if (frames.length >= GIF_MAX_FRAMES || (frames.length + 1) * W * H > GIF_MAX_PIXELS) {
      notes.push(`The animation has ${found.length} frames; only the first ${frames.length} were read, to keep memory in check.`);
      break;
    }
    const { ctl, parts } = found[i];
    let img;
    try {
      img = decodePngData({ ...kind, width: ctl.width, height: ctl.height }, joinBytes(parts), plte, trns);
    } catch (e) {
      throw new ApngProblem(e instanceof Error ? `${e.message}.` : 'Frameling could not read a frame of that animated PNG.');
    }
    // What the canvas held under the frame, for a frame that says "go back to what was there".
    const dispose = i === 0 && ctl.dispose === 2 ? 1 : ctl.dispose;
    const under = dispose === 2 ? new Uint8ClampedArray(canvas) : null;
    for (let y = 0; y < ctl.height; y++) {
      for (let x = 0; x < ctl.width; x++) {
        const s = (y * ctl.width + x) * 4;
        const o = ((y + ctl.y) * W + x + ctl.x) * 4;
        const sa = img.pixels[s + 3];
        if (ctl.blend === 0 || sa === 255) {
          canvas[o] = img.pixels[s];
          canvas[o + 1] = img.pixels[s + 1];
          canvas[o + 2] = img.pixels[s + 2];
          canvas[o + 3] = sa;
        } else if (sa > 0) {
          // Source over, with colours that are not premultiplied.
          const da = canvas[o + 3];
          const oa = sa + (da * (255 - sa)) / 255;
          for (let k = 0; k < 3; k++) canvas[o + k] = (img.pixels[s + k] * sa + (canvas[o + k] * da * (255 - sa)) / 255) / oa;
          canvas[o + 3] = oa;
        }
      }
    }
    frames.push({ pixels: new Uint8ClampedArray(canvas), delay: ctl.delay });
    if (dispose === 1) {
      for (let y = 0; y < ctl.height; y++) canvas.fill(0, ((y + ctl.y) * W + ctl.x) * 4, ((y + ctl.y) * W + ctl.x + ctl.width) * 4);
    } else if (under) canvas.set(under);
  }
  return { width: W, height: H, frames, loops, notes };
}
