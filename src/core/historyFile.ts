/**
 * Undo and redo steps inside a file, so whoever opens the drawing next can step back through them.
 *
 * A step is two lists of immer patches (what it did, and how to take it back). Vector steps are small and go in as they
 * are. A pixel edit replaces a drawing's whole pixel block, which would put the whole picture in the file twice for one
 * stroke, so a step that only changed pixel drawings stores the RECTANGLE that changed (the before and after pixels of
 * just that part) and the block sizes either side. Reading works the rest out from the drawing as it is now: the
 * pixels outside the rectangle are the same before and after, so they are copied from the side we already have.
 *
 * Layout in the file (see `DocHistory` in format.ts): `history/steps.json` holds the steps, `history/data.bin` holds every
 * typed array they refer to. A cap in bytes keeps the newest steps and drops the oldest, so history can never make a
 * file enormous. Plain data and immer only: no DOM.
 */
import { applyPatches, produceWithPatches, type Patch } from 'immer';
import type { Doc, DocHistory, PixelDrawing } from './format';
import { HISTORY_BYTES, historyStepsNow, runStep, weighPatches, type HistoryEntry, type RestoredHistory, type RestoredStep } from './store';

/**
 * The most a file's history may hold, measured as the steps' text plus their pixel bytes before the file is zipped.
 * 16 MB: about fifty big strokes on a large pixel drawing (each stores only its own rectangle, both sides), or the whole
 * 300 step history of a vector drawing many times over (vector steps are a few KB). Zipping shrinks pixel data a lot, so
 * the file grows by a few MB at most in practice. The in-memory cap (HISTORY_BYTES) is 192 MB, which a file must never reach.
 */
export const FILE_HISTORY_BYTES = 16 * 1024 * 1024;
/** Redo steps may take this share of the cap, so a long undone run can't push out the undo side. */
const REDO_SHARE = 0.25;
const ALWAYS_KEEP = 10;

export const HISTORY_STEPS_ENTRY = 'history/steps.json';
export const HISTORY_DATA_ENTRY = 'history/data.bin';

const MAX_STEPS = 5000;
const MAX_BLOCK_PIXELS = 1 << 26;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A drawing's held block (x and y left out when the drawing has none). */
interface Block {
  x?: number;
  y?: number;
  w: number;
  h: number;
}
/** Bytes in the step's data: offset and length. */
type Ref = [number, number];

/** What one pixel drawing did in one step: its block before and after, and the rectangle whose pixels changed. */
interface PixelChange {
  id: string;
  b: Block;
  a: Block;
  /** The changed rectangle, in art pixels. Missing when only the block's size or place changed. */
  c?: Rect;
  /** The pixels in `c` before the step and after it. */
  pb?: Ref;
  pa?: Ref;
}

interface StepRecord {
  l: string;
  at: number;
  p: unknown[];
  i: unknown[];
  px?: PixelChange[];
  /** A look at another artboard, not an edit: kept so the steps around it still fit, but never shown. */
  view?: true;
  /** Where this step's bytes start in data.bin, and how long they are. */
  o: number;
  n: number;
}

interface StepsFile {
  v: 1;
  undo: StepRecord[];
  redo: StepRecord[];
}

const PIXEL_KEYS = new Set(['pixels', 'width', 'height', 'x', 'y']);
const BIN = '$bin';

// ---------------------------------------------------------------- bytes in steps

const KINDS: Record<string, { make: new (b: ArrayBuffer) => ArrayBufferView; size: number }> = {
  u8c: { make: Uint8ClampedArray, size: 1 },
  u8: { make: Uint8Array, size: 1 },
  i8: { make: Int8Array, size: 1 },
  u16: { make: Uint16Array, size: 2 },
  i16: { make: Int16Array, size: 2 },
  u32: { make: Uint32Array, size: 4 },
  i32: { make: Int32Array, size: 4 },
  f32: { make: Float32Array, size: 4 },
  f64: { make: Float64Array, size: 8 },
};
const kindOf = (v: ArrayBufferView): string => {
  for (const [k, c] of Object.entries(KINDS)) if (v.constructor === c.make) return k;
  throw new Error('history: a kind of array the file cannot hold');
};

