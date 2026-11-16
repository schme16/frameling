// Animated WebP made from still WebP pictures. The browser can only save one still at a time, so each frame is saved
// as a small still file, the picture chunks are lifted out of it, and they are packed into one animated file (RIFF
// container: VP8X, ANIM, then one ANMF per frame). Plain functions on bytes, no canvas.

export class WebpMakeProblem extends Error {}

const fourcc = (b: Uint8Array, at: number): string => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const u32le = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

function put24(b: Uint8Array, at: number, v: number): void {
  b[at] = v & 255;
  b[at + 1] = (v >> 8) & 255;
  b[at + 2] = (v >> 16) & 255;
}

/** One chunk: four letters, the length, the data, and a spare byte when the length is odd. */
export function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function riff(chunks: Uint8Array[]): Uint8Array {
  const size = 4 + chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(8 + size);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(out.buffer).setUint32(4, size, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  let at = 12;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export interface StillPicture {
  /** The chunks that make the picture: `ALPH` (when it has see-through parts) and `VP8 `, or `VP8L`. */
  chunks: Uint8Array[];
  /** True when the picture can be see-through. */
  alpha: boolean;
  /** Saved without losing anything (VP8L). */
  lossless: boolean;
}

/** Lifts the picture out of a still WebP file (plain, or the extended kind with a see-through plane). */
export function stillPicture(file: Uint8Array): StillPicture {
  if (file.length < 20 || fourcc(file, 0) !== 'RIFF' || fourcc(file, 8) !== 'WEBP') throw new WebpMakeProblem('The browser gave back something that is not a WebP picture.');
  const end = Math.min(file.length, 8 + u32le(file, 4));
  const chunks: Uint8Array[] = [];
  let alpha = false;
  let lossless = false;
  let image = false;
  let at = 12;
  while (at + 8 <= end) {
    const type = fourcc(file, at);
    const len = u32le(file, at + 4);
    if (at + 8 + len > file.length) throw new WebpMakeProblem('The WebP picture came back cut short.');
    const data = file.subarray(at + 8, at + 8 + len);
    if (type === 'VP8X') alpha = alpha || (data[0] & 0x10) !== 0;
    else if (type === 'ALPH') {
      alpha = true;
      chunks.push(webpChunk(type, data));
    } else if (type === 'VP8 ' || type === 'VP8L') {
      image = true;
      if (type === 'VP8L') {
        lossless = true;
        // The lossless header (after its signature byte) ends with a see-through flag: bit 4 of its fourth byte.
        alpha = alpha || (data.length > 4 && (data[4] & 0x10) !== 0);
      }
      chunks.push(webpChunk(type, data));
    }
    at += 8 + len + (len & 1);
  }
  if (!image) throw new WebpMakeProblem('The WebP picture has no picture in it.');
  return { chunks, alpha, lossless };
}

export interface WebpFrameIn {
  file: Uint8Array;
  /** How long it shows, in thousandths of a second. */
  ms: number;
}

export interface WebpOut {
  width: number;
  height: number;
  /** Repeat for ever (true) or play once. */
  loop: boolean;
  /** Background colour for players that need one (RGBA bytes). Default: see-through. */
  background?: [number, number, number, number];
}

/** The longest one frame can show: 24 bits of milliseconds. */
export const WEBP_MAX_MS = 0xffffff;

/** Packs the frames into one animated WebP. Every frame is the whole picture and replaces the one before it. */
export function buildAnimatedWebp(frames: WebpFrameIn[], out: WebpOut): Uint8Array {
  if (!frames.length) throw new WebpMakeProblem('There are no frames to pack.');
  if (out.width < 1 || out.height < 1 || out.width > 16777216 || out.height > 16777216) throw new WebpMakeProblem('That picture size cannot go in a WebP.');
  let alpha = false;
  const parts: Uint8Array[] = [];
  for (const f of frames) {
    const pic = stillPicture(f.file);
    alpha = alpha || pic.alpha;
    const head = new Uint8Array(16);
    // Offsets are in steps of two pixels; every frame starts at the corner.
    put24(head, 6, out.width - 1);
    put24(head, 9, out.height - 1);
    put24(head, 12, Math.min(WEBP_MAX_MS, Math.max(1, Math.round(f.ms))));
    // Bit 1: do not blend with what is there, so a frame with see-through parts replaces it. Bit 0: keep what is there.
    head[15] = 0x02;
    const body = new Uint8Array(16 + pic.chunks.reduce((n, c) => n + c.length, 0));
    body.set(head, 0);
    let at = 16;
    for (const c of pic.chunks) {
      body.set(c, at);
      at += c.length;
    }
    parts.push(webpChunk('ANMF', body));
  }
  const vp8x = new Uint8Array(10);
  // Flags: animation (0x02), and see-through (0x10) when any frame can be.
  vp8x[0] = 0x02 | (alpha ? 0x10 : 0);
  put24(vp8x, 4, out.width - 1);
  put24(vp8x, 7, out.height - 1);
  const anim = new Uint8Array(6);
  const bg = out.background ?? [0, 0, 0, 0];
  // The colour is stored blue, green, red, alpha.
  anim.set([bg[2], bg[1], bg[0], bg[3]], 0);
  anim[4] = out.loop ? 0 : 1;
  anim[5] = 0;
  return riff([webpChunk('VP8X', vp8x), webpChunk('ANIM', anim), ...parts]);
}

/** Milliseconds each frame shows at `fps`, rounded across the run so the total stays true (24 fps gives 41, 42, 41...). */
export function webpDelays(count: number, fps: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const t = Math.round(((i + 1) * 1000) / Math.max(0.001, fps));
    out.push(Math.max(1, t - prev));
    prev = Math.max(prev + 1, t);
  }
  return out;
}

export const DEFAULT_JPEG_QUALITY = 90;
export const DEFAULT_WEBP_QUALITY = 85;

const clampQuality = (q: number | undefined, fallback: number): number => (typeof q === 'number' && Number.isFinite(q) ? Math.min(100, Math.max(1, Math.round(q))) : fallback);

/** JPEG quality as 1 to 100 (missing or odd values give 90). */
export const jpegQualityOf = (s: { jpegQuality?: number }): number => clampQuality(s.jpegQuality, DEFAULT_JPEG_QUALITY);
/** WebP quality as 1 to 100 (missing or odd values give 85). */
export const webpQualityOf = (s: { webpQuality?: number }): number => clampQuality(s.webpQuality, DEFAULT_WEBP_QUALITY);
/** Lossless WebP when asked, and by default for pixel art, where a lossy picture smears the hard edges. */
export const webpLosslessOf = (s: { webpLossless?: boolean }, pixelArt: boolean): boolean => s.webpLossless ?? pixelArt;
