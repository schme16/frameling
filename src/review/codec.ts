// The wire codec for live review: a message made of plain data and typed arrays becomes bytes, and back.
//
//   [4 bytes: header length][header: JSON][blobs, one after another]
//
// Every typed array (pixels, tile cells, a picture's bytes) is lifted out of the JSON and put in the blob part, so the
// JSON stays small and the bytes are not turned into text. The whole thing is then compressed by the caller (in the main
// process, off the drawing window), and pixels compress well.
//
// The one clever part is a pixel layer's finished stroke. A pixel edit replaces the whole array, so its patch holds the
// whole picture, and sending that for every stroke would be megabytes. Instead the encoder keeps a copy of what the other
// end has (`shadow`) and, when a replaced array is the same size as the one it replaces, sends only the changed rectangle
// (the same idea src/core/historyFile.ts uses to keep a step small in a file). The decoder keeps the same copy and puts the
// rectangle on a copy of its array. Both copies follow one ordered stream, so they cannot disagree; a reviewer that falls
// behind is sent a whole drawing and starts a new copy.
//
// No Node, no Electron, no store: immer's applyPatches is the only thing used, to follow the drawing along.
import { applyPatches, enablePatches, type Patch } from 'immer';
import type { Doc } from '../core/format';

enablePatches();

type TypedArray = Uint8Array | Uint8ClampedArray | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array | Float64Array;

const KINDS = {
  u8: Uint8Array,
  c8: Uint8ClampedArray,
  i8: Int8Array,
  u16: Uint16Array,
  i16: Int16Array,
  u32: Uint32Array,
  i32: Int32Array,
  f32: Float32Array,
  f64: Float64Array,
} as const;
type Kind = keyof typeof KINDS;

function kindOf(v: unknown): Kind | null {
  for (const k of Object.keys(KINDS) as Kind[]) if (v instanceof KINDS[k]) return k;
  return null;
}

const bytesOf = (a: TypedArray): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** The least change worth sending as a rectangle: below this the whole array is just sent. */
const MIN_ARRAY = 4096;
/** When the changed rectangle is more than this share of the array, the whole array is sent (it is not worth the trouble). */
const RECT_SHARE = 0.6;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** The most a single message may be once decoded, so a hostile peer cannot ask for the whole memory. */
export const MAX_MESSAGE_BYTES = 512 * 1024 * 1024;

// ------------------------------------------------------------------------------------------------- rectangles

export interface ByteRect {
  /** Bytes from the left of a row, and how many. */
  x: number;
  w: number;
  y: number;
  h: number;
}

/** The smallest rectangle (rows by bytes of a row) that holds every byte that differs, or null when none does. Pure. */
export function changedRect(prev: Uint8Array, next: Uint8Array, stride: number): ByteRect | null {
  if (prev.length !== next.length || stride <= 0 || next.length % stride) return null;
  const rows = next.length / stride;
  let top = -1;
  let bottom = -1;
  let left = stride;
  let right = -1;
  for (let y = 0; y < rows; y++) {
    const o = y * stride;
    // Find the first and last difference in this row; most rows are equal and the scan ends quickly on those.
    let a = -1;
    for (let i = 0; i < stride; i++)
      if (prev[o + i] !== next[o + i]) {
        a = i;
        break;
      }
    if (a < 0) continue;
    let b = stride - 1;
    while (prev[o + b] === next[o + b]) b--;
    if (top < 0) top = y;
    bottom = y;
    if (a < left) left = a;
    if (b > right) right = b;
  }
  return top < 0 ? null : { x: left, w: right - left + 1, y: top, h: bottom - top + 1 };
}

/** The bytes of a rectangle, row after row. */
export function cutRect(a: Uint8Array, stride: number, r: ByteRect): Uint8Array {
  const out = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) out.set(a.subarray((r.y + y) * stride + r.x, (r.y + y) * stride + r.x + r.w), y * r.w);
  return out;
}

