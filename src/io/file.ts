/**
 * The `.frameling` file: a zip holding `manifest.json`, `doc.json` and one `pixels/<id>.png` per pixel drawing.
 *
 * Pure bytes in, bytes out (no DOM, no Electron), so it runs the same in the app and in Node tests. In memory a pixel
 * drawing holds raw RGBA; in the file `doc.json` holds the name of its PNG instead.
 */
import { readNotes } from '../notes/model';
import { cleanGradients } from '../core/gradient';
import { readFolders, readLayerLook } from '../effects/io';
import { strFromU8, strToU8, unzipSync, zip, zipSync, type Zippable } from 'fflate';
import { BONE_STRETCH, FORMAT_VERSION, LAYER_LABELS, type LayerLabel, type Cel, type Doc, type Drawing, type KeptShape, type Layer, type Shape, type Slice, type SliceKey, type SymbolDef, type Tween, type InstanceShape, type ClipFlow, type ClipTransition, type Tile, type Tileset, type Bone, type BonePose, type LayerBind, type Pose, type Rig, type SavedPose, type PathStroke } from '../core/format';
import { decodePng, encodePng, type RawImage } from './png';
import { decodePngsInWorkers, inflateDocInWorker, zipInWorker } from './ioClient';
import { MAX_UNZIPPED } from './ioJobs';
import { readExports } from '../export/saved';
import { trimmedDrawing } from '../core/pixelBounds';
import { rootDoc } from '../core/symbols';
import { isEasing } from '../core/ease';
import { readOrigin } from './shapes-extra';
import { hasShapeKind, shapeKind } from '../core/shapeKinds';
import { packAudio, unpackAudio } from './audio-file';
import { packPictures, readLayerPicture, unpackPictures } from './pictures-file';
import { keepUnknownShape, readExt, shapesForSave, withExt } from './ext';
import { packArtboards, readArtboards } from '../artboards/io';
import { closedForSave, isDerivedDrawing, resolveAfterLoad, variationDiffs } from '../artboards/variationsIo';
import { switchOpenVariation } from '../artboards/variations';
import { upgradeLineage } from '../core/upgradeLineage';
import { readClip } from '../core/clipPlay';
import { cleanStrokeStyle } from '../geometry/lineStyle';
import { cleanTrim } from '../geometry/trim';
import { readDataLayers, readTerrainMode, readTerrains, readTileExtras } from '../core/tileFormat';

export const FILE_EXTENSION = 'frameling';

/** An error whose message is already fit to show to a person. */
export class FileProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileProblem';
  }
}

export interface Manifest {
  format: 'frameling';
  version: number;
  app: string;
  created: string;
  name: string;
}

export interface LoadedFile {
  doc: Doc;
  manifest: Manifest;
  /** Small repairs made while opening (a missing drawing dropped, and so on), in plain words. */
  warnings: string[];
}

// Encoded PNGs by pixel array. Edits replace the array, so an unchanged drawing never gets encoded twice (autosave
// runs every minute and most drawings are not touched between runs).
const pngCache = new WeakMap<Uint8ClampedArray, Uint8Array>();

function pngFor(d: { width: number; height: number; pixels: Uint8ClampedArray }): Uint8Array {
  let png = pngCache.get(d.pixels);
  if (!png) {
    png = encodePng({ width: d.width, height: d.height, pixels: d.pixels }, { level: 6 });
    pngCache.set(d.pixels, png);
  }
  return png;
}

const safeName = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

// doc.json is mostly drawings, and most of them are the same object from one save to the next (an edit replaces the
// drawing it touches). So a vector drawing's text is kept, already UTF-8 encoded, by drawing: saving again only
// has to write out what changed. A hit needs the very same object with the very same shapes array and length.
interface DrawingText {
  /** `"id":{...}` as UTF-8. */
  bytes: Uint8Array;
  id: string;
  shapes: unknown;
  kept: unknown;
  count: number;
}
const drawingText = new WeakMap<object, DrawingText>();

/** `freeze`: see cachedEntry. Turned on by the test setup and by the debug hooks (`?debug`), never in normal use. */
export const guard = { freeze: false };

/** Freezes an object and everything under it (typed arrays are left, they cannot be frozen). */
export function deepFreeze<T>(v: T): T {
  if (typeof v !== 'object' || v === null || Object.isFrozen(v) || ArrayBuffer.isView(v)) return v;
  Object.freeze(v);
  for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  return v;
}
const enc = new TextEncoder();

/** One entry of the saved `drawings` object: what to write, as a value or (when it was kept) as ready `"id":value` bytes. */
type DrawingEntry = { id: string; value: () => unknown; bytes?: Uint8Array };

/** The entry for a drawing whose saved form is `value()`, with its bytes from the cache when this drawing was written before. */
function cachedEntry(id: string, d: Drawing, value: () => unknown): DrawingEntry {
  const shapes = d.kind === 'vector' ? d.shapes : undefined;
  const kept = d.kind === 'vector' ? d.kept : undefined;
  const count = d.kind === 'vector' ? d.shapes.length : 0;
  const hit = drawingText.get(d);
  if (hit && hit.id === id && hit.shapes === shapes && hit.kept === kept && hit.count === count) return { id, value, bytes: hit.bytes };
  const bytes = enc.encode(`${JSON.stringify(id)}:${JSON.stringify(value())}`);
  drawingText.set(d, { bytes, id, shapes, kept, count });
  // Under test and in the harnesses a drawing whose text is kept is frozen, so a write in place throws right where it
  // happens instead of saving stale text later.
  if (guard.freeze) deepFreeze(d);
  return { id, value, bytes };
}

/** A string the saved document cannot contain by accident: stands where the drawings go while the rest is written out. */
const DRAWINGS_MARK = '\u0000frameling-drawings\u0000';
const COMMA = new Uint8Array([0x2c]);

