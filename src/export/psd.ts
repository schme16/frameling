/**
 * A small layered PSD writer: 8-bit RGB, one PSD layer per Frameling layer with its name, opacity, blend mode,
 * visibility and clipping, folders as PSD groups (with a group mask where the folder has a mask layer), and the
 * flattened picture for apps that only read that. Channels are RLE (PackBits) compressed. Pure: pixels come in.
 *
 * Layout follows Adobe's "Photoshop File Formats Specification": header, colour mode data, image resources, layer and
 * mask information, merged image data. Layer records go bottom first; a group is a "section divider" record under
 * its layers and the group's own record above them.
 */
import type { BlendMode } from '../core/format';
import type { RawImage } from '../io/png';

export type PsdBlend = BlendMode | 'pass';

/** One record, bottom first. A group is { group: 'end' } ... layers ... { group: 'open', name, ... }. */
export interface PsdLayer {
  name: string;
  /** Full canvas size RGBA (straight alpha). Missing for group records. */
  image?: RawImage;
  opacity: number;
  blend: PsdBlend;
  hidden?: boolean;
  /** Clipped to the layer below (a clipping mask). */
  clipping?: boolean;
  group?: 'open' | 'closed' | 'end';
  /** A layer mask, full canvas size, one byte per pixel (255 shows). */
  mask?: Uint8Array;
}

const BLEND_KEYS: Record<PsdBlend, string> = {
  pass: 'pass',
  normal: 'norm',
  multiply: 'mul ',
  screen: 'scrn',
  overlay: 'over',
  darken: 'dark',
  lighten: 'lite',
  'color-dodge': 'div ',
  'color-burn': 'idiv',
  'hard-light': 'hLit',
  'soft-light': 'sLit',
  difference: 'diff',
  exclusion: 'smud',
  hue: 'hue ',
  saturation: 'sat ',
  color: 'colr',
  luminosity: 'lum ',
  add: 'lddg',
  'linear-dodge': 'lddg',
  subtract: 'fsub',
  divide: 'fdiv',
};

export function blendKey(b: PsdBlend | undefined): string {
  return BLEND_KEYS[b ?? 'normal'] ?? 'norm';
}

class Out {
  private chunks: Uint8Array[] = [];
  private cur = new Uint8Array(1 << 16);
  private n = 0;
  length = 0;
  private room(k: number) {
    if (this.n + k > this.cur.length) {
      this.chunks.push(this.cur.subarray(0, this.n));
      this.cur = new Uint8Array(Math.max(1 << 16, k));
      this.n = 0;
    }
  }
  u8(v: number) {
    this.room(1);
    this.cur[this.n++] = v & 255;
    this.length++;
  }
  u16(v: number) {
    this.u8(v >>> 8);
    this.u8(v);
  }
  i16(v: number) {
    this.u16(v & 0xffff);
  }
  u32(v: number) {
    this.u16((v >>> 16) & 0xffff);
    this.u16(v & 0xffff);
  }
  i32(v: number) {
    this.u32(v >>> 0);
  }
  sig(s: string) {
    for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i));
  }
  bytes(b: Uint8Array) {
    if (b.length > 4096) {
      this.chunks.push(this.cur.subarray(0, this.n));
      this.chunks.push(b);
      this.cur = new Uint8Array(1 << 16);
      this.n = 0;
      this.length += b.length;
      return;
    }
    this.room(b.length);
    this.cur.set(b, this.n);
    this.n += b.length;
    this.length += b.length;
  }
  finish(): Uint8Array {
    this.chunks.push(this.cur.subarray(0, this.n));
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

/** PackBits one row. */
export function packBits(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  const n = row.length;
  while (i < n) {
    // A run of the same byte?
    let r = 1;
    while (i + r < n && r < 128 && row[i + r] === row[i]) r++;
    if (r >= 3) {
      out.push(257 - r, row[i]);
      i += r;
      continue;
    }
    // Literal bytes until a run of 3 starts.
    const start = i;
    let len = 0;
    while (i < n && len < 128) {
      if (i + 2 < n && row[i] === row[i + 1] && row[i] === row[i + 2]) break;
      i++;
      len++;
    }
    out.push(len - 1);
    for (let k = start; k < start + len; k++) out.push(row[k]);
  }
  return Uint8Array.from(out);
}

/** One plane as RLE: the row byte counts, then the packed rows. */
function rlePlane(plane: Uint8Array, w: number, h: number): { counts: number[]; data: Uint8Array[] } {
  const counts: number[] = [];
  const data: Uint8Array[] = [];
  for (let y = 0; y < h; y++) {
    const p = packBits(plane.subarray(y * w, y * w + w));
    counts.push(p.length);
    data.push(p);
  }
  return { counts, data };
}

interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** The box of pixels with any alpha (an empty layer gets an empty box). */
export function opaqueBounds(img: RawImage): Rect {
  const { width: w, height: h, pixels: p } = img;
  let top = h;
  let left = w;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++)
      if (p[row + x * 4 + 3]) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
  }
  if (bottom < 0) return { top: 0, left: 0, bottom: 0, right: 0 };
  return { top, left, bottom: bottom + 1, right: right + 1 };
}

