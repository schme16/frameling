// Reading a picture file into frames: PNG, animated PNG and GIF with our own readers (so they work the same everywhere
// and in tests), anything else the browser can show (JPEG, BMP, PNG kinds we don't read) through the page's own decoder,
// and animated WebP frame by frame through the browser's ImageDecoder.
import { decodePng, PNG_SIGNATURE } from '../../io/png';
import { ApngProblem, decodeApng, isApng } from './apng';
import { decodeGif, GIF_MAX_FRAMES, GIF_MAX_PIXELS, GifProblem, isGif } from './gif';

export interface PictureFrame {
  pixels: Uint8ClampedArray;
  /** Milliseconds it shows (missing in a still picture). */
  delay?: number;
}

export interface Picture {
  width: number;
  height: number;
  /** One for a still picture, one per frame for a GIF, an animated PNG or an animated WebP. */
  frames: PictureFrame[];
  kind: 'png' | 'gif' | 'apng' | 'webp' | 'other';
  /** Anything odd the reader noticed. */
  notes: string[];
}

export class PictureProblem extends Error {}

export const PICTURE_EXT = /\.(png|apng|gif|webp|jpe?g|bmp)$/i;
export const PICTURE_ACCEPT = '.png,.apng,.gif,.webp,.jpg,.jpeg,.bmp';

/** A WebP file whose header says it is animated (the animation flag of the VP8X chunk). */
export const isAnimatedWebp = (b: Uint8Array): boolean =>
  b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 && b[12] === 0x56 && b[13] === 0x50 && b[14] === 0x38 && b[15] === 0x58 && (b[20] & 0x02) !== 0;

const isPng = (b: Uint8Array): boolean => b.length > 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);

/** A picture from the bytes of a file. Throws PictureProblem in plain words when it can't. */
export async function decodePicture(bytes: Uint8Array): Promise<Picture> {
  if (isGif(bytes)) {
    try {
      const g = decodeGif(bytes);
      return { width: g.width, height: g.height, frames: g.frames, kind: 'gif', notes: g.notes };
    } catch (e) {
      throw new PictureProblem(e instanceof GifProblem ? e.message : 'Frameling could not read that GIF.');
    }
  }
  const notes: string[] = [];
  if (isPng(bytes) && isApng(bytes)) {
    try {
      const a = decodeApng(bytes);
      return { width: a.width, height: a.height, frames: a.frames, kind: 'apng', notes: a.notes };
    } catch (e) {
      // The page can still show its first picture.
      notes.push(`${e instanceof ApngProblem ? e.message.replace(/\.$/, '') : 'This animated PNG could not be read'}, so only its first picture was taken.`);
    }
  }
  if (isAnimatedWebp(bytes)) {
    const w = await decodeAnimatedWebp(bytes);
    if (w) return w;
    notes.push('This is an animated WebP, but this computer could not read its frames, so only the first picture was taken.');
  }
  if (isPng(bytes)) {
    try {
      const img = decodePng(bytes);
      return { width: img.width, height: img.height, frames: [{ pixels: img.pixels }], kind: 'png', notes };
    } catch {
      // Interlaced and other rarer PNG kinds: the page can read those.
    }
  }
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') throw new PictureProblem('Frameling could not read that picture.');
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    const data = g.getImageData(0, 0, bmp.width, bmp.height);
    return { width: bmp.width, height: bmp.height, frames: [{ pixels: new Uint8ClampedArray(data.data.buffer) }], kind: 'other', notes };
  } catch {
    throw new PictureProblem('Frameling could not read that picture. It may be damaged, or not a picture.');
  }
}

/** Every frame of an animated WebP, drawn the way it plays, with delays, through the browser's ImageDecoder (null when it can't). */
async function decodeAnimatedWebp(bytes: Uint8Array): Promise<Picture | null> {
  const ID = (globalThis as unknown as { ImageDecoder?: new (init: { data: Uint8Array; type: string }) => WebpDecoder }).ImageDecoder;
  if (!ID || typeof OffscreenCanvas === 'undefined') return null;
  let dec: WebpDecoder | null = null;
  try {
    dec = new ID({ data: bytes, type: 'image/webp' });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack?.frameCount ?? 0;
    if (count < 2) return null;
    const frames: PictureFrame[] = [];
    const notes: string[] = [];
    let width = 0;
    let height = 0;
    let c: OffscreenCanvas | null = null;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      width = image.displayWidth;
      height = image.displayHeight;
      if (frames.length >= GIF_MAX_FRAMES || (frames.length + 1) * width * height > GIF_MAX_PIXELS) {
        image.close();
        notes.push(`The animation has ${count} frames; only the first ${frames.length} were read, to keep memory in check.`);
        break;
      }
      c ??= new OffscreenCanvas(width, height);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.clearRect(0, 0, width, height);
      g.drawImage(image as unknown as CanvasImageSource, 0, 0);
      const data = g.getImageData(0, 0, width, height);
      // The decoder gives the frame as it looks when it shows (the file's own dispose and blend steps are done); the time is in microseconds.
      const ms = image.duration ? Math.round(image.duration / 1000) : 0;
      image.close();
      frames.push({ pixels: new Uint8ClampedArray(data.data.buffer), delay: ms <= 10 ? 100 : ms });
    }
    return frames.length > 1 ? { width, height, frames, kind: 'webp', notes } : null;
  } catch {
    return null;
  } finally {
    dec?.close();
  }
}

interface WebpDecoder {
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } };
  decode(o: { frameIndex: number }): Promise<{ image: { displayWidth: number; displayHeight: number; duration: number | null; close(): void } }>;
  close(): void;
}