/**
 * The UTF-8 bytes of `JSON.stringify({ ...rest, drawings })`, where `rest` holds the marker in `drawings`' place. The
 * same bytes as stringifying everything in one go: the rest is written once, and the marker is swapped for the
 * drawings' text, which for a drawing seen before is copied from the cache instead of written again.
 */
function docJsonBytes(rest: Record<string, unknown>, entries: DrawingEntry[]): Uint8Array {
  const text = JSON.stringify(rest);
  const mark = JSON.stringify(DRAWINGS_MARK);
  const at = text.indexOf(mark);
  if (at < 0 || text.indexOf(mark, at + 1) >= 0) {
    // The marker is somewhere it should not be (or missing): write it the plain way.
    const all: Record<string, unknown> = {};
    for (const e of entries) all[e.id] = e.value();
    return enc.encode(JSON.stringify({ ...rest, drawings: all }));
  }
  const parts: Uint8Array[] = [enc.encode(text.slice(0, at) + '{')];
  // Entries without bytes are written as text and encoded in one go.
  let pending = '';
  entries.forEach((e, i) => {
    if (!e.bytes) {
      pending += `${i ? ',' : ''}${JSON.stringify(e.id)}:${JSON.stringify(e.value())}`;
      return;
    }
    if (pending) {
      parts.push(enc.encode(pending));
      pending = '';
    }
    if (i) parts.push(COMMA);
    parts.push(e.bytes);
  });
  parts.push(enc.encode(pending + '}' + text.slice(at + mark.length)));
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Everything that goes in the file, ready to be zipped (the part of saving that has to look at the document). */
function filesToSave(open: Doc, appVersion: string, now: Date, reuse = false, preview?: Uint8Array): Zippable {
  // Saved as if no symbol were open for editing.
  const closed = closedForSave(rootDoc(open));
  const doc = closed.doc;
  const files: Zippable = {};
  const entries: DrawingEntry[] = [];
  // Only an autosave or a version (`reuse`) may copy a drawing's kept text; Save and Save As always write every drawing out.
  const keep = (id: string, d: Drawing, value: () => unknown): DrawingEntry => (reuse ? cachedEntry(id, d, value) : { id, value });
  const used = new Set<string>();
  // A drawing a variation redrew is stored as what differs from its original's, when that is smaller.
  const diffs = variationDiffs(doc, files, pngFor);
  const tileFrames = new Set((doc.tileset?.tiles ?? []).flatMap((t) => t.frames.map((f) => f.drawingId)));
  for (const [id, d] of Object.entries(doc.drawings)) {
    // A variation's drawings that are worked out from its original are not stored.
    if (isDerivedDrawing(doc, id) || diffs.has(id)) continue;
    if (d.kind === 'pixel') {
      // Only the painted part is stored (tile frames are always whole tiles).
      const t = tileFrames.has(id) ? d : trimmedDrawing(d);
      if (t.width < 1 || t.height < 1) {
        // Nothing painted: no picture entry at all.
        const empty = { ...t, width: 0, height: 0, pixels: '' };
        entries.push({ id, value: () => empty });
        continue;
      }
      let name = `pixels/${safeName(id)}.png`;
      while (used.has(name)) name = name.replace(/\.png$/, '_.png');
      used.add(name);
      files[name] = [pngFor(t), { level: 0 }];
      const saved = { ...t, pixels: name };
      entries.push({ id, value: () => saved });
    } else if (d.kind === 'tilemap') {
      // Not cached: its cells are a typed array, which nothing stops from being written in place.
      entries.push({ id, value: () => ({ ...d, cells: Array.from(d.cells) }) });
    } else if (d.kind === 'vector' && d.kept?.length) {
      entries.push(
        keep(id, d, () => {
          const { kept: _kept, ...rest } = d;
          return { ...rest, shapes: shapesForSave(d) };
        }),
      );
    } else {
      entries.push(d.kind === 'vector' ? keep(id, d, () => d) : { id, value: () => d });
    }
  }
  const manifest: Manifest = { format: 'frameling', version: FORMAT_VERSION, app: appVersion, created: now.toISOString(), name: doc.name };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  // A small picture of the drawing for lists of files. Stored as it is (a PNG is already packed), and older versions skip it.
  if (preview?.length) files['preview.png'] = [preview, { level: 0 }];
  // Sound bytes go in their own entries; `audio` in doc.json then names them (undefined leaves the key out).
  const audio = packAudio(doc, files);
  // Reference pictures the same way, in `pictures/` (only those a layer still shows).
  const pictures = packPictures(doc, files);
  // Artboards that aren't open carry their own sounds the same way.
  files['doc.json'] = docJsonBytes({ ...doc, drawings: DRAWINGS_MARK, audio, pictures, ...packArtboards(doc, files, diffs), ...(closed.reopen ? { variationOpen: closed.reopen } : {}) }, entries);
  return files;
}

export function saveFile(open: Doc, appVersion = '', now: Date = new Date(), opts: SaveOptions = {}): Uint8Array {
  return zipSync(filesToSave(open, appVersion, now, opts.reuse, opts.preview), { level: 6, mtime: now.getTime() });
}

export interface SaveOptions {
  /**
   * Copy each vector drawing's text from the last save when the drawing is the very same object (autosave and versions,
   * which run all the time). Left off, every drawing is written out afresh, so a file the person saved is exact even if
   * something ever changed a drawing in place. See `cachedEntry`.
   */
  reuse?: boolean;
  /** A small PNG of the drawing, kept in the file as `preview.png` for lists of files (Open recent). Made by io/preview.ts; optional. */
  preview?: Uint8Array;
}

/**
 * The same bytes as `saveFile`, with the compressing done on a worker thread so the page keeps drawing and answering
 * the pen meanwhile (on a big drawing the sync version holds the page for a second or more). Autosave, Save and
 * versions use this.
 */
export async function saveFileAsync(open: Doc, appVersion = '', now: Date = new Date(), opts: SaveOptions = {}): Promise<Uint8Array> {
  let files = filesToSave(open, appVersion, now, opts.reuse, opts.preview);
  // One worker does all the zipping (checksums included, which fflate's own async zip would do on this thread).
  // doc.json is the big one and is made fresh for each save, so its buffer is handed over rather than copied.
  const doc = files['doc.json'];
  const size = doc instanceof Uint8Array ? doc.length : 0;
  const made = await zipInWorker(files, 6, doc instanceof Uint8Array ? [doc] : [], now.getTime());
  if (made) return made;
  // No worker (or it failed): the handed over buffer is gone, so make the files again.
  if (doc instanceof Uint8Array && doc.length !== size) files = filesToSave(open, appVersion, now, opts.reuse, opts.preview);
  return new Promise((resolve, reject) => zip(files, { level: 6, mtime: now.getTime() }, (err, data) => (err ? reject(err) : resolve(data))));
}

// ---------------------------------------------------------------- migration

/** Version 1 counted a back and forth clip's repeat in full trips; version 2 counts each direction (2 per trip). */
function doubleBounceRepeats(clips: unknown): void {
  if (!Array.isArray(clips)) return;
  for (const c of clips) {
    if (!isObj(c) || (c.direction !== 'pingpong' && c.direction !== 'pingpong-reverse')) continue;
    // A clip that stops after one trip had no repeat written; it is now there and back (2).
    if (typeof c.repeat === 'number' && Number.isFinite(c.repeat)) c.repeat = Math.round(c.repeat) * 2;
    else if (c.loop !== true) c.repeat = 2;
  }
}

/**
 * One step per format version: `MIGRATIONS[n]` turns a version n document into version n + 1. When the format changes,
 * bump FORMAT_VERSION and add the step here. Version 1 to 2: back and forth clips count each direction as one repeat.
 * Version 2 to 3: pixel drawings can hold just the painted part of the grid.
 */
export const MIGRATIONS: Record<number, (raw: any) => any> = {
  1: (raw) => {
    doubleBounceRepeats(raw.clips);
    if (Array.isArray(raw.artboards))
      for (const a of raw.artboards) {
        if (!isObj(a)) continue;
        if (isObj(a.content)) doubleBounceRepeats(a.content.clips);
        // A variation's own clip list (it replaces the original's whole list).
        if (isObj(a.overrides) && isObj(a.overrides.stage) && isObj(a.overrides.stage.set)) doubleBounceRepeats(a.overrides.stage.set.clips);
      }
    return raw;
  },
  // Version 2 to 3: pixel drawings may hold only their painted part (`x`, `y`, a smaller `width` and `height`). Nothing to change in older files.
  2: (raw) => raw,
};

export function migrate(raw: any, from: number): any {
  let doc = raw;
  for (let v = from; v < FORMAT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new FileProblem('This file is from a version of Frameling that this one cannot open any more.');
    doc = step(doc);
    doc.version = v + 1;
  }
  return doc;
}

// ---------------------------------------------------------------- loading

// The drawing basics; text, particles and the like are kinds that register themselves (core/shapeKinds.ts).
const BASIC_SHAPES = new Set(['stroke', 'fill', 'path', 'instance']);

function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

const damaged = () => new FileProblem('This file looks damaged, so Frameling could not open it.');

export function loadFile(bytes: Uint8Array): LoadedFile {
  return loadEntries(unzipFile(bytes));
}

/** A document.json this big is worth a trip to a worker (smaller ones are read faster right here). Tests lower it. */
export const loadTuning = { minDocJson: 1 << 20 };

/** What `doc.json` inflates to, from the zip's directory alone (nothing is inflated); 0 when it cannot say. */
function docJsonSize(bytes: Uint8Array): number {
  let size = 0;
  try {
    unzipSync(bytes, {
      filter: (f) => {
        if (f.name === 'doc.json') size = f.originalSize;
        return false;
      },
    });
  } catch {
    return 0;
  }
  return size;
}

/**
 * The same as `loadFile`, with the heavy parts on worker threads: the pictures of a big pixel document are decoded in
 * parallel (inflating and unfiltering 100 frames of a large stage holds the page for a second or more), and the JSON of a
 * big vector document is inflated off the page (the platform's zlib is several times quicker than fflate, and the page is left with parsing).
 * Falls back to doing it all here, with the same errors.
 */
export async function loadFileAsync(bytes: Uint8Array): Promise<LoadedFile> {
  let parsed: { raw: unknown } | null = null;
  if (docJsonSize(bytes) >= loadTuning.minDocJson) {
    try {
      const inflated = await inflateDocInWorker(bytes);
      if (inflated) parsed = { raw: JSON.parse(strFromU8(inflated)) };
    } catch {
      // Left for the plain path below, which reports it.
    }
  }
  const entries = unzipFile(bytes, !!parsed);
  const decoded = await decodePngsInWorkers(entries);
  return loadEntries(entries, decoded, parsed ?? undefined);
}

/** The entries of a file that matter. With `skipDoc` (its JSON was read elsewhere) `doc.json` is left uninflated. */
function unzipFile(bytes: Uint8Array, skipDoc = false): Record<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_UNZIPPED && (f.name === 'manifest.json' || (f.name === 'doc.json' && !skipDoc) || f.name.startsWith('pixels/') || f.name.startsWith('audio/') || f.name.startsWith('pictures/')) });
  } catch {
    throw new FileProblem("That doesn't look like a Frameling file, so it could not be opened.");
  }
  if (!entries['manifest.json'] || (!skipDoc && !entries['doc.json'])) throw new FileProblem("That doesn't look like a Frameling file, so it could not be opened.");
  return entries;
}

