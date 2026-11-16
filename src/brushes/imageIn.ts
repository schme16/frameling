// A picture the person supplies, as the start of a brush tip, a grain or a dual tip. It is untrusted: a file can claim to
// be a few kilobytes and unpack to gigabytes, so the size is read from its header first and the picture is refused before
// anything is allocated for it. Only the pixels that are kept ever leave this file: callers boil them down to 32 by 32
// (a tip) or 64 by 64 (a texture) straight away.
import { isApng } from '../pixel/import/apng';
import { isGif } from '../pixel/import/gif';
import { decodePicture, isAnimatedWebp, PictureProblem } from '../pixel/import/picture';

/** The biggest file that is read at all. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** The most pixels one side may have, and the most there may be in all (16 million: a 4000 by 4000 picture). */
export const MAX_IMAGE_SIDE = 8192;
export const MAX_IMAGE_PIXELS = 16_000_000;

export class ImageProblem extends Error {}

const le16 = (b: Uint8Array, i: number): number => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number): number => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const le32 = (b: Uint8Array, i: number): number => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) | 0;
const be16 = (b: Uint8Array, i: number): number => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number): number => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number): string => String.fromCharCode(...b.subarray(i, i + n));

/** How big a PNG, GIF, JPEG, WebP or BMP says it is, from its header alone. Null for anything else, or a header that is cut short. */
export function peekImageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return { width: be32(b, 16), height: be32(b, 20) };
  if (b.length >= 10 && ascii(b, 0, 3) === 'GIF') return { width: le16(b, 6), height: le16(b, 8) };
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
    const dib = le32(b, 14);
    if (dib === 12) return { width: le16(b, 18), height: le16(b, 20) };
    return { width: Math.abs(le32(b, 18)), height: Math.abs(le32(b, 22)) };
  }
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const kind = ascii(b, 12, 4);
    if (kind === 'VP8X') return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
    if (kind === 'VP8L' && b[20] === 0x2f) {
      const v = le32(b, 21) >>> 0;
      return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8 ') return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // Walk the segments to the first "start of frame" marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = be16(b, i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: be16(b, i + 7), height: be16(b, i + 5) };
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

/** Says in plain words why a file's bytes are too much, or null when they are fine to read. */
export function imageRefusal(b: Uint8Array): string | null {
  if (b.length > MAX_IMAGE_BYTES) return 'That file is too big to use as a picture here. Pick one under 12 MB.';
  const s = peekImageSize(b);
  if (!s) return 'Frameling can use PNG, GIF, JPEG, WebP and BMP pictures here, and that file is none of them, or it is damaged.';
  if (!(s.width >= 1 && s.height >= 1)) return 'That picture has no size, so there is nothing to use.';
  if (s.width > MAX_IMAGE_SIDE || s.height > MAX_IMAGE_SIDE || s.width * s.height > MAX_IMAGE_PIXELS) return `That picture is too big (${s.width} by ${s.height}). Use one up to 4000 by 4000 pixels.`;
  return null;
}

async function firstFrame(bytes: Uint8Array): Promise<{ width: number; height: number; frames: { pixels: Uint8ClampedArray }[] }> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') throw new ImageProblem('This computer could not read an animated picture. Pick a still one.');
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  if (bmp.width * bmp.height > MAX_IMAGE_PIXELS) {
    bmp.close();
    throw new ImageProblem('That picture is too big.');
  }
  const { width, height } = bmp;
  const c = new OffscreenCanvas(width, height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, width, height);
  bmp.close();
  return { width, height, frames: [{ pixels: new Uint8ClampedArray(data.data.buffer) }] };
}

export interface ImagePixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** Any pixel in it is see-through. */
  clear: boolean;
}

/** The first picture in a file's bytes, after the size checks. Throws ImageProblem in plain words. */
export async function readImageBytes(bytes: Uint8Array): Promise<ImagePixels> {
  const no = imageRefusal(bytes);
  if (no) throw new ImageProblem(no);
  // An animation is read by the page's own decoder, which hands back one still. The frame reader here would unpack every frame, and a small file can hold thousands.
  const animated = isGif(bytes) || isAnimatedWebp(bytes) || (bytes[0] === 0x89 && isApng(bytes));
  let pic: { width: number; height: number; frames: { pixels: Uint8ClampedArray }[] };
  try {
    pic = animated ? await firstFrame(bytes) : await decodePicture(bytes);
  } catch (e) {
    throw new ImageProblem(e instanceof PictureProblem || e instanceof ImageProblem ? e.message : 'Frameling could not read that picture.');
  }
  const f = pic.frames[0];
  if (!f || pic.width * pic.height > MAX_IMAGE_PIXELS || f.pixels.length < pic.width * pic.height * 4) throw new ImageProblem('That picture could not be read.');
  let clear = false;
  for (let i = 3; i < f.pixels.length; i += 4)
    if (f.pixels[i] < 250) {
      clear = true;
      break;
    }
  return { width: pic.width, height: pic.height, rgba: f.pixels, clear };
}

/** The same for a file the person picked: the size is checked before the file is read into memory. */
export async function readImageFile(file: File): Promise<ImagePixels> {
  if (file.size > MAX_IMAGE_BYTES) throw new ImageProblem('That file is too big to use as a picture here. Pick one under 12 MB.');
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new ImageProblem('That file could not be opened.');
  }
  return readImageBytes(bytes);
}