function cropPlane(img: RawImage, r: Rect, ch: number): Uint8Array {
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = ((r.top + y) * img.width + r.left) * 4 + ch;
    for (let x = 0; x < w; x++) out[y * w + x] = img.pixels[src + x * 4];
  }
  return out;
}

function cropMask(mask: Uint8Array, cw: number, r: Rect): Uint8Array {
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) out.set(mask.subarray((r.top + y) * cw + r.left, (r.top + y) * cw + r.left + w), y * w);
  return out;
}

/** Bytes of a channel ready to write: compression 1 (RLE) + counts + rows. */
function channelBytes(plane: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Out();
  o.u16(1);
  if (w > 0 && h > 0) {
    const { counts, data } = rlePlane(plane, w, h);
    for (const c of counts) o.u16(c);
    for (const d of data) o.bytes(d);
  }
  return o.finish();
}

function pascalName(o: Out, name: string): void {
  // Old style names are MacRoman; keep ASCII, the 'luni' block carries the real name.
  const ascii = [...name].map((c) => (c.charCodeAt(0) < 128 ? c : '_')).join('').slice(0, 255);
  o.u8(ascii.length);
  for (let i = 0; i < ascii.length; i++) o.u8(ascii.charCodeAt(i));
  const total = 1 + ascii.length;
  for (let i = total; i % 4; i++) o.u8(0);
}

function unicodeBlock(o: Out, name: string): void {
  const len = 4 + name.length * 2;
  const padded = len + (len % 4 ? 4 - (len % 4) : 0);
  o.sig('8BIM');
  o.sig('luni');
  o.u32(padded);
  o.u32(name.length);
  for (let i = 0; i < name.length; i++) o.u16(name.charCodeAt(i));
  for (let i = len; i < padded; i++) o.u8(0);
}

