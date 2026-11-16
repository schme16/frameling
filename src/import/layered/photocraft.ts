// A Photocraft file (.pcraft or .photocraft): a zip with a manifest.json that lists the layers, a flattened preview, and
// the pixels in content-addressed tiles (tiles/<hash>.zst, zstandard). Every layer comes across as a picture layer, with
// its name, order, opacity, blend mode, visibility, clipping and lock; what has no equivalent here is named, never dropped
// quietly. The file is somebody else's, so it is read as untrusted: sizes are capped before anything is unpacked, names
// that point outside the archive are refused, and nothing in it is ever run. Pure apart from the PNG decoder.
import { unzipSync } from 'fflate';
import type { BlendMode } from '../../core/format';
import { decodePicture } from '../../pixel/import/picture';
import { LayeredProblem, Leftovers, MAX_CANVAS_PIXELS, MAX_CANVAS_SIDE, namesOf, plural, type LayeredFile, type LayerNode } from './model';
import { unzstd, ZstdProblem } from './zstdSafe';

export const PHOTOCRAFT_EXT = /\.(pcraft|photocraft)$/i;

const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_PNG_BYTES = 128 * 1024 * 1024;
const MAX_TILE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TILE_SIDE = 1024;
const MAX_ENTRIES = 100_000;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_TILES = 60_000;
const MAX_LAYERS = 2_000;
const MAX_DEPTH = 24;
/** Pixels held for all the layers at once (each as RGBA), so a file of many full-size layers can't fill the memory. */
const MAX_TOTAL_PIXELS = 400_000_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

/** What sort of file it is, by what is inside: a zip with a manifest.json or tiles, and no OpenRaster stack. */
export function looksLikePhotocraft(names: string[]): boolean {
  return !names.includes('stack.xml') && !names.includes('maindoc.xml') && (names.includes('manifest.json') || names.some((n) => /^tiles\/.+\.zst$/.test(n)));
}

const BLENDS: Record<string, BlendMode> = {
  normal: 'normal',
  passthrough: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  colordodge: 'color-dodge',
  colorburn: 'color-burn',
  hardlight: 'hard-light',
  softlight: 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  lineardodge: 'linear-dodge',
  add: 'linear-dodge',
  subtract: 'subtract',
  divide: 'divide',
};

/** A blend mode by its name, however the file spells it ("ColorDodge", "color-dodge", "Color Dodge"); null when there is no such mode here. */
export function photocraftBlend(name: string): BlendMode | null {
  return BLENDS[name.toLowerCase().replace(/[^a-z]/g, '')] ?? null;
}

interface Entries {
  manifest: Uint8Array;
  preview?: Uint8Array;
  tiles: Map<string, Uint8Array>;
}

