// Reading the pictures of a sequence: out of a zip, then into frames of one size. Pure apart from the picture decoder
// (src/pixel/import/picture.ts), which reads PNGs by itself and leaves the rest to the page.
import { unzipSync } from 'fflate';
import { onEqualFrames } from '../../pixel/import/slicing';
import type { Sprite } from '../../pixel/import/build';
import { decodePicture, PictureProblem } from '../../pixel/import/picture';
import { GIF_MAX_PIXELS } from '../../pixel/import/gif';
import { MAX_SEQUENCE, SEQUENCE_PICTURE, isJunk } from './plan';

export interface NamedBytes {
  path: string;
  bytes: Uint8Array;
}

export class SequenceProblem extends Error {}

const MAX_PICTURE_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_BYTES = 1536 * 1024 * 1024;

/** The pictures of a zip, and the names of everything else in it. Only pictures are unpacked. */
export function readZipPictures(bytes: Uint8Array): { pictures: NamedBytes[]; others: string[] } {
  const others: string[] = [];
  const names: string[] = [];
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/') || isJunk(f.name)) return false;
        if (!SEQUENCE_PICTURE.test(f.name)) {
          others.push(f.name);
          return false;
        }
        if (f.originalSize > MAX_PICTURE_BYTES) {
          others.push(f.name);
          return false;
        }
        total += f.originalSize;
        if (total > MAX_ZIP_BYTES || names.length >= MAX_SEQUENCE + 1) return false;
        names.push(f.name);
        return true;
      },
    });
  } catch {
    throw new SequenceProblem("Frameling couldn't open that zip. It may be damaged, locked with a password, or not a zip at all.");
  }
  if (total > MAX_ZIP_BYTES) throw new SequenceProblem('The pictures in that zip add up to more than Frameling can hold at once. Try fewer of them.');
  return { pictures: Object.entries(files).map(([path, b]) => ({ path, bytes: b })), others };
}

export interface DecodedPicture {
  path: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface Decoded {
  pictures: DecodedPicture[];
  unreadable: { path: string; why: string }[];
  /** True when reading stopped early to keep memory in check. */
  stoppedEarly: number;
}

/** Reads each picture, one at a time so the window stays alive. Pictures that can't be read are listed, not fatal. */
export async function decodeAll(files: NamedBytes[], onProgress?: (done: number, total: number) => void): Promise<Decoded> {
  const pictures: DecodedPicture[] = [];
  const unreadable: { path: string; why: string }[] = [];
  let pixelsSoFar = 0;
  let stoppedEarly = 0;
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    const f = files[i];
    try {
      const pic = await decodePicture(f.bytes);
      if (pixelsSoFar + pic.width * pic.height > GIF_MAX_PIXELS) {
        stoppedEarly = files.length - i;
        break;
      }
      pixelsSoFar += pic.width * pic.height;
      pictures.push({ path: f.path, width: pic.width, height: pic.height, pixels: pic.frames[0].pixels });
    } catch (e) {
      unreadable.push({ path: f.path, why: e instanceof PictureProblem ? 'damaged or not a picture' : "couldn't be read" });
    }
  }
  onProgress?.(files.length, files.length);
  return { pictures, unreadable, stoppedEarly };
}

export interface SequenceTiming {
  fps: number;
  /** How many frames each picture is held for. */
  hold: number;
  reverse: boolean;
}

/** The pictures as a sprite of equal frames, each shown for `hold` ticks at `fps`. */
export function sequenceSprite(pics: DecodedPicture[], t: SequenceTiming): Sprite {
  if (!pics.length) throw new SequenceProblem('There are no pictures to bring in.');
  const list = t.reverse ? pics.slice().reverse() : pics;
  const sizes = new Set(list.map((p) => `${p.width}x${p.height}`));
  const images = onEqualFrames(
    list.map((p) => ({ width: p.width, height: p.height, pixels: p.pixels })),
    'centre',
  );
  const delay = (1000 * t.hold) / t.fps;
  const notes: string[] = [];
  const frames = images.map((image, i) => ({ image, delay, name: list[i].path.slice(list[i].path.lastIndexOf('/') + 1), row: 0 }));
  if (sizes.size > 1) notes.push('The pictures are not all the same size, so smaller ones sit in the middle of the frame.');
  return { width: images[0].width, height: images[0].height, frames, tags: [], slices: [], groups: [{ name: 'Frames', frames: frames.map((_, i) => i) }], notes };
}