function loadEntries(entries: Record<string, Uint8Array>, decoded?: Map<string, RawImage>, parsed?: { raw: unknown }): LoadedFile {
  let manifest: Manifest;
  let raw: any;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
    raw = parsed?.raw ?? JSON.parse(strFromU8(entries['doc.json']));
  } catch {
    throw damaged();
  }
  if (!isObj(manifest) || manifest.format !== 'frameling' || !isObj(raw)) throw new FileProblem("That doesn't look like a Frameling file, so it could not be opened.");
  const version = manifest.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw damaged();
  if (version > FORMAT_VERSION) throw new FileProblem(`This file was made with a newer Frameling (file version ${version}). Update Frameling and try again.`);

  const warnings: string[] = [];
  raw = migrate(raw, version);
  const doc = buildDoc(raw, entries, warnings, decoded);
  return { doc, manifest, warnings };
}

function buildDoc(raw: any, entries: Record<string, Uint8Array>, warnings: string[], decoded?: Map<string, RawImage>): Doc {
  if (raw.format !== 'frameling') throw damaged();
  const width = num(raw.width, 0);
  const height = num(raw.height, 0);
  const fps = num(raw.fps, 0);
  if (width < 1 || height < 1 || fps <= 0 || !Array.isArray(raw.layers) || !isObj(raw.drawings)) throw damaged();
  const length = Math.max(1, Math.round(num(raw.length, 1)));

  // Drawings first, so cels can be checked against them.
  const drawings: Record<string, Drawing> = {};
  for (const [id, d] of Object.entries<any>(raw.drawings)) {
    if (!isObj(d)) {
      warnings.push('One drawing could not be read and was left out.');
      continue;
    }
    if (d.kind === 'vector') {
      const shapes: Shape[] = [];
      const kept: KeptShape[] = [];
      let lost = !Array.isArray(d.shapes);
      for (const s of Array.isArray(d.shapes) ? d.shapes : []) {
        if (isObj(s) && (BASIC_SHAPES.has(s.type) || hasShapeKind(s.type))) {
          const read: Shape | null = s.type === 'instance' ? readInstance(s) : hasShapeKind(s.type) ? shapeKind(s.type)!.read(s) : (cleanLineStyle(cleanOrigin(cleanGradients(s))) as Shape);
          if (read) shapes.push(withExt(read, s, warnings));
          else lost = true;
        } else {
          // A kind of shape this version does not know: kept as it is, so saving never drops it.
          const k = keepUnknownShape(s, shapes.length, warnings);
          if (k) kept.push(k);
          else lost = true;
        }
      }
      if (lost) warnings.push('Some shapes could not be read and were left out.');
      drawings[id] = { id: str(d.id, id), kind: 'vector', shapes, ...(kept.length ? { kept } : {}), ...readPose(d.pose), ...readExt(d.ext, warnings) };
    } else if (d.kind === 'pixel') {
      const name = d.pixels;
      if (name === '' && d.width === 0 && d.height === 0) {
        // A drawing with nothing painted has no picture.
        drawings[id] = { id: str(d.id, id), kind: 'pixel', width: 0, height: 0, pixels: new Uint8ClampedArray(0), ...readExt(d.ext, warnings) };
        continue;
      }
      if (typeof name !== 'string' || !/^pixels\/[A-Za-z0-9_-]+\.png$/.test(name) || !entries[name]) throw damaged();
      let img;
      try {
        img = decoded?.get(name) ?? decodePng(entries[name]);
      } catch {
        throw damaged();
      }
      if (img.width !== d.width || img.height !== d.height) throw damaged();
      // Where the picture sits on the art grid (missing = the corner, as in files made before drawings were trimmed).
      const gx = Math.max(0, Math.min(1 << 20, Math.round(num(d.x, 0))));
      const gy = Math.max(0, Math.min(1 << 20, Math.round(num(d.y, 0))));
      drawings[id] = { id: str(d.id, id), kind: 'pixel', ...(gx ? { x: gx } : {}), ...(gy ? { y: gy } : {}), width: img.width, height: img.height, pixels: img.pixels, ...readExt(d.ext, warnings) };
    } else if (d.kind === 'tilemap') {
      const columns = Math.round(num(d.columns, 0));
      const rows = Math.round(num(d.rows, 0));
      if (columns < 1 || rows < 1 || columns * rows > 4_000_000 || !Array.isArray(d.cells) || d.cells.length !== columns * rows) throw damaged();
      const cells = new Uint32Array(columns * rows);
      for (let i = 0; i < cells.length; i++) cells[i] = num(d.cells[i], 0) >>> 0;
      drawings[id] = { id: str(d.id, id), kind: 'tilemap', columns, rows, cells, ...readExt(d.ext, warnings) };
    } else if (d.kind === 'camera') {
      const v = isObj(d.view) ? d.view : {};
      const zoom = num(v.zoom, 1);
      drawings[id] = { id: str(d.id, id), kind: 'camera', view: { x: num(v.x, width / 2), y: num(v.y, height / 2), zoom: zoom > 0 ? zoom : 1, rotation: num(v.rotation, 0), ...(isObj(v.fit) && num(v.fit.k, 0) > 0 && num(v.fit.w, 0) > 0 && num(v.fit.h, 0) > 0 ? { fit: { k: num(v.fit.k, 1), w: num(v.fit.w, 1), h: num(v.fit.h, 1) } } : {}) }, ...readExt(d.ext, warnings) };
    } else {
      warnings.push('One drawing could not be read and was left out.');
    }
  }

  // Reference pictures first, so a layer's shots can be checked against them.
  const pictures = unpackPictures(raw.pictures, entries, warnings);
  const pictureIds = new Set((pictures ?? []).map((p) => p.id));
  // The same reader does the stage's layers and every symbol's.
  const readLayers = (rawLayers: any[]): Layer[] => {
    const layers: Layer[] = [];
    for (const l of rawLayers) {
      if (!isObj(l) || (l.kind !== 'vector' && l.kind !== 'pixel' && l.kind !== 'tilemap' && l.kind !== 'camera')) throw damaged();
      const cels: Cel[] = [];
      for (const c of Array.isArray(l.cels) ? l.cels : []) {
        if (!isObj(c) || typeof c.drawingId !== 'string' || !drawings[c.drawingId]) {
          warnings.push('Some frames pointed at a missing drawing and were left empty.');
          continue;
        }
        const d = drawings[c.drawingId];
        if (d.kind !== l.kind) {
          warnings.push('A frame held the wrong kind of drawing for its layer and was left empty.');
          continue;
        }
        cels.push({ id: str(c.id, c.drawingId + '-cel'), start: Math.max(0, Math.round(num(c.start, 0))), length: Math.max(1, Math.round(num(c.length, 1))), drawingId: c.drawingId, ...readTween(c.tween), ...(c.autoHold === true ? { autoHold: true } : {}) });
      }
      cels.sort((a, b) => a.start - b.start);
      const base = {
        id: str(l.id, 'layer' + layers.length),
        name: str(l.name, 'Layer ' + (layers.length + 1)),
        visible: bool(l.visible, true),
        locked: bool(l.locked, false),
        opacity: Math.min(1, Math.max(0, num(l.opacity, 1))),
        ...(l.onion === false ? { onion: false } : {}),
        ...(l.reference === true ? { reference: true } : {}),
        ...readLayerPicture(l.picture, pictureIds),
        ...((LAYER_LABELS as readonly unknown[]).includes(l.label) ? { label: l.label as LayerLabel } : {}),
        ...(typeof l.depth === 'number' && Number.isFinite(l.depth) && l.depth ? { depth: Math.max(-0.9, Math.min(100, l.depth)) } : {}),
        ...readBind(l.bind),
        ...readLayerLook(l),
        ...readExt(l.ext, warnings),
        cels,
      };
      if (l.kind === 'pixel') layers.push({ ...base, kind: 'pixel', pixelSize: Math.max(1, Math.round(num(l.pixelSize, 1))), ...(l.paletteLock === true ? { paletteLock: true } : {}), ...readSlices(l.slices) });
      else if (l.kind === 'tilemap') layers.push({ ...base, kind: 'tilemap', pixelSize: Math.max(1, Math.round(num(l.pixelSize, 1))) });
      else if (l.kind === 'camera') layers.push({ ...base, kind: 'camera' });
      else layers.push({ ...base, kind: 'vector', ...(l.drawMode === 'merge' ? { drawMode: 'merge' as const } : {}), ...readRig(l.rig) });
    }
    return layers;
  };
  const layers = readLayers(raw.layers);
  const unique = new Set(layers.map((l) => l.id));
  if (unique.size !== layers.length) throw damaged();

  const tileset = readTileset(raw.tileset, drawings, warnings);
  // Older files hold whole-grid drawings: keep only the painted part of each (tile frames stay whole tiles).
  const frames = new Set((tileset?.tiles ?? []).flatMap((t) => t.frames.map((f) => f.drawingId)));
  for (const [id, d] of Object.entries(drawings)) if (d.kind === 'pixel' && !frames.has(id)) drawings[id] = trimmedDrawing(d);
  const doc: Doc = {
    format: 'frameling',
    version: FORMAT_VERSION,
    ...(raw.lineage === true ? { lineage: true as const } : {}),
    id: str(raw.id, 'd' + Date.now().toString(36)),
    name: str(raw.name, 'Untitled'),
    width,
    height,
    fps,
    ...(num(raw.dpi, 0) >= 1 && num(raw.dpi, 0) <= 10000 ? { dpi: num(raw.dpi, 0) } : {}),
    length,
    background: typeof raw.background === 'string' ? raw.background : null,
    layers,
    drawings,
    clips: Array.isArray(raw.clips) ? raw.clips.filter((c: any) => isObj(c) && typeof c.id === 'string').map(readClip) : [],
    markers: Array.isArray(raw.markers) ? raw.markers.filter((m: any) => isObj(m) && typeof m.id === 'string') : [],
    swatches: Array.isArray(raw.swatches) ? raw.swatches.filter((s: any) => isObj(s) && typeof s.id === 'string' && typeof s.color === 'string') : [],
    ...readPalette(raw.palette),
    ...readFolders(raw.folders, layers),
    ...readSymbols(raw.symbols, readLayers, warnings),
    ...readExt(raw.ext, warnings),
  };
  const flow = readFlow(raw.flow, doc.clips);
  if (flow) doc.flow = flow;
  if (tileset) doc.tileset = tileset;
  const audio = unpackAudio(raw.audio, entries, warnings);
  if (audio) doc.audio = audio;
  if (pictures) doc.pictures = pictures;
  const guides = readGuides(raw.guides);
  if (guides) doc.guides = guides;
  const notes = readNotes(raw.notes);
  if (notes) doc.notes = notes;
  if (isObj(raw.inOut) && Number.isFinite(raw.inOut.start) && Number.isFinite(raw.inOut.end)) {
    const a = Math.max(0, Math.min(length - 1, Math.round(raw.inOut.start)));
    const b = Math.max(0, Math.min(length - 1, Math.round(raw.inOut.end)));
    doc.inOut = { start: Math.min(a, b), end: Math.max(a, b) };
  }
  if (isObj(raw.perspective) && Array.isArray(raw.perspective.points)) {
    const points = raw.perspective.points.filter((p: any) => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 2).map((p: any) => ({ x: p.x as number, y: p.y as number }));
    if (points.length) doc.perspective = { points };
  }
  Object.assign(doc, readExports(raw.exports));
  if (isObj(raw.sprite) && ['picture', 'animation', 'boards', 'sheet'].includes(raw.sprite.way)) doc.sprite = { way: raw.sprite.way };
  // One layer stack for every artboard (frames on boards), never together with variations.
  const shared = raw.sharedLayers === true && Array.isArray(raw.artboards) && raw.artboards.length > 0 && !raw.artboards.some((a: any) => isObj(a) && typeof a.variationOf === 'string' && a.variationOf);
  Object.assign(doc, readArtboards(raw, entries, warnings, { readLayers, readFlow, readGuides, readPalette, top: layers, ...(shared ? { shared: true } : {}) }));
  if (shared) doc.sharedLayers = true;
  resolveAfterLoad(doc, warnings);
  upgradeLineage(doc);
  return typeof raw.variationOpen === 'string' ? switchOpenVariation(doc, raw.variationOpen) : doc;
}