/** The bytes one step holds beyond its text. */
class Bytes {
  private parts: Uint8Array[] = [];
  size = 0;
  add(view: ArrayBufferView): Ref {
    const at = this.size;
    const part = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    this.parts.push(part);
    this.size += part.length;
    return [at, part.length];
  }
  join(): Uint8Array {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Patch values as plain JSON: a typed array becomes `{ "$bin": [offset, length, kind] }` into the step's bytes. */
function pack(v: unknown, bytes: Bytes, depth = 0): unknown {
  if (depth > 40) throw new Error('history: too deep');
  if (ArrayBuffer.isView(v)) return { [BIN]: [...bytes.add(v), kindOf(v)] };
  if (Array.isArray(v)) return v.map((x) => pack(x, bytes, depth + 1));
  if (isObj(v)) {
    if (BIN in v) throw new Error('history: a value uses the key the file keeps for bytes');
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = pack(x, bytes, depth + 1);
    return out;
  }
  return v;
}

function unpack(v: unknown, data: Uint8Array, depth = 0): unknown {
  if (depth > 40) throw new Error('history: too deep');
  if (Array.isArray(v)) return v.map((x) => unpack(x, data, depth + 1));
  if (!isObj(v)) return v;
  if (BIN in v) {
    const r = v[BIN];
    const kind = Array.isArray(r) ? KINDS[String(r[2])] : undefined;
    if (!Array.isArray(r) || !kind || !Number.isInteger(r[0]) || !Number.isInteger(r[1]) || (r[0] as number) < 0 || (r[1] as number) < 0 || (r[0] as number) + (r[1] as number) > data.length || (r[1] as number) % kind.size) throw new Error('history: bytes out of range');
    return new kind.make(data.slice(r[0] as number, (r[0] as number) + (r[1] as number)).buffer);
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = unpack(x, data, depth + 1);
  return out;
}

function bytesAt(data: Uint8Array, r: unknown, want: number): Uint8ClampedArray {
  if (!Array.isArray(r) || !Number.isInteger(r[0]) || !Number.isInteger(r[1]) || r[1] !== want || r[0] < 0 || r[0] + r[1] > data.length) throw new Error('history: pixels out of range');
  return new Uint8ClampedArray(data.slice(r[0], r[0] + r[1]).buffer);
}

// ---------------------------------------------------------------- rectangles of pixels

const blockOf = (d: PixelDrawing): Block => ({ ...(d.x !== undefined ? { x: d.x } : {}), ...(d.y !== undefined ? { y: d.y } : {}), w: d.width, h: d.height });
const rectOf = (b: Block): Rect => ({ x: b.x ?? 0, y: b.y ?? 0, w: b.w, h: b.h });
const drawingRectOf = (d: PixelDrawing): Rect => ({ x: d.x ?? 0, y: d.y ?? 0, w: d.width, h: d.height });
const empty = (r: Rect) => r.w <= 0 || r.h <= 0;
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

function union(a: Rect, b: Rect): Rect | null {
  if (empty(a)) return empty(b) ? null : b;
  if (empty(b)) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Copies the part of `src` (a block at `sr`) that falls inside `dst` (a block at `dr`). */
function copyOver(dst: Uint8ClampedArray, dr: Rect, src: Uint8ClampedArray, sr: Rect): void {
  if (empty(sr) || empty(dr)) return;
  if (src.length < sr.w * sr.h * 4) throw new Error('history: a drawing is shorter than its size says');
  const x0 = Math.max(dr.x, sr.x);
  const x1 = Math.min(dr.x + dr.w, sr.x + sr.w);
  const y0 = Math.max(dr.y, sr.y);
  const y1 = Math.min(dr.y + dr.h, sr.y + sr.h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) {
    const from = ((y - sr.y) * sr.w + (x0 - sr.x)) * 4;
    dst.set(src.subarray(from, from + (x1 - x0) * 4), ((y - dr.y) * dr.w + (x0 - dr.x)) * 4);
  }
}

/** A block of `r` filled from a drawing (see-through where the drawing holds nothing). */
function over(d: PixelDrawing, r: Rect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(Math.max(0, r.w * r.h) * 4);
  copyOver(out, r, d.pixels, drawingRectOf(d));
  return out;
}

/** The smallest rectangle (in `r`'s own coordinates) where two blocks of `r`'s size differ, or null when they match. */
function changedRect(a: Uint8ClampedArray, b: Uint8ClampedArray, r: Rect): Rect | null {
  const n = r.w * r.h;
  const fast = a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0;
  const A = fast ? new Uint32Array(a.buffer, a.byteOffset, n) : null;
  const B = fast ? new Uint32Array(b.buffer, b.byteOffset, n) : null;
  const same = (i: number) => (A && B ? A[i] === B[i] : a[i * 4] === b[i * 4] && a[i * 4 + 1] === b[i * 4 + 1] && a[i * 4 + 2] === b[i * 4 + 2] && a[i * 4 + 3] === b[i * 4 + 3]);
  let x0 = r.w;
  let x1 = -1;
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < r.h; y++) {
    const row = y * r.w;
    let first = -1;
    let last = -1;
    for (let x = 0; x < r.w; x++) {
      if (same(row + x)) continue;
      first = x;
      break;
    }
    if (first < 0) continue;
    for (let x = r.w - 1; x >= first; x--) {
      if (same(row + x)) continue;
      last = x;
      break;
    }
    if (y0 < 0) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  return y0 < 0 ? null : { x: r.x + x0, y: r.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** What one pixel drawing did, as a block either side and the rectangle that changed. Null when it ended up the same. */
function pixelChange(id: string, before: PixelDrawing, after: PixelDrawing, bytes: Bytes): PixelChange | null {
  const rb = drawingRectOf(before);
  const ra = drawingRectOf(after);
  const ch: PixelChange = { id, b: blockOf(before), a: blockOf(after) };
  const u = union(rb, ra);
  if (u) {
    // A side whose own block is already the union is read where it lies. Copying it out first cost two copies of every
    // drawing a step touched (hundreds of megabytes on a whole-document edit) before a single pixel was compared.
    const was = sameRect(rb, u) ? before.pixels : over(before, u);
    const now = sameRect(ra, u) ? after.pixels : over(after, u);
    const c = changedRect(was, now, u);
    if (c) {
      ch.c = c;
      const crop = (src: Uint8ClampedArray) => {
        const out = new Uint8ClampedArray(c.w * c.h * 4);
        copyOver(out, c, src, u);
        return out;
      };
      ch.pb = bytes.add(crop(was));
      ch.pa = bytes.add(crop(now));
    }
  }
  const same = !ch.c && sameRect(rb, ra) && JSON.stringify(ch.b) === JSON.stringify(ch.a);
  return same ? null : ch;
}

/** The pixels of one side of a change, worked out from the drawing as it is on the other (or this) side. */
function sidePixels(d: PixelDrawing, block: Block, own: boolean, c: Rect | undefined, cbytes: Uint8ClampedArray | undefined): Uint8ClampedArray {
  const r = rectOf(block);
  if (empty(r)) return new Uint8ClampedArray(0);
  // The side the drawing is on already holds exactly these pixels.
  if (own && sameRect(drawingRectOf(d), r)) return d.pixels;
  const out = over(d, r);
  if (c && cbytes) copyOver(out, r, cbytes, c);
  return out;
}

/**
 * Patches that make a drawing's block `to`, with these pixels. Every field is set, not just the ones that differ from `from`,
 * so it still lands right when the drawing in hand holds its block a little differently (an older file's border of
 * see-through pixels is trimmed when it opens).
 */
function turn(id: string, to: Block, pixels: Uint8ClampedArray): Patch[] {
  const base = ['drawings', id];
  const out: Patch[] = [
    { op: 'replace', path: [...base, 'width'], value: to.w },
    { op: 'replace', path: [...base, 'height'], value: to.h },
  ];
  for (const k of ['x', 'y'] as const) out.push(to[k] === undefined ? { op: 'remove', path: [...base, k] } : { op: 'replace', path: [...base, k], value: to[k] });
  out.push({ op: 'replace', path: [...base, 'pixels'], value: pixels });
  return out;
}

// ---------------------------------------------------------------- writing

interface Encoded {
  rec: Omit<StepRecord, 'o' | 'n'>;
  bytes: Uint8Array;
  /** Text plus bytes: what counts against the cap. */
  size: number;
}

/** A step's encoding, kept so saving again does not look at every pixel again. Checked against what the step holds now. */
const encoded = new WeakMap<HistoryEntry, { sig: string; enc: Encoded }>();

/**
 * A step already known to be bigger than the room it was offered, with how far its pixels had got when that became
 * plain. Nothing smaller will ever fit, so a later save with the same room or less stops there without looking at a
 * single pixel again.
 */
const tooBig = new WeakMap<HistoryEntry, { sig: string; atLeast: number }>();

/** `encodeStep` says this when the step cannot fit the room left: the walk stops rather than finish work it would throw away. */
const OVER = Symbol('over');
const sigOf = (e: HistoryEntry) => `${e.patches.length}:${e.inverse.length}:${e.at}:${e.label}:${e.view ? 1 : 0}:${e.rerun ? 1 : 0}`;

/** The pixel drawings a step only changed by replacing their block (and nothing else about them), where both sides have them. */
function diffable(e: HistoryEntry, before: Doc, after: Doc): Set<string> {
  const ok = new Map<string, boolean>();
  const note = (list: Patch[]) => {
    for (const p of list) {
      if (p.path[0] !== 'drawings' || p.path.length < 2) continue;
      const id = String(p.path[1]);
      ok.set(id, (ok.get(id) ?? true) && p.path.length === 3 && PIXEL_KEYS.has(String(p.path[2])));
    }
  };
  note(e.patches);
  note(e.inverse);
  const ids = new Set<string>();
  for (const [id, fine] of ok) if (fine && before.drawings[id]?.kind === 'pixel' && after.drawings[id]?.kind === 'pixel') ids.add(id);
  return ids;
}

/**
 * A step that memory holds as a recipe (a look at another artboard) goes in the file as the patches it makes on the
 * document it was made on, so the file's format stays what it always was and older versions can read it.
 */
function withPatches(e: HistoryEntry, before: Doc): HistoryEntry {
  if (!e.rerun) return e;
  const [, patches, inverse] = produceWithPatches(before, e.rerun.redo);
  return { ...e, patches, inverse, rerun: undefined };
}

/** What a step was encoded as last time, when it still holds what it did then. */
function cachedEncoding(e: HistoryEntry): Encoded | undefined {
  const hit = encoded.get(e);
  return hit && hit.sig === sigOf(e) ? hit.enc : undefined;
}

/**
 * One step as the file holds it, or `OVER` when its pixels alone pass `room` (the bytes the file has left for it).
 * A step over the cap is dropped by the walk anyway, and a whole-document edit (Recolour every frame, say) is hundreds
 * of megabytes of pixels, so finishing it is a third of a second of work thrown away. It stops as soon as the answer
 * is settled instead.
 */
function encodeStep(source: HistoryEntry, before: Doc, after: Doc, room = Infinity): Encoded | typeof OVER {
  const cached = cachedEncoding(source);
  if (cached) return cached;
  const sig = sigOf(source);
  const known = tooBig.get(source);
  if (known && known.sig === sig && known.atLeast > room) return OVER;
  const e = withPatches(source, before);
  const bytes = new Bytes();
  const ids = diffable(e, before, after);
  const px: PixelChange[] = [];
  for (const id of ids) {
    const ch = pixelChange(id, before.drawings[id] as PixelDrawing, after.drawings[id] as PixelDrawing, bytes);
    if (ch) px.push(ch);
    if (bytes.size > room) {
      tooBig.set(source, { sig, atLeast: bytes.size });
      return OVER;
    }
  }
  const keep = (p: Patch) => !(p.path[0] === 'drawings' && ids.has(String(p.path[1])));
  const rec = { l: e.label, at: e.at, ...(e.view ? { view: true as const } : {}), p: pack(e.patches.filter(keep), bytes) as unknown[], i: pack(e.inverse.filter(keep), bytes) as unknown[], ...(px.length ? { px } : {}) };
  const joined = bytes.join();
  const enc = { rec, bytes: joined, size: JSON.stringify(rec).length + joined.length };
  encoded.set(source, { sig, enc });
  return enc;
}

export interface HistorySource {
  /** The document as it is now. */
  doc: Doc;
  /** Oldest first. */
  undo: HistoryEntry[];
  /** The next step to redo is last. */
  redo: HistoryEntry[];
}

export interface HistorySaved {
  /** What goes in the zip, by entry name. */
  files: Record<string, Uint8Array>;
  /** For `doc.json`. */
  note: DocHistory;
  kept: { undo: number; redo: number };
  /** Steps left out to keep the file small. */
  dropped: number;
  /** Text and bytes before zipping. */
  bytes: number;
}

/** True when a document's history can go in a file as it stands: a symbol or variation being edited makes the steps refer to a view of it, not the file's drawing. */
export function historyFitsFile(doc: Doc): boolean {
  return !doc.editing?.length && !doc.artboards?.some((a) => a.variationOf);
}

/**
 * Walks a stack of steps from the newest one back (the redo stack's last step is its next one, the undo stack's last is
 * the latest) and encodes each, stopping once `limit` bytes are used. A step that can't be run stops the walk there.
 *
 * The document each step needs (the one either side of it) is worked out only when a step has to be encoded for the
 * first time. A step already encoded is taken from its cache and the document is left alone, since running every step
 * of a long history against a big drawing on every autosave held the page for hundreds of milliseconds. The steps that
 * were skipped are run later, in order, if an older step turns out to need the document.
 */
function walkSteps(list: HistoryEntry[], start: Doc, dir: 'undo' | 'redo', used: number, limit: number): { out: Encoded[]; used: number } {
  const out: Encoded[] = [];
  // The document as of the newest step not yet in `skipped`.
  let cur = start;
  const skipped: HistoryEntry[] = [];
  try {
    for (let k = list.length - 1; k >= 0; k--) {
      const e = list[k];
      let enc = cachedEncoding(e);
      if (!enc) {
        for (const q of skipped) cur = runStep(cur, q, dir).doc;
        skipped.length = 0;
        const next = runStep(cur, e, dir).doc;
        const room = limit - used;
        const made = dir === 'undo' ? encodeStep(e, next, cur, room) : encodeStep(e, cur, next, room);
        cur = next;
        if (made === OVER) break;
        enc = made;
      } else {
        skipped.push(e);
      }
      if (used + enc.size > limit) break;
      out.push(enc);
      used += enc.size;
    }
  } catch {
    // The steps from here on stay out.
  }
  return { out, used };
}

/**
 * The steps ready for the file, newest kept first and the oldest dropped once the cap is full. Null when there is nothing
 * to keep (or nothing fits). A step that can't be written stops there: it and everything older are left out, since a
 * step is no use without the ones after it.
 */
export function encodeHistory(src: HistorySource, cap = FILE_HISTORY_BYTES): HistorySaved | null {
  if (!historyFitsFile(src.doc)) return null;
  // Newest step first, redo then undo, sharing one byte budget.
  const redoWalk = walkSteps(src.redo, src.doc, 'redo', 0, cap * REDO_SHARE);
  const undoWalk = walkSteps(src.undo, src.doc, 'undo', redoWalk.used, cap);
  const redo = redoWalk.out;
  const undo = undoWalk.out;
  const used = undoWalk.used;
  undo.reverse();
  if (!undo.length && !redo.length) return null;
  let at = 0;
  const parts: Uint8Array[] = [];
  const record = (enc: Encoded): StepRecord => {
    const rec = { ...enc.rec, o: at, n: enc.bytes.length };
    at += enc.bytes.length;
    parts.push(enc.bytes);
    return rec;
  };
  const file: StepsFile = { v: 1, undo: undo.map(record), redo: redo.map(record) };
  const files: Record<string, Uint8Array> = { [HISTORY_STEPS_ENTRY]: new TextEncoder().encode(JSON.stringify(file)) };
  if (at) {
    const data = new Uint8Array(at);
    let o = 0;
    for (const p of parts) {
      data.set(p, o);
      o += p.length;
    }
    files[HISTORY_DATA_ENTRY] = data;
  }
  const dropped = src.undo.length - undo.length + (src.redo.length - redo.length);
  return { files, note: { v: 1, undo: undo.length, redo: redo.length, ...(dropped ? { dropped } : {}) }, kept: { undo: undo.length, redo: redo.length }, dropped, bytes: used };
}

// ---------------------------------------------------------------- reading

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function readBlock(v: unknown): Block {
  if (!isObj(v) || !int(v.w) || !int(v.h) || v.w < 0 || v.h < 0 || v.w * v.h > MAX_BLOCK_PIXELS) throw new Error('history: bad block');
  for (const k of ['x', 'y'] as const) if (v[k] !== undefined && !int(v[k])) throw new Error('history: bad block');
  return { ...(v.x !== undefined ? { x: v.x as number } : {}), ...(v.y !== undefined ? { y: v.y as number } : {}), w: v.w, h: v.h };
}

function readRect(v: unknown): Rect {
  if (!isObj(v) || !int(v.x) || !int(v.y) || !int(v.w) || !int(v.h) || v.w < 1 || v.h < 1 || v.w * v.h > MAX_BLOCK_PIXELS) throw new Error('history: bad rectangle');
  return { x: v.x, y: v.y, w: v.w, h: v.h };
}

function readPatches(v: unknown, data: Uint8Array): Patch[] {
  if (!Array.isArray(v)) throw new Error('history: bad patches');
  const list = unpack(v, data) as unknown[];
  for (const p of list) {
    if (!isObj(p) || (p.op !== 'add' && p.op !== 'remove' && p.op !== 'replace') || !Array.isArray(p.path)) throw new Error('history: bad patch');
    for (const seg of p.path) if ((typeof seg !== 'string' && !int(seg)) || seg === '__proto__' || seg === 'constructor' || seg === 'prototype') throw new Error('history: bad path');
  }
  return list as Patch[];
}

/**
 * One step as the file holds it, made into a step with its patches and inverse. `state` is the document on one side of
 * the step: `own` 'after' for a step Undo will take back, 'before' for one Redo will do again. Throws when the file's
 * step does not fit that document.
 */
function restore(rec: unknown, data: Uint8Array, state: Doc, own: 'after' | 'before'): RestoredStep {
  if (!isObj(rec) || typeof rec.l !== 'string' || !finite(rec.at) || !int(rec.o) || !int(rec.n) || rec.o < 0 || rec.n < 0 || rec.o + rec.n > data.length) throw new Error('history: bad step');
  const mine = data.subarray(rec.o, rec.o + rec.n);
  const patches = readPatches(rec.p, mine);
  const inverse = readPatches(rec.i, mine);
  if (rec.px !== undefined && !Array.isArray(rec.px)) throw new Error('history: bad pixels');
  for (const raw of (rec.px as unknown[] | undefined) ?? []) {
    if (!isObj(raw) || typeof raw.id !== 'string') throw new Error('history: bad pixel change');
    const d = state.drawings[raw.id];
    if (!d || d.kind !== 'pixel') throw new Error('history: that drawing is not here');
    const b = readBlock(raw.b);
    const a = readBlock(raw.a);
    const c = raw.c === undefined ? undefined : readRect(raw.c);
    const pb = c ? bytesAt(mine, raw.pb, c.w * c.h * 4) : undefined;
    const pa = c ? bytesAt(mine, raw.pa, c.w * c.h * 4) : undefined;
    patches.push(...turn(raw.id, a, sidePixels(d, a, own === 'after', c, pa)));
    inverse.unshift(...turn(raw.id, b, sidePixels(d, b, own === 'before', c, pb)));
  }
  return { label: rec.l, at: rec.at, patches, inverse, ...(rec.view === true ? { view: true } : {}) };
}

const decoder = new TextDecoder();

/**
 * The steps a file carried, put back against the drawing as it opened. Newest first from the drawing, so when the
 * in-memory limits are reached it is the oldest that stop. A step that doesn't fit the drawing (an odd or edited file)
 * ends the run there: what was read so far is kept, and the rest is left out. Undefined when there is nothing usable.
 */
export function readHistory(doc: Doc, note: unknown, steps: Uint8Array | undefined, data: Uint8Array | undefined): RestoredHistory | undefined {
  if (!isObj(note) || note.v !== 1 || !steps || !historyFitsFile(doc)) return undefined;
  let file: StepsFile;
  try {
    file = JSON.parse(decoder.decode(steps));
  } catch {
    return undefined;
  }
  if (!isObj(file) || file.v !== 1 || !Array.isArray(file.undo) || !Array.isArray(file.redo) || file.undo.length > MAX_STEPS || file.redo.length > MAX_STEPS) return undefined;
  const bytes = data ?? new Uint8Array(0);
  const max = historyStepsNow();
  let weight = 0;
  let count = 0;
  const room = (s: RestoredStep): boolean => {
    const w = weighPatches(s.patches) + weighPatches(s.inverse);
    if (count >= max || (count >= ALWAYS_KEEP && weight + w > HISTORY_BYTES)) return false;
    weight += w;
    count++;
    return true;
  };
  const undo: RestoredStep[] = [];
  try {
    let state = doc;
    for (let k = file.undo.length - 1; k >= 0; k--) {
      const s = restore(file.undo[k], bytes, state, 'after');
      if (!room(s)) break;
      undo.push(s);
      state = applyPatches(state, s.inverse);
    }
  } catch {
    // What was read stays; older steps don't fit this drawing.
  }
  undo.reverse();
  const redo: RestoredStep[] = [];
  try {
    let state = doc;
    for (const rec of file.redo) {
      const s = restore(rec, bytes, state, 'before');
      if (!room(s)) break;
      redo.push(s);
      state = applyPatches(state, s.patches);
    }
  } catch {
    // Same for the redo side.
  }
  return undo.length || redo.length ? { undo, redo } : undefined;
}