/** Unpacks only what is needed, after checking every name and size the zip's directory declares. */
function unpack(bytes: Uint8Array): Entries {
  let count = 0;
  let total = 0;
  let bad: string | null = null;
  const tiles = new Map<string, Uint8Array>();
  let all: Record<string, Uint8Array>;
  try {
    all = unzipSync(bytes, {
      filter: (f) => {
        if (++count > MAX_ENTRIES) {
          bad ??= `it holds more than ${MAX_ENTRIES.toLocaleString('en-GB')} files`;
          return false;
        }
        const n = f.name;
        if (n.startsWith('/') || n.includes('\\') || n.split('/').includes('..') || /^[a-z]:/i.test(n) || n.includes('\0')) {
          bad ??= `it has a file named "${n.replace(/[^\x20-\x7e]/g, '?').slice(0, 60)}", which points outside the file`;
          return false;
        }
        const tile = /^tiles\/([0-9a-f]{64})\.zst$/i.exec(n);
        const want = n === 'manifest.json' ? MAX_MANIFEST_BYTES : n === 'composite/preview.png' ? MAX_PNG_BYTES : tile ? MAX_TILE_FILE_BYTES : 0;
        if (!want) return false;
        if (f.originalSize > want) {
          bad ??= `"${n.slice(0, 40)}" is far bigger than it should be`;
          return false;
        }
        total += f.originalSize;
        if (total > MAX_TOTAL_BYTES) {
          bad ??= 'it would unpack to more than a gigabyte';
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new LayeredProblem("Frameling couldn't open that file as a Photocraft zip. It may be damaged or locked with a password.");
  }
  if (bad) throw new LayeredProblem(`That Photocraft file can't be trusted, so nothing was read: ${bad}.`);
  for (const [n, data] of Object.entries(all)) {
    const t = /^tiles\/([0-9a-f]{64})\.zst$/i.exec(n);
    if (t) tiles.set(t[1].toLowerCase(), data);
  }
  if (!all['manifest.json']) throw new LayeredProblem('That zip has no manifest.json, so it is not a Photocraft file.');
  return { manifest: all['manifest.json'], preview: all['composite/preview.png'], tiles };
}

/** The sentences for a layer kind Frameling can't draw. */
const KIND_WORDS: Record<string, string> = {
  text: 'text layers',
  type: 'text layers',
  shape: 'shape layers',
  vector: 'shape layers',
  adjustment: 'adjustment layers (levels, curves and the like)',
  fill: 'fill layers',
  smart_object: 'smart objects',
  smartobject: 'smart objects',
  video: 'video layers',
  artboard: 'artboards',
};

interface Surface {
  mode: string;
  sample: string;
  alpha: boolean;
  fill: [number, number, number, number];
  tiles: { tx: number; ty: number; hash: string }[];
  tileSide?: number;
}

function readSurface(s: unknown): Surface | string {
  if (!isObj(s)) return 'it has no picture data';
  const f = isObj(s.format) ? s.format : {};
  const mode = str(f.mode, 'Rgb');
  const sample = str(f.sample, 'U8');
  const alpha = f.alpha === undefined ? true : f.alpha === true;
  if (!Array.isArray(s.tiles)) return 'its tile list is missing';
  const tiles: Surface['tiles'] = [];
  for (const t of s.tiles) {
    if (!isObj(t)) return 'its tile list is damaged';
    const tx = int(t.tx);
    const ty = int(t.ty);
    if (tx === null || ty === null || Math.abs(tx) > 100_000 || Math.abs(ty) > 100_000 || typeof t.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(t.hash)) return 'its tile list is damaged';
    tiles.push({ tx, ty, hash: t.hash.toLowerCase() });
  }
  // The colour of the places with no tile: RGBA as hex ("00000000" is clear).
  let fill: Surface['fill'] = [0, 0, 0, 0];
  const d = str(s.default).replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(d)) fill = [0, 2, 4, 6].map((i) => parseInt(d.slice(i, i + 2), 16)) as Surface['fill'];
  else if (/^[0-9a-f]{6}$/i.test(d)) fill = [...([0, 2, 4].map((i) => parseInt(d.slice(i, i + 2), 16)) as [number, number, number]), 255];
  const side = int(s.tile_size) ?? int(s.tile_side);
  return { mode, sample, alpha, fill, tiles, ...(side && side >= 8 && side <= MAX_TILE_SIDE ? { tileSide: side } : {}) };
}

interface Budget {
  pixels: number;
  tiles: number;
}

/** One raster layer's tiles, laid out as pixels over the part of the canvas they cover. Returns a reason (a sentence part) when they can't be. */
function layerPixels(surface: Surface, width: number, height: number, entries: Entries, budget: Budget): { x: number; y: number; w: number; h: number; pixels: Uint8ClampedArray } | string {
  if (surface.mode !== 'Rgb' && surface.mode !== 'Gray') return `it is in ${surface.mode} colour, and only RGB and grey are read`;
  if (surface.sample !== 'U8') return `it is in ${surface.sample === 'U16' ? '16 bit' : surface.sample === 'F32' ? 'floating point' : surface.sample} colour, and only 8 bit is read`;
  const channels = (surface.mode === 'Rgb' ? 3 : 1) + (surface.alpha ? 1 : 0);
  let side = surface.tileSide ?? 0;
  const wantAll = surface.fill[3] > 0;
  if (!surface.tiles.length && !wantAll) return { x: 0, y: 0, w: 0, h: 0, pixels: new Uint8ClampedArray(0) };
  // The tile size is not in the manifest: it is the one a decoded tile adds up to.
  const first = surface.tiles.find((t) => entries.tiles.has(t.hash));
  if (!side && first) {
    let probe: Uint8Array;
    try {
      probe = unzstd(entries.tiles.get(first.hash)!, MAX_TILE_SIDE * MAX_TILE_SIDE * 4);
    } catch (e) {
      return `a tile can't be read (${e instanceof ZstdProblem ? e.message : 'it is damaged'})`;
    }
    const px = probe.length / channels;
    const s = Math.round(Math.sqrt(px));
    if (!Number.isInteger(px) || s * s !== px || s < 8 || s > MAX_TILE_SIDE) return 'its tiles are not a size Frameling can place';
    side = s;
  }
  if (!side) side = 256;
  const tileBytes = side * side * channels;
  // Only the part of the layer that sits on the picture is kept.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of surface.tiles) {
    x0 = Math.min(x0, t.tx * side);
    y0 = Math.min(y0, t.ty * side);
    x1 = Math.max(x1, (t.tx + 1) * side);
    y1 = Math.max(y1, (t.ty + 1) * side);
  }
  if (wantAll) {
    x0 = 0;
    y0 = 0;
    x1 = width;
    y1 = height;
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(width, x1);
  y1 = Math.min(height, y1);
  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w: 0, h: 0, pixels: new Uint8ClampedArray(0) };
  const w = x1 - x0;
  const h = y1 - y0;
  budget.pixels += w * h;
  if (budget.pixels > MAX_TOTAL_PIXELS) return 'the layers together are bigger than Frameling can hold';
  const out = new Uint8ClampedArray(w * h * 4);
  if (surface.fill[3] > 0) for (let i = 0; i < w * h; i++) out.set(surface.fill, i * 4);
  const rowOf = (data: Uint8Array, ox: number, oy: number, tw: number, th: number, tx0: number, ty0: number) => {
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const s = ((ty0 + y) * side + tx0 + x) * channels;
        const d = ((oy + y) * w + ox + x) * 4;
        if (surface.mode === 'Rgb') {
          out[d] = data[s];
          out[d + 1] = data[s + 1];
          out[d + 2] = data[s + 2];
          out[d + 3] = surface.alpha ? data[s + 3] : 255;
        } else {
          out[d] = out[d + 1] = out[d + 2] = data[s];
          out[d + 3] = surface.alpha ? data[s + 1] : 255;
        }
      }
    }
  };
  for (const t of surface.tiles) {
    const tx = t.tx * side;
    const ty = t.ty * side;
    if (tx >= x1 || ty >= y1 || tx + side <= x0 || ty + side <= y0) continue;
    const bytes = entries.tiles.get(t.hash);
    if (!bytes) return 'some of its tiles are not in the file';
    if (++budget.tiles > MAX_TILES) return 'it has more tiles than Frameling will read';
    let data: Uint8Array;
    try {
      data = unzstd(bytes, tileBytes);
    } catch (e) {
      return `a tile can't be read (${e instanceof ZstdProblem ? e.message : 'it is damaged'})`;
    }
    if (data.length !== tileBytes) return 'its tiles are not all the same size';
    const l = Math.max(tx, x0);
    const tp = Math.max(ty, y0);
    const r = Math.min(tx + side, x1);
    const b = Math.min(ty + side, y1);
    rowOf(data, l - x0, tp - y0, r - l, b - tp, l - tx, tp - ty);
  }
  return { x: x0, y: y0, w, h, pixels: out };
}