/** Guides, keeping only well-formed ones. */
export function readGuides(raw: unknown): Doc['guides'] {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((g: any) => isObj(g) && (g.axis === 'x' || g.axis === 'y') && typeof g.at === 'number' && Number.isFinite(g.at))
    .map((g: any) => ({ id: typeof g.id === 'string' && g.id ? g.id : 'g' + Math.random().toString(36).slice(2, 10), axis: g.axis as 'x' | 'y', at: g.at as number }));
  return out.length ? out : undefined;
}

/** Symbols, if the file has any. One that can't be read is dropped (its instances then show nothing). */
function readSymbols(raw: unknown, readLayers: (l: any[]) => Layer[], warnings: string[]): { symbols?: Record<string, SymbolDef> } {
  if (!isObj(raw)) return {};
  const symbols: Record<string, SymbolDef> = {};
  for (const [id, s] of Object.entries<any>(raw)) {
    if (!isObj(s) || !Array.isArray(s.layers)) {
      warnings.push('A symbol could not be read and was left out.');
      continue;
    }
    let layers: Layer[];
    try {
      layers = readLayers(s.layers);
    } catch {
      warnings.push('A symbol could not be read and was left out.');
      continue;
    }
    const o = isObj(s.origin) ? s.origin : {};
    symbols[id] = { id, name: str(s.name, 'Symbol'), layers, length: Math.max(1, Math.round(num(s.length, 1))), origin: { x: num(o.x, 0), y: num(o.y, 0) } };
    if (Array.isArray(s.frameLabels) && s.frameLabels.length) symbols[id].frameLabels = s.frameLabels.map((x: unknown) => str(x, ''));
  }
  return Object.keys(symbols).length ? { symbols } : {};
}