export function writePsd(width: number, height: number, layers: PsdLayer[], merged: RawImage): Uint8Array {
  const o = new Out();
  // Header.
  o.sig('8BPS');
  o.u16(1);
  for (let i = 0; i < 6; i++) o.u8(0);
  o.u16(4);
  o.u32(height);
  o.u32(width);
  o.u16(8);
  o.u16(3);
  // Colour mode data, image resources: none.
  o.u32(0);
  o.u32(0);

  // Layer info, built apart so its length is known.
  const li = new Out();
  li.i16(-layers.length); // negative: the merged image's first alpha channel is its transparency
  const channelData: Uint8Array[] = [];
  for (const l of layers) {
    const isGroup = !!l.group;
    const r = l.image && !isGroup ? opaqueBounds(l.image) : { top: 0, left: 0, bottom: 0, right: 0 };
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    const chans: { id: number; bytes: Uint8Array }[] = [];
    for (const [id, ch] of [
      [-1, 3],
      [0, 0],
      [1, 1],
      [2, 2],
    ] as const) {
      const plane = l.image && w > 0 ? cropPlane(l.image, r, ch) : new Uint8Array(0);
      chans.push({ id, bytes: channelBytes(plane, w, h) });
    }
    let maskRect: Rect | null = null;
    if (l.mask) {
      maskRect = { top: 0, left: 0, bottom: height, right: width };
      chans.push({ id: -2, bytes: channelBytes(cropMask(l.mask, width, maskRect), width, height) });
    }
    li.i32(r.top);
    li.i32(r.left);
    li.i32(r.bottom);
    li.i32(r.right);
    li.u16(chans.length);
    for (const c of chans) {
      li.i16(c.id);
      li.u32(c.bytes.length);
    }
    li.sig('8BIM');
    li.sig(l.group === 'end' ? 'norm' : blendKey(!l.group && l.blend === 'pass' ? 'normal' : l.blend));
    li.u8(Math.round(Math.max(0, Math.min(1, l.opacity)) * 255));
    li.u8(l.clipping ? 1 : 0);
    li.u8(l.hidden ? 0x02 : 0);
    li.u8(0);
    const extra = new Out();
    if (maskRect) {
      extra.u32(20);
      extra.i32(maskRect.top);
      extra.i32(maskRect.left);
      extra.i32(maskRect.bottom);
      extra.i32(maskRect.right);
      extra.u8(0); // default colour outside the mask rect: hidden
      extra.u8(0); // flags
      extra.u16(0);
    } else extra.u32(0);
    extra.u32(0); // blending ranges
    const name = l.group === 'end' ? '</Layer group>' : l.name;
    pascalName(extra, name);
    unicodeBlock(extra, name);
    if (l.group) {
      extra.sig('8BIM');
      extra.sig('lsct');
      if (l.group === 'end') {
        extra.u32(4);
        extra.u32(3);
      } else {
        extra.u32(12);
        extra.u32(l.group === 'open' ? 1 : 2);
        extra.sig('8BIM');
        extra.sig(blendKey(l.blend));
      }
    }
    const eb = extra.finish();
    li.u32(eb.length);
    li.bytes(eb);
    for (const c of chans) channelData.push(c.bytes);
  }
  for (const c of channelData) li.bytes(c);
  let liBytes = li.finish();
  if (liBytes.length % 4) {
    const padded = new Uint8Array(liBytes.length + (4 - (liBytes.length % 4)));
    padded.set(liBytes);
    liBytes = padded;
  }
  // Layer and mask information: layer info, then an empty global mask info.
  o.u32(4 + liBytes.length + 4);
  o.u32(liBytes.length);
  o.bytes(liBytes);
  o.u32(0);

  // Merged image: RLE, every row count first (R, G, B, A planes), then the rows. Photoshop keeps the merged colours
  // blended onto white where they're see-through (readers that ignore alpha still show it right; Photoshop and
  // ImageMagick take the white back out), so they're stored that way here too.
  o.u16(1);
  const matted = matteWhite(merged);
  const planes = [0, 1, 2, 3].map((ch) => rlePlane(cropPlane(matted, { top: 0, left: 0, bottom: height, right: width }, ch), width, height));
  for (const p of planes) for (const c of p.counts) o.u16(c);
  for (const p of planes) for (const d of p.data) o.bytes(d);
  return o.finish();
}

/** Colours blended onto white by their alpha (alpha kept), the way Photoshop stores the merged picture. */
export function matteWhite(img: RawImage): RawImage {
  const p = img.pixels;
  const out = new Uint8ClampedArray(p.length);
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3] / 255;
    out[i] = p[i] * a + 255 * (1 - a);
    out[i + 1] = p[i + 1] * a + 255 * (1 - a);
    out[i + 2] = p[i + 2] * a + 255 * (1 - a);
    out[i + 3] = p[i + 3];
  }
  return { width: img.width, height: img.height, pixels: out };
}
