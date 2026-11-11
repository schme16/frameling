/**
 * The `.frameling` file: a zip holding `manifest.json`, `doc.json` and one `pixels/<id>.png` per pixel drawing.
 *
 * Pure bytes in, bytes out (no DOM, no Electron), so it runs the same in the app and in Node tests. In memory a pixel
 * drawing holds raw RGBA; in the file `doc.json` holds the name of its PNG instead.
 */
import { cleanGradients } from '../core/gradient';
import { readFolders, readLayerLook } from '../effects/io';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { BONE_STRETCH, FORMAT_VERSION, type Cel, type Doc, type Drawing, type Layer, type Shape, type SymbolDef, type Tween, type InstanceShape, type ClipFlow, type ClipTransition, type Tile, type Tileset, type Bone, type BonePose, type LayerBind, type Pose, type Rig, type SavedPose } from '../core/format';
import { decodePng, encodePng } from './png';
import { rootDoc } from '../core/symbols';
import { isEasing } from '../core/ease';
import { readParticlesShape, readTextShape } from './shapes-extra';
import { packAudio, unpackAudio } from './audio-file';
import { packArtboards, readArtboards } from '../artboards/io';

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

export function saveFile(open: Doc, appVersion = '', now: Date = new Date()): Uint8Array {
  // Saved as if no symbol were open for editing.
  const doc = rootDoc(open);
  const files: Zippable = {};
  const drawings: Record<string, unknown> = {};
  const used = new Set<string>();
  for (const [id, d] of Object.entries(doc.drawings)) {
    if (d.kind === 'pixel') {
      let name = `pixels/${safeName(id)}.png`;
      while (used.has(name)) name = name.replace(/\.png$/, '_.png');
      used.add(name);
      files[name] = [pngFor(d), { level: 0 }];
      drawings[id] = { ...d, pixels: name };
    } else if (d.kind === 'tilemap') {
      drawings[id] = { ...d, cells: Array.from(d.cells) };
    } else {
      drawings[id] = d;
    }
  }
  const manifest: Manifest = { format: 'frameling', version: FORMAT_VERSION, app: appVersion, created: now.toISOString(), name: doc.name };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  // Sound bytes go in their own entries; `audio` in doc.json then names them (undefined leaves the key out).
  const audio = packAudio(doc, files);
  // Artboards that aren't open carry their own sounds the same way.
  files['doc.json'] = strToU8(JSON.stringify({ ...doc, drawings, audio, ...packArtboards(doc, files) }));
  return zipSync(files, { level: 6 });
}

// ---------------------------------------------------------------- migration

/**
 * One step per format version: `MIGRATIONS[n]` turns a version n document into version n + 1. Version 1 is the only
 * one so far, so the list is empty. When the format changes, bump FORMAT_VERSION and add the step here.
 */
export const MIGRATIONS: Record<number, (raw: any) => any> = {};

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

const SHAPE_TYPES = new Set(['stroke', 'fill', 'path', 'instance', 'text', 'particles']);
const MAX_UNZIPPED = 1024 * 1024 * 1024;

function isObj(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

const damaged = () => new FileProblem('This file looks damaged, so Frameling could not open it.');

export function loadFile(bytes: Uint8Array): LoadedFile {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_UNZIPPED && (f.name === 'manifest.json' || f.name === 'doc.json' || f.name.startsWith('pixels/') || f.name.startsWith('audio/')) });
  } catch {
    throw new FileProblem("That doesn't look like a Frameling file, so it could not be opened.");
  }
  if (!entries['manifest.json'] || !entries['doc.json']) throw new FileProblem("That doesn't look like a Frameling file, so it could not be opened.");

  let manifest: Manifest;
  let raw: any;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
    raw = JSON.parse(strFromU8(entries['doc.json']));
  } catch {
    throw damaged();
  }
  if (!isObj(manifest) || manifest.format !== 'frameling' || !isObj(raw)) throw new FileProblem("That doesn't look like a Frameling file, so it could not be opened.");
  const version = manifest.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw damaged();
  if (version > FORMAT_VERSION) throw new FileProblem(`This file was made with a newer Frameling (file version ${version}). Update Frameling and try again.`);

  const warnings: string[] = [];
  raw = migrate(raw, version);
  const doc = buildDoc(raw, entries, warnings);
  return { doc, manifest, warnings };
}