// ---------------------------------------------------------------- bones

function readPoseMap(p: unknown): Pose | undefined {
  if (!isObj(p)) return undefined;
  const out: Pose = {};
  for (const [id, b] of Object.entries<any>(p)) {
    if (!isObj(b)) continue;
    const bp: BonePose = { r: num(b.r, 0) };
    if (typeof b.x === 'number' && Number.isFinite(b.x) && b.x) bp.x = b.x;
    if (typeof b.y === 'number' && Number.isFinite(b.y) && b.y) bp.y = b.y;
    if (typeof b.s === 'number' && Number.isFinite(b.s) && b.s !== 1) bp.s = Math.min(BONE_STRETCH.max, Math.max(BONE_STRETCH.min, b.s));
    out[id] = bp;
  }
  return out;
}

function readPose(p: unknown): { pose?: Pose } {
  const pose = readPoseMap(p);
  return pose ? { pose } : {};
}

/** A skeleton, keeping only bones whose parent comes before them. */
function readRig(r: unknown): { rig?: Rig } {
  if (!isObj(r) || !Array.isArray(r.bones)) return {};
  const bones: Bone[] = [];
  const seen = new Set<string>();
  for (const b of r.bones) {
    if (!isObj(b) || typeof b.id !== 'string' || seen.has(b.id)) continue;
    const parent = typeof b.parent === 'string' && seen.has(b.parent) ? b.parent : null;
    bones.push({ id: b.id, name: str(b.name, 'Bone'), parent, x: num(b.x, 0), y: num(b.y, 0), angle: num(b.angle, 0), length: Math.max(1, num(b.length, 10)), ...(b.pin === true ? { pin: true } : {}) });
    seen.add(b.id);
  }
  const rig: Rig = { bones };
  if (Array.isArray(r.poses)) {
    const poses: SavedPose[] = [];
    for (const p of r.poses) {
      const pose = isObj(p) ? readPoseMap(p.pose) : undefined;
      if (pose && typeof p.id === 'string') poses.push({ id: p.id, name: str(p.name, 'Pose'), pose });
    }
    if (poses.length) rig.poses = poses;
  }
  return { rig };
}

