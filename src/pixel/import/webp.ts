// An animated WebP taken apart without any decoder: the RIFF chunks are read for the canvas, the frames' rectangles, delays
// and blend / dispose flags, and each frame is cut out as a small still WebP file that any browser can show. The pictures
// are then laid over each other the way the file plays. Plain functions, no canvas (the page's still decoder does the pixels).

export class WebpProblem extends Error {}

export interface WebpFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Milliseconds as written in the file. */
  delay: number;
  /** True when the frame is laid over what is there (false = it replaces it). */
  blend: boolean;
  /** True when the frame's rectangle is cleared to see-through once it has shown. */
  disposeToBackground: boolean;
  /** This frame alone, as a still WebP file. */
  file: Uint8Array;
}

export interface WebpAnimation {
  width: number;
  height: number;
  /** Times it plays: 0 = forever. */
  loops: number;
  frames: WebpFrame[];
}

const fourcc = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u24 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32le = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

/** A still WebP file holding the given picture chunks (`ALPH` + `VP8 `, or `VP8L`), `w` x `h` big. */
function stillFile(w: number, h: number, parts: Uint8Array[], alpha: boolean): Uint8Array {
  const head = new Uint8Array(10);
  head[0] = alpha ? 0x10 : 0;
  head[4] = (w - 1) & 255;
  head[5] = ((w - 1) >> 8) & 255;
  head[6] = ((w - 1) >> 16) & 255;
  head[7] = (h - 1) & 255;
  head[8] = ((h - 1) >> 8) & 255;
  head[9] = ((h - 1) >> 16) & 255;
  const body = [chunk('VP8X', head), ...parts];
  const size = 4 + body.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(8 + size);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(out.buffer).setUint32(4, size, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  let at = 12;
  for (const p of body) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The frames of an animated WebP (throws WebpProblem in plain words when the file is not one or is damaged). */
export function demuxWebp(b: Uint8Array): WebpAnimation {
  if (b.length < 30 || fourcc(b, 0) !== 'RIFF' || fourcc(b, 8) !== 'WEBP') throw new WebpProblem('That is not a WebP picture.');
  const end = Math.min(b.length, 8 + u32le(b, 4));
  let width = 0;
  let height = 0;
  let animated = false;
  let loops = 0;
  const frames: WebpFrame[] = [];
  let at = 12;
  while (at + 8 <= end) {
    const type = fourcc(b, at);
    const len = u32le(b, at + 4);
    const data = b.subarray(at + 8, Math.min(at + 8 + len, b.length));
    if (at + 8 + len > b.length) throw new WebpProblem('The WebP picture is cut short.');
    if (type === 'VP8X' && len >= 10) {
      animated = (data[0] & 0x02) !== 0;
      width = u24(data, 4) + 1;
      height = u24(data, 7) + 1;
    } else if (type === 'ANIM' && len >= 6) loops = data[4] | (data[5] << 8);
    else if (type === 'ANMF' && len > 16) {
      const w = u24(data, 6) + 1;
      const h = u24(data, 9) + 1;
      // The frame's own picture chunks follow its 16 byte header.
      const parts: Uint8Array[] = [];
      let alpha = false;
      let k = 16;
      while (k + 8 <= data.length) {
        const t = fourcc(data, k);
        const n = u32le(data, k + 4);
        if (k + 8 + n > data.length) throw new WebpProblem('A frame of the WebP picture is cut short.');
        if (t === 'ALPH') alpha = true;
        if (t === 'ALPH' || t === 'VP8 ' || t === 'VP8L') parts.push(chunk(t, data.subarray(k + 8, k + 8 + n)));
        k += 8 + n + (n & 1);
      }
      if (!parts.some((p) => fourcc(p, 0) !== 'ALPH')) throw new WebpProblem('A frame of the WebP picture has no picture in it.');
      const x = u24(data, 0) * 2;
      const y = u24(data, 3) * 2;
      // A lossless frame can carry see-through pixels without an ALPH chunk, so the flag follows the file's own.
      const hasAlpha = alpha || parts.some((p) => fourcc(p, 0) === 'VP8L');
      frames.push({ x, y, width: w, height: h, delay: u24(data, 12), blend: (data[15] & 2) === 0, disposeToBackground: (data[15] & 1) !== 0, file: stillFile(w, h, parts, hasAlpha) });
    }
    at += 8 + len + (len & 1);
  }
  if (!animated || !frames.length) throw new WebpProblem('That WebP picture is not animated.');
  if (width < 1 || height < 1) throw new WebpProblem('The WebP picture has an odd size.');
  for (const f of frames) if (f.x + f.width > width || f.y + f.height > height) throw new WebpProblem('A frame of the WebP picture lies outside the picture, so the file may be damaged.');
  return { width, height, loops, frames };
}

/**
 * Lays one frame's decoded picture (RGBA, `f.width` x `f.height`) on the canvas (RGBA, `width` wide) the way the file says,
 * and returns nothing: the canvas now shows the frame. Call `disposeFrame` after taking a copy of the canvas.
 */
export function drawWebpFrame(canvas: Uint8ClampedArray, width: number, f: Pick<WebpFrame, 'x' | 'y' | 'width' | 'height' | 'blend'>, pixels: Uint8ClampedArray): void {
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const s = (y * f.width + x) * 4;
      const o = ((y + f.y) * width + x + f.x) * 4;
      const sa = pixels[s + 3];
      if (!f.blend || sa === 255) {
        canvas[o] = pixels[s];
        canvas[o + 1] = pixels[s + 1];
        canvas[o + 2] = pixels[s + 2];
        canvas[o + 3] = sa;
      } else if (sa > 0) {
        // Source over, with colours that are not premultiplied.
        const da = canvas[o + 3];
        const oa = sa + (da * (255 - sa)) / 255;
        for (let k = 0; k < 3; k++) canvas[o + k] = (pixels[s + k] * sa + (canvas[o + k] * da * (255 - sa)) / 255) / oa;
        canvas[o + 3] = oa;
      }
    }
  }
}

/** Clears the frame's rectangle when the frame says it goes back to the background once shown. */
export function disposeWebpFrame(canvas: Uint8ClampedArray, width: number, f: Pick<WebpFrame, 'x' | 'y' | 'width' | 'height' | 'disposeToBackground'>): void {
  if (!f.disposeToBackground) return;
  for (let y = 0; y < f.height; y++) canvas.fill(0, ((y + f.y) * width + f.x) * 4, ((y + f.y) * width + f.x + f.width) * 4);
}