/** Reads a Photocraft file. Throws LayeredProblem in plain words when it can't. */
export async function readPhotocraft(bytes: Uint8Array): Promise<LayeredFile> {
  const entries = unpack(bytes);
  let root: unknown;
  try {
    root = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entries.manifest));
  } catch {
    throw new LayeredProblem("The layer list (manifest.json) in that Photocraft file can't be read: it isn't valid text. The file may be damaged.");
  }
  if (!isObj(root) || !isObj(root.document)) throw new LayeredProblem("That file's manifest.json isn't a Photocraft one: it has no document in it.");
  const version = num(root.format_version, 1);
  if (version < 1) throw new LayeredProblem(`That Photocraft file says it is format version ${version}, which isn't one Frameling knows.`);
  const doc = root.document;
  const size = isObj(doc.size) ? doc.size : {};
  const width = Math.round(num(size.width, 0));
  const height = Math.round(num(size.height, 0));
  if (width < 1 || height < 1) throw new LayeredProblem('That file does not say how big the picture is: it is damaged.');
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_PIXELS) throw new LayeredProblem(`That picture is ${width} x ${height}, which is bigger than Frameling can hold. Make it smaller first.`);
  if (!Array.isArray(doc.layers)) throw new LayeredProblem('That file has no layer list.');

  const left = new Leftovers();
  const info: string[] = [];
  if (version > 1) info.push(`This file is Photocraft format version ${version}, newer than the one Frameling was made for. What it understood is in; anything newer is listed.`);
  if (typeof doc.mode === 'string' && doc.mode !== 'Rgb') info.push(`The document is in ${doc.mode} colour. Layers in RGB and grey come across; others are listed.`);
  if (doc.icc_profile) info.push('The file carries a colour profile (ICC). Frameling used the colours as stored, without converting them.');
  if (doc.timeline) left.add('timeline', () => 'An animation timeline: the layers came in as a still picture.');
  const budget: Budget = { pixels: 0, tiles: 0 };
  let seen = 0;

  const walk = (list: unknown[], depth: number): LayerNode[] => {
    const out: LayerNode[] = [];
    if (depth > MAX_DEPTH) {
      left.add('deep', () => `Groups more than ${MAX_DEPTH} levels deep: the layers inside them were left out.`);
      return out;
    }
    for (const raw of list) {
      if (!isObj(raw)) continue;
      if (++seen > MAX_LAYERS) {
        left.add('many', () => `More than ${MAX_LAYERS.toLocaleString('en-GB')} layers: the rest were left out.`);
        break;
      }
      const name = str(raw.name, 'Layer').slice(0, 200) || 'Layer';
      const content = isObj(raw.content) ? raw.content : {};
      const kind = str(content.kind);
      const hidden = raw.visible === false;
      const locks = isObj(raw.locks) ? raw.locks : {};
      const locked = locks.all === true || locks.pixels === true;
      const fillOpacity = Math.max(0, Math.min(1, num(raw.fill_opacity, 1)));
      const opacity = Math.max(0, Math.min(1, num(raw.opacity, 1))) * fillOpacity;
      const blendName = str(raw.blend, 'Normal');
      let blend = photocraftBlend(blendName);
      if (!blend) {
        left.add(`blend:${blendName}`, (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) used the blend mode "${blendName}", which Frameling doesn't have: they came in as normal.`, name);
        blend = 'normal';
      }
      const fx = isObj(raw.effects) ? raw.effects : {};
      if (fx.enabled !== false && Array.isArray(fx.items) && fx.items.length) left.add('styles', (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) with layer styles (shadows, glows, strokes): they came in without the styles.`, name);
      if (raw.mask) left.add('mask', (n, names) => `${plural(n, 'layer mask')} on ${namesOf(names, n)}: the layers show in full, not cut by the mask.`, name);
      if (raw.vector_mask) left.add('vmask', (n, names) => `${plural(n, 'vector mask')} on ${namesOf(names, n)}: the layers show in full, not cut by the mask.`, name);
      const children = Array.isArray(content.layers) ? content.layers : Array.isArray(content.children) ? content.children : null;
      if (kind === 'group' || (children && kind !== 'raster')) {
        out.push({ type: 'group', name, hidden, opacity, blend, children: walk(children ?? [], depth + 1) });
        continue;
      }
      if (kind !== 'raster') {
        const words = KIND_WORDS[kind.toLowerCase()] ?? (kind ? `layers of a kind called "${kind.slice(0, 30)}"` : 'layers with no picture data');
        left.add(`kind:${kind}`, (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) that are ${words}: Frameling has nothing to draw them with, so they were left out.`, name);
        continue;
      }
      const surface = readSurface(content.surface);
      if (typeof surface === 'string') {
        left.add('unreadable', (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) whose picture can't be read: ${surface}.`, name);
        continue;
      }
      const got = layerPixels(surface, width, height, entries, budget);
      if (typeof got === 'string') {
        left.add(`unreadable:${got}`, (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) whose picture can't be read: ${got}.`, name);
        continue;
      }
      out.push({ type: 'layer', name, hidden, locked: locked || undefined, opacity, blend, clip: raw.clipped === true, x: got.x, y: got.y, width: got.w, height: got.h, pixels: got.pixels });
    }
    return out;
  };
  const nodes = walk(doc.layers, 0);

  const hasPicture = (ns: LayerNode[]): boolean => ns.some((n) => (n.type === 'group' ? hasPicture(n.children) : true));
  if (!hasPicture(nodes) && entries.preview) {
    // No layer could be read: the flattened picture the file keeps is better than nothing, and it says so.
    try {
      const pic = await decodePicture(entries.preview);
      if (pic.width === width && pic.height === height) {
        info.push('None of the layers could be read, so this is the flattened picture the file keeps (its preview), on one layer.');
        return { format: 'photocraft', width, height, nodes: [{ type: 'layer', name: str(doc.name, 'Preview'), hidden: false, opacity: 1, blend: 'normal', clip: false, x: 0, y: 0, width, height, pixels: pic.frames[0].pixels }], left: left.sentences(), info };
      }
    } catch {
      // the preview is no better: the problem below says so
    }
  }
  if (!hasPicture(nodes)) throw new LayeredProblem(`That Photocraft file has no layers that Frameling can read.${left.size ? ' ' + left.sentences()[0] : ''}`);
  return { format: 'photocraft', width, height, nodes, left: left.sentences(), info };
}