function buildDoc(raw: any, entries: Record<string, Uint8Array>, warnings: string[]): Doc {
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
      const shapes: Shape[] = Array.isArray(d.shapes) ? d.shapes.filter((s: any) => isObj(s) && SHAPE_TYPES.has(s.type)).map((s: any) => (s.type === 'instance' ? readInstance(s) : s.type === 'text' ? readTextShape(s) : s.type === 'particles' ? readParticlesShape(s) : cleanGradients(s))).filter((s: Shape | null): s is Shape => !!s) : [];
      if (!Array.isArray(d.shapes) || shapes.length !== d.shapes.length) warnings.push('Some shapes could not be read and were left out.');
      drawings[id] = { id: str(d.id, id), kind: 'vector', shapes, ...readPose(d.pose) };
    } else if (d.kind === 'pixel') {
      const name = d.pixels;
      if (typeof name !== 'string' || !/^pixels\/[A-Za-z0-9_-]+\.png$/.test(name) || !entries[name]) throw damaged();
      let img;
      try {
        img = decodePng(entries[name]);
      } catch {
        throw damaged();
      }
      if (img.width !== d.width || img.height !== d.height) throw damaged();
      drawings[id] = { id: str(d.id, id), kind: 'pixel', width: img.width, height: img.height, pixels: img.pixels };
    } else if (d.kind === 'tilemap') {
      const columns = Math.round(num(d.columns, 0));
      const rows = Math.round(num(d.rows, 0));
      if (columns < 1 || rows < 1 || columns * rows > 4_000_000 || !Array.isArray(d.cells) || d.cells.length !== columns * rows) throw damaged();
      const cells = new Uint32Array(columns * rows);
      for (let i = 0; i < cells.length; i++) cells[i] = num(d.cells[i], 0) >>> 0;
      drawings[id] = { id: str(d.id, id), kind: 'tilemap', columns, rows, cells };
    } else if (d.kind === 'camera') {
      const v = isObj(d.view) ? d.view : {};
      const zoom = num(v.zoom, 1);
      drawings[id] = { id: str(d.id, id), kind: 'camera', view: { x: num(v.x, width / 2), y: num(v.y, height / 2), zoom: zoom > 0 ? zoom : 1, rotation: num(v.rotation, 0) } };
    } else {
      warnings.push('One drawing could not be read and was left out.');
    }
  }

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
        ...(typeof l.depth === 'number' && Number.isFinite(l.depth) && l.depth ? { depth: Math.max(-0.9, Math.min(100, l.depth)) } : {}),
        ...readBind(l.bind),
        ...readLayerLook(l),
        cels,
      };
      if (l.kind === 'pixel') layers.push({ ...base, kind: 'pixel', pixelSize: Math.max(1, Math.round(num(l.pixelSize, 1))), ...(l.paletteLock === true ? { paletteLock: true } : {}) });
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
  const doc: Doc = {
    format: 'frameling',
    version: FORMAT_VERSION,
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
    clips: Array.isArray(raw.clips) ? raw.clips.filter((c: any) => isObj(c) && typeof c.id === 'string') : [],
    markers: Array.isArray(raw.markers) ? raw.markers.filter((m: any) => isObj(m) && typeof m.id === 'string') : [],
    swatches: Array.isArray(raw.swatches) ? raw.swatches.filter((s: any) => isObj(s) && typeof s.id === 'string' && typeof s.color === 'string') : [],
    ...readPalette(raw.palette),
    ...readFolders(raw.folders, layers),
    ...readSymbols(raw.symbols, readLayers, warnings),
  };
  const flow = readFlow(raw.flow, doc.clips);
  if (flow) doc.flow = flow;
  if (tileset) doc.tileset = tileset;
  const audio = unpackAudio(raw.audio, entries, warnings);
  if (audio) doc.audio = audio;
  const guides = readGuides(raw.guides);
  if (guides) doc.guides = guides;
  if (isObj(raw.inOut) && Number.isFinite(raw.inOut.start) && Number.isFinite(raw.inOut.end)) {
    const a = Math.max(0, Math.min(length - 1, Math.round(raw.inOut.start)));
    const b = Math.max(0, Math.min(length - 1, Math.round(raw.inOut.end)));
    doc.inOut = { start: Math.min(a, b), end: Math.max(a, b) };
  }
  if (isObj(raw.perspective) && Array.isArray(raw.perspective.points)) {
    const points = raw.perspective.points.filter((p: any) => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 2).map((p: any) => ({ x: p.x as number, y: p.y as number }));
    if (points.length) doc.perspective = { points };
  }
  Object.assign(doc, readArtboards(raw, entries, warnings, { readLayers, readFlow, readGuides }));
  return doc;
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
  if (typeof t.spin === 'number' && Number.isFinite(t.spin) && t.spin) tween.spin = Math.round(t.spin);
  if (isObj(t.path) && Array.isArray(t.path.points)) {
    const points = t.path.points.filter((p: any) => isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p: any) => ({ x: p.x, y: p.y, ...(isObj(p.c1) && isObj(p.c2) ? { c1: { x: num(p.c1.x, p.x), y: num(p.c1.y, p.y) }, c2: { x: num(p.c2.x, p.x), y: num(p.c2.y, p.y) } } : {}) }));
    if (points.length > 1) tween.path = { points, orient: bool(t.path.orient, false) };
  }
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

/** An instance shape with every field present and sane, or null. */
function readInstance(s: any): InstanceShape | null {
  if (typeof s.symbolId !== 'string' || typeof s.id !== 'string') return null;
  const t = isObj(s.transform) ? s.transform : {};
  const tint = isObj(s.tint) && typeof s.tint.color === 'string' ? { color: s.tint.color, amount: Math.min(1, Math.max(0, num(s.tint.amount, 0))) } : undefined;
  return {
    id: s.id,
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
    tiles.push({ key, name: str(t.name, 'Tile ' + (tiles.length + 1)), frames: frames.map((f: any) => ({ drawingId: f.drawingId, duration: Math.max(1, Math.round(num(f.duration, 1))) })) });
  }
  const top = Math.max(0, ...keys);
  return { tileWidth, tileHeight, tiles, nextKey: Math.max(top + 1, Math.round(num(raw.nextKey, 1))) };
}

/** The pixel palette, if the file has a usable one. */
function readPalette(p: unknown): { palette?: Doc['palette'] } {
  if (!isObj(p) || !Array.isArray(p.colors)) return {};
  const colors = p.colors.filter((c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)).slice(0, 256);
  const ramps = Array.isArray(p.ramps) ? [...new Set<number>(p.ramps.filter((n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) < colors.length))].sort((a, b) => a - b) : [];
  return { palette: { name: str(p.name, 'Palette'), colors, ...(ramps.length ? { ramps } : {}) } };
}

/** Just the document, for callers that do not care about warnings. */
export function parseFile(bytes: Uint8Array): Doc {
  return loadFile(bytes).doc;
}