/** The per-frame keys of a slice: whole numbers, real sizes, sorted by frame, one key per frame. Null when none are usable. */
function readSliceKeys(v: unknown): SliceKey[] | null {
  if (!Array.isArray(v)) return null;
  const whole = (n: unknown, fallback = 0) => Math.round(num(n, fallback));
  const byFrame = new Map<number, SliceKey>();
  for (const k of v) {
    if (!isObj(k)) continue;
    const w = whole(k.w);
    const h = whole(k.h);
    if (w < 1 || h < 1) continue;
    const key: SliceKey = { frame: Math.max(0, whole(k.frame)), x: whole(k.x), y: whole(k.y), w, h };
    const c = k.center;
    if (isObj(c) && whole(c.w) >= 1 && whole(c.h) >= 1) key.center = { x: whole(c.x), y: whole(c.y), w: whole(c.w), h: whole(c.h) };
    if (isObj(k.pivot) && Number.isFinite(k.pivot.x) && Number.isFinite(k.pivot.y)) key.pivot = { x: whole(k.pivot.x), y: whole(k.pivot.y) };
    byFrame.set(key.frame, key);
  }
  return byFrame.size ? [...byFrame.values()].sort((a, b) => a.frame - b.frame) : null;
}

/** A layer's slices (named rectangles): kept when they have a name and a real size, repaired when a part is off. */
function readSlices(v: unknown): { slices?: Slice[] } {
  if (!Array.isArray(v)) return {};
  const whole = (n: unknown, fallback = 0) => Math.round(num(n, fallback));
  const point = (p: unknown) => (isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: whole(p.x), y: whole(p.y) } : undefined);
  const slices: Slice[] = [];
  const seen = new Set<string>();
  for (const s of v) {
    if (!isObj(s) || typeof s.name !== 'string') continue;
    const w = whole(s.w);
    const h = whole(s.h);
    if (w < 1 || h < 1) continue;
    let id = str(s.id, 'slice' + slices.length);
    while (seen.has(id)) id += '_';
    seen.add(id);
    const slice: Slice = { id, name: s.name, x: whole(s.x), y: whole(s.y), w, h };
    const c = s.center;
    if (isObj(c) && whole(c.w) >= 1 && whole(c.h) >= 1) slice.center = { x: whole(c.x), y: whole(c.y), w: whole(c.w), h: whole(c.h) };
    const pivot = point(s.pivot);
    if (pivot) slice.pivot = pivot;
    if (typeof s.color === 'string') slice.color = s.color;
    const keys = readSliceKeys(s.keys);
    if (keys) {
      // The slice's own numbers always match its first key.
      const k = keys[0];
      Object.assign(slice, { x: k.x, y: k.y, w: k.w, h: k.h });
      if (k.center) slice.center = k.center;
      else delete slice.center;
      if (k.pivot) slice.pivot = k.pivot;
      else delete slice.pivot;
      slice.keys = keys;
    }
    slices.push(slice);
  }
  return slices.length ? { slices } : {};
}

