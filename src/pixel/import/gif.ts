// A GIF reader: every frame as a full picture (RGBA), with how long it shows. Plain functions, no canvas, so it runs
// the same in the app and in tests. Disposal is handled (leave, clear to transparent, go back to what was there before),
// interlaced and local-palette frames are read, and a file that stops early gives the frames that were whole.

export class GifProblem extends Error {}

export interface GifFrame {
  /** RGBA of the whole picture as it looks when this frame shows. */
  pixels: Uint8ClampedArray;
  /** How long it shows, in milliseconds. */
  delay: number;
}

export interface GifPicture {
  width: number;
  height: number;
  frames: GifFrame[];
  /** Times it repeats: 0 = forever, missing = once (no loop block in the file). */
  loops?: number;
  /** Notes about anything odd (a cut-off file, a frame outside the picture). */
  notes: string[];
}

export const isGif = (b: Uint8Array): boolean => b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61;

/** The most pixels (width x height x frames) read, so a huge file can't fill the memory. */
export const GIF_MAX_PIXELS = 160_000_000;
export const GIF_MAX_FRAMES = 10000;

/** Browsers show a frame delay of 0 or 1 hundredths as a tenth of a second; so do we. */
export const gifDelayMs = (centis: number): number => (centis <= 1 ? 100 : centis * 10);

/** Reads the picture data of one frame: LZW codes of `minBits` start size, as a list of colour indexes. */
function lzw(data: Uint8Array, minBits: number, count: number): { out: Uint8Array; complete: boolean } {
  const out = new Uint8Array(count);
  if (minBits < 1 || minBits > 11) return { out, complete: false };
  const clear = 1 << minBits;
  const end = clear + 1;
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  for (let i = 0; i < clear; i++) {
    suffix[i] = i;
    prefix[i] = -1;
  }
  let size = minBits + 1;
  let next = end + 1;
  let prev = -1;
  let pos = 0;
  let bits = 0;
  let acc = 0;
  let at = 0;
  const stack = new Uint8Array(4097);
  while (pos < count) {
    while (bits < size && at < data.length) {
      acc |= data[at++] << bits;
      bits += 8;
    }
    if (bits < size) return { out, complete: false };
    const code = acc & ((1 << size) - 1);
    acc >>>= size;
    bits -= size;
    if (code === clear) {
      size = minBits + 1;
      next = end + 1;
      prev = -1;
      continue;
    }
    if (code === end) break;
    let cur = code;
    let sp = 0;
    if (prev === -1) {
      if (code >= clear) return { out, complete: false };
      out[pos++] = suffix[code];
      prev = code;
      continue;
    }
    if (code >= next) {
      // The code being built right now: the previous string plus its own first letter.
      if (code > next) return { out, complete: false };
      stack[sp++] = 0;
      cur = prev;
    }
    while (cur >= clear) {
      stack[sp++] = suffix[cur];
      cur = prefix[cur];
    }
    const first = suffix[cur];
    stack[sp++] = first;
    if (code >= next) stack[0] = first;
    while (sp > 0 && pos < count) out[pos++] = stack[--sp];
    if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = first;
      next++;
      if (next === 1 << size && size < 12) size++;
    }
    prev = code;
  }
  return { out, complete: pos >= count };
}

/** Pixel rows of an interlaced frame come in four passes; this is where each stored row belongs. */
function interlaceRows(h: number): number[] {
  const rows: number[] = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y);
  return rows;
}