/** A copy of `base` with a rectangle written over it. */
export function pasteRect(base: TypedArray, stride: number, r: ByteRect, bytes: Uint8Array): TypedArray {
  const copy = base.slice() as TypedArray;
  const out = bytesOf(copy);
  for (let y = 0; y < r.h; y++) out.set(bytes.subarray(y * r.w, (y + 1) * r.w), (r.y + y) * stride + r.x);
  return copy;
}

/** How wide a row of this array is in bytes, from the object that holds it (a pixel block or a tile map), or 0 when that is not known. */
function strideOf(parent: unknown, key: string, a: TypedArray): number {
  if (typeof parent !== 'object' || parent === null) return 0;
  const p = parent as Record<string, unknown>;
  if (key === 'pixels' && typeof p.width === 'number' && typeof p.height === 'number' && a.byteLength === p.width * p.height * 4) return p.width * 4;
  if (key === 'cells' && typeof p.columns === 'number' && typeof p.rows === 'number' && a.byteLength === p.columns * p.rows * 4) return p.columns * 4;
  return 0;
}

function walk(root: unknown, path: readonly (string | number)[]): { parent: unknown; value: unknown } | null {
  let cur: unknown = root;
  let parent: unknown = null;
  for (const k of path) {
    if (typeof cur !== 'object' || cur === null) return null;
    parent = cur;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return { parent, value: cur };
}

// ------------------------------------------------------------------------------------------------- the codec

const TA = '__ta';
const PX = '__px';

interface Blobs {
  parts: Uint8Array[];
  size: number;
}

function put(b: Blobs, a: TypedArray): { o: number; n: number } {
  const bytes = bytesOf(a);
  const o = b.size;
  b.parts.push(bytes);
  b.size += bytes.byteLength;
  return { o, n: bytes.byteLength };
}

function pack(msg: unknown): Uint8Array {
  const blobs: Blobs = { parts: [], size: 0 };
  const json = JSON.stringify(msg, (_k, v: unknown) => {
    const kind = kindOf(v);
    if (kind) return { [TA]: kind, ...put(blobs, v as TypedArray) };
    return v;
  });
  const head = enc.encode(json);
  const out = new Uint8Array(4 + head.byteLength + blobs.size);
  new DataView(out.buffer).setUint32(0, head.byteLength);
  out.set(head, 4);
  let at = 4 + head.byteLength;
  for (const p of blobs.parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** A message of plain data (and typed arrays) with nothing to follow: what a reviewer sends. */
export const decodePlain = (bytes: Uint8Array): unknown => unpack(bytes);

/** The same, for a message made by `encodePlain`. */
export const encodePlain = (msg: unknown): Uint8Array => pack(msg);

function unpack(bytes: Uint8Array): unknown {
  if (bytes.byteLength < 4 || bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error('bad message');
  const hl = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (hl > bytes.byteLength - 4) throw new Error('bad message');
  const base = 4 + hl;
  const body = new Uint8Array(bytes.buffer, bytes.byteOffset + base, bytes.byteLength - base);
  return JSON.parse(dec.decode(bytes.subarray(4, base)), (_k, v: unknown) => {
    if (typeof v !== 'object' || v === null || !(TA in v)) return v;
    const t = v as { [TA]: string; o: number; n: number };
    const K = KINDS[t[TA] as Kind];
    if (!K || !Number.isInteger(t.o) || !Number.isInteger(t.n) || t.o < 0 || t.n < 0 || t.o + t.n > body.byteLength || t.n % K.BYTES_PER_ELEMENT) throw new Error('bad array');
    // A copy, so the array owns an aligned buffer of its own.
    return new K(body.slice(t.o, t.o + t.n).buffer);
  });
}

interface PxValue {
  [PX]: { x: number; w: number; y: number; h: number; stride: number; kind: Kind; bytes: Uint8Array };
}

const isPx = (v: unknown): v is PxValue => typeof v === 'object' && v !== null && PX in v;

/** Makes messages into bytes, keeping a copy of the drawing the other end has so a pixel edit can go as a rectangle. */
export class Encoder {
  private shadow: Doc | null = null;
  /** Bytes saved by rectangles, and how many arrays went as one (for the numbers in the notes). */
  rects = 0;
  rectBytesSaved = 0;

  /** Forgets the copy: the next whole drawing starts a new one. */
  reset(): void {
    this.shadow = null;
  }

  encode(msg: { t: string; [k: string]: unknown }): Uint8Array {
    if (msg.t === 'doc') {
      this.shadow = msg.doc as Doc;
      return pack(msg);
    }
    if (msg.t !== 'patch' || !this.shadow) return pack(msg);
    const patches = msg.patches as Patch[];
    const sent = patches.map((p) => this.slim(p));
    const out = pack({ ...msg, patches: sent });
    try {
      this.shadow = applyPatches(this.shadow, patches);
    } catch {
      // A patch the copy cannot follow: the next message cannot be a rectangle.
      this.shadow = null;
    }
    return out;
  }

  /** A patch with a rectangle in place of a big array, when that is smaller. */
  private slim(p: Patch): Patch {
    if (p.op !== 'replace' || !this.shadow) return p;
    const kind = kindOf(p.value);
    if (!kind) return p;
    const next = p.value as TypedArray;
    if (next.byteLength < MIN_ARRAY) return p;
    const at = walk(this.shadow, p.path);
    if (!at || kindOf(at.value) !== kind) return p;
    const prev = at.value as TypedArray;
    const key = String(p.path[p.path.length - 1]);
    const stride = strideOf(at.parent, key, next);
    if (!stride || prev.byteLength !== next.byteLength) return p;
    const r = changedRect(bytesOf(prev), bytesOf(next), stride);
    // Nothing differs: an empty rectangle says so.
    if (!r) return { ...p, value: { [PX]: { x: 0, w: 0, y: 0, h: 0, stride, kind, bytes: new Uint8Array(0) } } };
    if (r.w * r.h > next.byteLength * RECT_SHARE) return p;
    const bytes = cutRect(bytesOf(next), stride, r);
    this.rects++;
    this.rectBytesSaved += next.byteLength - bytes.byteLength;
    return { ...p, value: { [PX]: { ...r, stride, kind, bytes } } };
  }
}

/** Reads bytes back into messages, keeping the same copy of the drawing so rectangles can be put back on their arrays. */
export class Decoder {
  private shadow: Doc | null = null;

  reset(): void {
    this.shadow = null;
  }

  /** Throws when the bytes are not a message, or a rectangle has nothing to go on (the caller asks for the whole drawing). */
  decode(bytes: Uint8Array): { t: string; [k: string]: unknown } {
    const m = unpack(bytes) as { t?: unknown; [k: string]: unknown };
    if (typeof m !== 'object' || m === null || typeof m.t !== 'string') throw new Error('not a message');
    if (m.t === 'doc') {
      this.shadow = m.doc as Doc;
      return m as { t: string };
    }
    if (m.t === 'patch') {
      if (!this.shadow || !Array.isArray(m.patches)) throw new Error('no drawing to follow');
      const patches = (m.patches as Patch[]).map((p) => this.fill(p));
      this.shadow = applyPatches(this.shadow, patches);
      return { ...m, patches } as { t: string };
    }
    return m as { t: string };
  }

  private fill(p: Patch): Patch {
    if (p.op !== 'replace' || !isPx(p.value) || !this.shadow) return p;
    const px = p.value[PX];
    const K = KINDS[px.kind];
    const at = walk(this.shadow, p.path);
    if (!K || !at || !(at.value instanceof K)) throw new Error('nothing to put the rectangle on');
    const base = at.value as TypedArray;
    if (px.w === 0 || px.h === 0) return { ...p, value: base };
    const stride = px.stride;
    if (!(stride > 0) || base.byteLength % stride || px.x + px.w > stride || px.y + px.h > base.byteLength / stride || px.bytes.byteLength !== px.w * px.h) throw new Error('rectangle does not fit');
    return { ...p, value: pasteRect(base, stride, px, px.bytes) };
  }
}