function readBind(b: unknown): { bind?: LayerBind } {
  if (!isObj(b) || typeof b.rig !== 'string' || typeof b.bone !== 'string') return {};
  const bind: LayerBind = { rig: b.rig, bone: b.bone };
  const m = b.mesh;
  if (isObj(m) && Array.isArray(m.points) && Array.isArray(m.triangles) && Array.isArray(m.bones) && Array.isArray(m.weights)) {
    const n = Math.floor(m.points.length / 2);
    const ok =
      m.points.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) &&
      m.triangles.length % 3 === 0 &&
      m.triangles.every((v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n) &&
      m.weights.length === n &&
      m.weights.every((w: unknown) => Array.isArray(w) && w.every((v) => typeof v === 'number' && Number.isFinite(v)));
    if (ok) bind.mesh = { points: m.points, triangles: m.triangles, bones: m.bones.map((x: unknown) => str(x, '')), weights: m.weights };
  }
  return { bind };
}

/** A key's in-betweens, if it has readable ones. */
function readTween(t: unknown): { tween?: Tween } {
  if (!isObj(t)) return {};
  const tween: Tween = { ...(t.kind === 'shape' ? { kind: 'shape' as const } : {}), ease: isEasing(t.ease) ? t.ease : 'linear' };
  if (Array.isArray(t.slice) && t.slice.length === 2 && t.slice.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) && t.slice[0] >= 0 && t.slice[1] <= 1 && t.slice[0] < t.slice[1]) tween.slice = [t.slice[0], t.slice[1]];
  // Whole turns are the user's spin; a fraction (a cut path's facing) is kept apart, so it survives and the field never shows it.
  const spin = typeof t.spin === 'number' && Number.isFinite(t.spin) ? t.spin : 0;
  const facing = (typeof t.facing === 'number' && Number.isFinite(t.facing) ? t.facing : 0) + (spin - Math.round(spin));
  if (Math.round(spin)) tween.spin = Math.round(spin);
  if (Math.abs(facing) > 1e-9) tween.facing = Math.round(facing * 1e6) / 1e6;
  if (isObj(t.path) && Array.isArray(t.path.points)) {
    const points = t.path.points.filter((p: any) => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p: any) => ({ x: p.x, y: p.y, ...(isObj(p.c1) && isObj(p.c2) ? { c1: { x: num(p.c1.x, p.x), y: num(p.c1.y, p.y) }, c2: { x: num(p.c2.x, p.x), y: num(p.c2.y, p.y) } } : {}) }));
    if (points.length > 1) tween.path = { points, orient: bool(t.path.orient, false) };
  }
  if (!tween.path) delete tween.facing;
  if (tween.kind === 'shape' && Array.isArray(t.hints)) {
    const pt = (p: any) => (isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x as number, y: p.y as number } : null);
    const hints = t.hints
      .filter((h: any) => isObj(h) && pt(h.from) && pt(h.to))
      .slice(0, 26)
      .map((h: any, i: number) => ({ id: str(h.id, 'h' + i), from: pt(h.from)!, to: pt(h.to)! }));
    if (hints.length) tween.hints = hints;
  }
  return { tween };
}

/** The clip flow, keeping only transitions between clips that exist. */
export function readFlow(raw: unknown, clips: { id: string }[]): ClipFlow | undefined {
  if (!isObj(raw)) return undefined;
  const ids = new Set(clips.map((c) => c.id));
  const transitions: ClipTransition[] = (Array.isArray(raw.transitions) ? raw.transitions : [])
    .filter((t: any) => isObj(t) && ids.has(t.from) && ids.has(t.to))
    .map((t: any, i: number) => ({ id: str(t.id, 't' + i), from: t.from, to: t.to, when: t.when === 'trigger' ? 'trigger' : 'end', ...(t.when === 'trigger' ? { trigger: str(t.trigger, 'go').slice(0, 60) } : {}) }));
  const positions: Record<string, { x: number; y: number }> = {};
  if (isObj(raw.positions)) for (const [id, p] of Object.entries<any>(raw.positions)) if (ids.has(id) && isObj(p)) positions[id] = { x: num(p.x, 0), y: num(p.y, 0) };
  const start = typeof raw.start === 'string' && ids.has(raw.start) ? raw.start : undefined;
  if (!transitions.length && !start && !Object.keys(positions).length) return undefined;
  return { ...(start ? { start } : {}), transitions, ...(Object.keys(positions).length ? { positions } : {}) };
}

/** A path shape whose outline has dashes, arrow heads or widths that make no sense gets them taken out, so drawing never meets them. */
function cleanLineStyle<T extends Record<string, any>>(s: T): T {
  if (s.type === 'stroke' && 'trim' in s) {
    // A brush line's trim (the part of the line that shows): sane numbers, or gone.
    const { trim, ...rest } = s;
    const clean = cleanTrim(trim);
    return (clean ? { ...rest, trim: clean } : rest) as unknown as T;
  }
  if (s.type !== 'path' || !isObj(s.stroke)) return s;
  return { ...s, stroke: cleanStrokeStyle(s.stroke as PathStroke) };
}

