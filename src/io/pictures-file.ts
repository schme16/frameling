/**
 * Reference pictures in the `.frameling` zip. In memory a picture holds the bytes of the JPG or PNG it came from; in the
 * zip the bytes sit in `pictures/<id>.<ext>` (stored, not squeezed: they are already compressed) and `doc.json` holds the
 * entry name in `data`. Pictures no layer shows any more are not written. Pure bytes in and out, like audio-file.ts.
 */
import type { Zippable } from 'fflate';
import type { Doc, Id, LayerPicture, PictureShot, ReferencePicture } from '../core/format';
import { extOf, MAX_SCALE, MIN_SCALE, normaliseTurn } from '../reference/model';

const ENTRY = /^pictures\/[A-Za-z0-9_-]+\.(jpg|png)$/;
const safeName = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The picture ids any layer in the document shows, wherever the layer sits (the stage, a symbol, a board, a variation). */
export function picturesInUse(doc: Doc): Set<Id> {
  const used = new Set<Id>();
  const walk = (v: unknown, depth: number): void => {
    if (depth > 40 || typeof v !== 'object' || v === null || ArrayBuffer.isView(v)) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.shots)) for (const s of o.shots) if (isObj(s) && typeof s.picture === 'string') used.add(s.picture);
    for (const k of Object.keys(o)) if (k !== 'drawings' && k !== 'pictures' && k !== 'audio') walk(o[k], depth + 1);
  };
  walk(doc, 0);
  return used;
}

/** Adds each picture in use to the zip and returns them for doc.json (undefined when there are none). */
export function packPictures(doc: Doc, files: Zippable): Record<string, unknown>[] | undefined {
  if (!doc.pictures?.length) return undefined;
  const used = picturesInUse(doc);
  const names = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const p of doc.pictures) {
    if (!used.has(p.id)) continue;
    const ext = extOf(p.mime);
    let name = `pictures/${safeName(p.id)}.${ext}`;
    while (names.has(name)) name = name.replace(/\.[a-z]+$/, `_.${ext}`);
    names.add(name);
    files[name] = [p.data, { level: 0 }];
    out.push({ id: p.id, name: p.name, mime: p.mime, width: p.width, height: p.height, data: name });
  }
  return out.length ? out : undefined;
}

/** Reads the pictures back. One whose bytes are missing is left out, and the layers that showed it go empty (see readLayerPicture). */
export function unpackPictures(raw: unknown, entries: Record<string, Uint8Array>, warnings: string[]): ReferencePicture[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ReferencePicture[] = [];
  const ids = new Set<string>();
  for (const c of raw) {
    if (!isObj(c) || typeof c.id !== 'string' || ids.has(c.id)) {
      warnings.push('A reference picture could not be read and was left out.');
      continue;
    }
    const name = typeof c.name === 'string' && c.name ? c.name : 'Picture';
    const entry = typeof c.data === 'string' && ENTRY.test(c.data) ? entries[c.data] : undefined;
    const width = Math.round(num(c.width, 0));
    const height = Math.round(num(c.height, 0));
    if (!entry || !entry.length || width < 1 || height < 1) {
      warnings.push(`The reference picture "${name}" is missing from the file and was left out.`);
      continue;
    }
    ids.add(c.id);
    out.push({ id: c.id, name, data: entry, mime: c.mime === 'image/png' ? 'image/png' : 'image/jpeg', width, height });
  }
  return out.length ? out : undefined;
}

/** Reads a layer's picture. Shots of pictures that are not there are dropped; with none left there is no picture. */
export function readLayerPicture(raw: unknown, ids: ReadonlySet<Id>): { picture?: LayerPicture } {
  if (!isObj(raw) || !Array.isArray(raw.shots)) return {};
  const shots: PictureShot[] = [];
  for (const s of raw.shots) {
    if (!isObj(s) || typeof s.picture !== 'string' || !ids.has(s.picture)) continue;
    const start = Math.max(0, Math.round(num(s.start, 0)));
    const length = typeof s.length === 'number' && Number.isFinite(s.length) && s.length >= 1 ? Math.round(s.length) : undefined;
    shots.push({ picture: s.picture, start, ...(length !== undefined ? { length } : {}) });
  }
  if (!shots.length) return {};
  // In order, and never two starting on the same frame.
  shots.sort((a, b) => a.start - b.start);
  const unique = shots.filter((s, i) => i === 0 || s.start !== shots[i - 1].start);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, num(raw.scale, 1) > 0 ? num(raw.scale, 1) : 1));
  const turn = normaliseTurn(num(raw.turn, 0));
  return { picture: { x: num(raw.x, 0), y: num(raw.y, 0), scale, ...(turn ? { turn } : {}), shots: unique } };
}
