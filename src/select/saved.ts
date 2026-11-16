/**
 * Saved selections: a selection kept under a name, to bring back later. Pure; the commands and the list are in
 * saved-commands.ts and SavedDialog.tsx. A pixel selection is kept as runs of cover (a run is a value 0 to 255 and how
 * many pixels in a row have it) so a feathered edge comes back feathered and a big plain selection stays small.
 */
import type { Id, SavedSelection } from '../core/format';
import { coverOf, fromCover, type Mask } from './mask';

/** The most selections one document keeps, and the longest a name can be. */
export const MAX_SAVED = 60;
export const MAX_NAME = 60;

const BASE64 = typeof btoa === 'function';

function toBase64(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.slice(i, i + 8192));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const s = atob(text);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Cover as runs: for each run a value byte, then its length in 7 bit pieces (the top bit says another piece follows). */
export function encodeCover(cover: Uint8Array): string {
  if (!BASE64) return '';
  const bytes: number[] = [];
  let i = 0;
  while (i < cover.length) {
    const v = cover[i];
    let n = 1;
    while (i + n < cover.length && cover[i + n] === v) n++;
    bytes.push(v);
    let left = n;
    do {
      const piece = left & 0x7f;
      left >>>= 7;
      bytes.push(left ? piece | 0x80 : piece);
    } while (left);
    i += n;
  }
  return toBase64(bytes);
}

/** The cover a text holds, or null when it is not `size` pixels' worth of runs. */
export function decodeCover(text: string, size: number): Uint8Array | null {
  const bytes = BASE64 ? fromBase64(text) : null;
  if (!bytes) return null;
  const out = new Uint8Array(size);
  let at = 0;
  let i = 0;
  while (i < bytes.length) {
    const v = bytes[i++];
    let n = 0;
    let shift = 0;
    for (;;) {
      if (i >= bytes.length || shift > 28) return null;
      const b = bytes[i++];
      n += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if (!(b & 0x80)) break;
    }
    if (n < 1 || at + n > size) return null;
    if (v) out.fill(v, at, at + n);
    at += n;
  }
  return at === size ? out : null;
}

/** A pixel selection ready to keep. */
export function savePixels(id: Id, name: string, m: Mask): SavedSelection {
  return { id, name: cleanName(name), kind: 'pixels', width: m.width, height: m.height, cover: encodeCover(coverOf(m)) };
}

/** The shapes picked on a layer, ready to keep. */
export function saveShapes(id: Id, name: string, layerId: Id | null, ids: readonly Id[]): SavedSelection {
  return { id, name: cleanName(name), kind: 'shapes', layerId, ids: [...ids] };
}

/** The mask a saved pixel selection holds, or null for a shape one or one that can't be read. */
export function maskOf(s: SavedSelection): Mask | null {
  if (s.kind !== 'pixels') return null;
  const cover = decodeCover(s.cover, s.width * s.height);
  return cover ? fromCover(s.width, s.height, cover) : null;
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/** A name nobody has used yet: "Selection 3", or the wanted one with a number on it when that is taken. */
export function freeName(taken: readonly string[], wanted = ''): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const base = cleanName(wanted) || 'Selection';
  if (wanted && !used.has(base.toLowerCase())) return base;
  for (let n = wanted ? 2 : 1; ; n++) {
    const t = `${base} ${n}`;
    if (!used.has(t.toLowerCase())) return t;
  }
}

/** A short line saying what a saved selection holds, for the list. */
export function describeSaved(s: SavedSelection): string {
  if (s.kind === 'shapes') return `${s.ids.length} shape${s.ids.length === 1 ? '' : 's'}`;
  const m = maskOf(s);
  if (!m) return 'Pixels (could not be read)';
  let n = 0;
  for (let i = 0; i < m.bits.length; i++) n += m.bits[i];
  return `${n} pixel${n === 1 ? '' : 's'}${m.soft ? ', soft edge' : ''}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Saved selections read from a file: what is malformed is dropped, a repeated id is made new, and none at all is undefined. */
export function readSavedSelections(raw: unknown): SavedSelection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SavedSelection[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
    const name = typeof r.name === 'string' ? cleanName(r.name) || 'Selection' : 'Selection';
    if (r.kind === 'pixels') {
      const w = Number(r.width);
      const h = Number(r.height);
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w * h > 64_000_000 || typeof r.cover !== 'string') continue;
      if (!decodeCover(r.cover, w * h)) continue;
      out.push({ id: r.id, name, kind: 'pixels', width: w, height: h, cover: r.cover });
    } else if (r.kind === 'shapes') {
      if (!Array.isArray(r.ids)) continue;
      const ids = r.ids.filter((x): x is string => typeof x === 'string');
      out.push({ id: r.id, name, kind: 'shapes', layerId: typeof r.layerId === 'string' ? r.layerId : null, ids });
    } else continue;
    seen.add(r.id);
    if (out.length >= MAX_SAVED) break;
  }
  return out.length ? out : undefined;
}