/** A stroke, fill or path shape with a bad `origin` taken out. */
function cleanOrigin<T extends Record<string, any>>(s: T): T {
  if (!('origin' in s)) return s;
  const { origin: _drop, ...rest } = s;
  return { ...rest, ...readOrigin(s) } as unknown as T;
}

/** An instance shape with every field present and sane, or null. */
function readInstance(s: any): InstanceShape | null {
  if (typeof s.symbolId !== 'string' || typeof s.id !== 'string') return null;
  const t = isObj(s.transform) ? s.transform : {};
  const tint = isObj(s.tint) && typeof s.tint.color === 'string' ? { color: s.tint.color, amount: Math.min(1, Math.max(0, num(s.tint.amount, 0))) } : undefined;
  return {
    id: s.id,
    ...readOrigin(s),
    ...(typeof s.group === 'string' ? { group: s.group } : {}),
    type: 'instance',
    symbolId: s.symbolId,
    transform: { x: num(t.x, 0), y: num(t.y, 0), scaleX: num(t.scaleX, 1), scaleY: num(t.scaleY, 1), rotation: num(t.rotation, 0), skew: num(t.skew, 0) },
    opacity: Math.min(1, Math.max(0, num(s.opacity, 1))),
    ...(tint ? { tint } : {}),
    play: s.play === 'once' || s.play === 'single' ? s.play : 'loop',
    firstFrame: Math.max(0, Math.round(num(s.firstFrame, 0))),
  };
}

/** The tileset, checked: tiles keep only frames whose pixels exist at the tile size, and keys stay unique. */
function readTileset(raw: any, drawings: Record<string, Drawing>, warnings: string[]): Tileset | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isObj(raw)) {
    warnings.push('The tiles could not be read and were left out.');
    return undefined;
  }
  const tileWidth = Math.round(num(raw.tileWidth, 0));
  const tileHeight = Math.round(num(raw.tileHeight, 0));
  if (tileWidth < 1 || tileHeight < 1 || tileWidth > 1024 || tileHeight > 1024) {
    warnings.push('The tiles could not be read and were left out.');
    return undefined;
  }
  const tiles: Tile[] = [];
  const keys = new Set<number>();
  const dataLayers = readDataLayers(raw.dataLayers);
  const terrains = readTerrains(raw.terrains);
  for (const t of Array.isArray(raw.tiles) ? raw.tiles : []) {
    const key = Math.round(num(t?.key, 0));
    if (!isObj(t) || key < 1 || key > 0x0fffffff || keys.has(key)) {
      warnings.push('A tile could not be read and was left out.');
      continue;
    }
    const frames = (Array.isArray(t.frames) ? t.frames : []).filter((f: any) => {
      const d = isObj(f) && typeof f.drawingId === 'string' ? drawings[f.drawingId] : undefined;
      return d && d.kind === 'pixel' && d.width === tileWidth && d.height === tileHeight;
    });
    if (!frames.length) {
      warnings.push('A tile had no picture and was left out.');
      continue;
    }
    keys.add(key);
    const tile: Tile = { key, name: str(t.name, 'Tile ' + (tiles.length + 1)), frames: frames.map((f: any) => ({ drawingId: f.drawingId, duration: Math.max(1, Math.round(num(f.duration, 1))) })) };
    readTileExtras(t, tile, { tileWidth, tileHeight, dataLayers, terrains });
    tiles.push(tile);
  }
  const top = Math.max(0, ...keys);
  const edge = (v: unknown, size: number): number => {
    const n = Math.round(num(v, 0));
    return n > 0 && n < size ? n : 0;
  };
  const gridX = edge(raw.gridX, tileWidth);
  const gridY = edge(raw.gridY, tileHeight);
  const terrainMode = terrains ? readTerrainMode(raw.terrainMode) : undefined;
  const nextTerrain = terrains ? Math.max(1 + Math.max(...terrains.map((t) => t.id)), Math.round(num(raw.nextTerrain, 1))) : 0;
  return {
    tileWidth,
    tileHeight,
    tiles,
    nextKey: Math.max(top + 1, Math.round(num(raw.nextKey, 1))),
    ...(gridX ? { gridX } : {}),
    ...(gridY ? { gridY } : {}),
    ...(dataLayers ? { dataLayers } : {}),
    ...(terrains ? { terrains, nextTerrain } : {}),
    ...(terrainMode ? { terrainMode } : {}),
  };
}

/** The pixel palette, if the file has a usable one. */
export function readPalette(p: unknown): { palette?: Doc['palette'] } {
  if (!isObj(p) || !Array.isArray(p.colors)) return {};
  const colors = p.colors.filter((c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)).slice(0, 256);
  const ramps = Array.isArray(p.ramps) ? [...new Set<number>(p.ramps.filter((n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) < colors.length))].sort((a, b) => a - b) : [];
  // Names only make sense when every colour was kept, so they still line up.
  const names = Array.isArray(p.names) && p.colors.length === colors.length && p.names.length <= colors.length && p.names.some((n: unknown) => typeof n === 'string' && n) ? p.names.map((n: unknown) => (typeof n === 'string' ? n.slice(0, 200) : '')) : [];
  const rampNames: Record<number, string> = {};
  if (isObj(p.rampNames)) for (const [k, v] of Object.entries(p.rampNames)) if (typeof v === 'string' && v && Number.isInteger(+k) && +k >= 0 && +k < colors.length) rampNames[+k] = v.slice(0, 200);
  return { palette: { name: str(p.name, 'Palette'), colors, ...(ramps.length ? { ramps } : {}), ...(names.length ? { names } : {}), ...(Object.keys(rampNames).length ? { rampNames } : {}) } };
}

/** Just the document, for callers that do not care about warnings. */
export function parseFile(bytes: Uint8Array): Doc {
  return loadFile(bytes).doc;
}