export function decodeGif(bytes: Uint8Array): GifPicture {
  if (!isGif(bytes)) throw new GifProblem('That is not a GIF picture.');
  let p = 6;
  const u16 = () => {
    const v = bytes[p] | (bytes[p + 1] << 8);
    p += 2;
    return v;
  };
  if (bytes.length < 13) throw new GifProblem('That GIF is cut off before its picture starts.');
  const width = u16();
  const height = u16();
  const flags = bytes[p++];
  p += 2; // background colour index and aspect ratio: transparent is what browsers show, so we do the same
  if (!width || !height) throw new GifProblem('That GIF has no size.');
  let global: Uint8Array | null = null;
  if (flags & 0x80) {
    const n = 3 * (1 << ((flags & 7) + 1));
    global = bytes.subarray(p, p + n);
    p += n;
  }

  const notes: string[] = [];
  const frames: GifFrame[] = [];
  const canvas = new Uint8ClampedArray(width * height * 4);
  let loops: number | undefined;
  // What the last frame asked for, done before the next one is drawn.
  let dispose = 0;
  let disposeRect = { x: 0, y: 0, w: 0, h: 0 };
  let saved: Uint8ClampedArray | null = null;
  // The extension just before a picture says its delay, transparent colour and disposal.
  let delay = 100;
  let transparent = -1;
  let method = 0;

  const subBlocks = (): Uint8Array => {
    const parts: Uint8Array[] = [];
    let total = 0;
    while (p < bytes.length) {
      const n = bytes[p++];
      if (n === 0) break;
      const part = bytes.subarray(p, Math.min(bytes.length, p + n));
      parts.push(part);
      total += part.length;
      p += n;
    }
    const all = new Uint8Array(total);
    let o = 0;
    for (const part of parts) {
      all.set(part, o);
      o += part.length;
    }
    return all;
  };

  let cut = false;
  loop: while (p < bytes.length) {
    const b = bytes[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = bytes[p++];
      if (label === 0xf9) {
        const data = subBlocks();
        if (data.length >= 4) {
          method = (data[0] >> 2) & 7;
          delay = gifDelayMs(data[1] | (data[2] << 8));
          transparent = data[0] & 1 ? data[3] : -1;
        }
      } else if (label === 0xff) {
        // The loop count: "NETSCAPE2.0" and then a block that starts with 1 and the count.
        const head = bytes.subarray(p + 1, p + 1 + bytes[p]);
        p += 1 + bytes[p];
        const text = String.fromCharCode(...head);
        const data = subBlocks();
        if (/^(NETSCAPE2\.0|ANIMEXTS1\.0)$/.test(text) && data.length >= 3 && data[0] === 1) loops = data[1] | (data[2] << 8);
      } else subBlocks();
      continue;
    }
    if (b !== 0x2c) {
      // Not a block we know: the file is damaged from here on.
      cut = true;
      break;
    }
    if (p + 9 > bytes.length) {
      cut = true;
      break;
    }
    const left = u16();
    const top = u16();
    const w = u16();
    const h = u16();
    const fl = bytes[p++];
    let table = global;
    if (fl & 0x80) {
      const n = 3 * (1 << ((fl & 7) + 1));
      table = bytes.subarray(p, p + n);
      p += n;
    }
    const minBits = bytes[p++];
    const data = subBlocks();
    if (!table) throw new GifProblem('That GIF has no colours.');
    if (frames.length >= GIF_MAX_FRAMES || (frames.length + 1) * width * height > GIF_MAX_PIXELS) {
      notes.push(`Only the first ${frames.length} frames were read; the file is bigger than Frameling reads in one go.`);
      break loop;
    }
    const { out, complete } = lzw(data, minBits, w * h);
    if (!complete && !out.some((v) => v)) {
      cut = true;
      break;
    }
    if (!complete) cut = true;

    // First, what the frame before asked for.
    if (frames.length) {
      if (dispose === 2) {
        for (let y = disposeRect.y; y < disposeRect.y + disposeRect.h; y++) {
          if (y < 0 || y >= height) continue;
          for (let x = Math.max(0, disposeRect.x); x < Math.min(width, disposeRect.x + disposeRect.w); x++) {
            const o = (y * width + x) * 4;
            canvas[o] = canvas[o + 1] = canvas[o + 2] = canvas[o + 3] = 0;
          }
        }
      } else if (dispose === 3 && saved) canvas.set(saved);
    }
    saved = method === 3 ? new Uint8ClampedArray(canvas) : null;

    const rows = fl & 0x40 ? interlaceRows(h) : null;
    for (let row = 0; row < h; row++) {
      const y = top + (rows ? rows[row] : row);
      if (y >= height) continue;
      for (let col = 0; col < w; col++) {
        const x = left + col;
        if (x >= width) continue;
        const idx = out[row * w + col];
        if (idx === transparent) continue;
        const o = (y * width + x) * 4;
        const c = idx * 3;
        if (c + 2 >= table.length) continue;
        canvas[o] = table[c];
        canvas[o + 1] = table[c + 1];
        canvas[o + 2] = table[c + 2];
        canvas[o + 3] = 255;
      }
    }
    if (left + w > width || top + h > height) notes.push('A frame reaches outside the picture; the part outside was cut off.');
    frames.push({ pixels: new Uint8ClampedArray(canvas), delay });
    dispose = method;
    disposeRect = { x: left, y: top, w, h };
    // The extension only applies to the picture right after it.
    delay = 100;
    transparent = -1;
    method = 0;
    if (cut) break;
  }
  if (!frames.length) throw new GifProblem('That GIF has no pictures in it.');
  if (cut) notes.push('The file ends early, so the last part of the animation is missing.');
  return { width, height, frames, ...(loops !== undefined ? { loops } : {}), notes: [...new Set(notes)] };
}
