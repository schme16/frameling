/**
 * Reads an Aseprite file (.aseprite / .ase) into plain data, following the official spec
 * (github.com/aseprite/aseprite, docs/ase-file-specs.md). Bytes in, objects out: no DOM, nothing from the app.
 *
 * Pixels stay in the file's own format here (RGBA, grayscale or indexed); `celRgba` turns one cel into RGBA.
 */
import { unzlibSync } from 'fflate';

/** An error with words fit to show to a person. */
export class AsepriteProblem extends Error {}

export type Depth = 8 | 16 | 32;

export interface AseColor {
  r: number;
  g: number;
  b: number;
  a: number;
  name?: string;
}

export interface AseProps {
  [key: string]: unknown;
}

export interface AseUserData {
  text?: string;
  color?: [number, number, number, number];
  props?: AseProps;
}

export const LAYER_NORMAL = 0;
export const LAYER_GROUP = 1;
export const LAYER_TILEMAP = 2;

export interface AseLayer {
  index: number;
  name: string;
  type: number;
  /** Nesting level (0 = top level). */
  level: number;
  visible: boolean;
  editable: boolean;
  lockMovement: boolean;
  background: boolean;
  preferLinked: boolean;
  collapsed: boolean;
  reference: boolean;
  /** Blend mode number as in the spec. */
  blend: number;
  /** 0 to 255. Already 255 when the file says layer opacity is not valid. */
  opacity: number;
  tileset: number;
  userData?: AseUserData;
}

export const CEL_RAW = 0;
export const CEL_LINKED = 1;
export const CEL_IMAGE = 2;
export const CEL_TILEMAP = 3;

export interface AseImage {
  width: number;
  height: number;
  /** Pixels in the file's format: 4, 2 or 1 byte each. */
  data: Uint8Array;
}

export interface AseTilemap {
  width: number;
  height: number;
  idMask: number;
  flipX: number;
  flipY: number;
  flipD: number;
  tiles: Uint32Array;
}

export interface AseCel {
  layer: number;
  frame: number;
  x: number;
  y: number;
  opacity: number;
  type: number;
  z: number;
  /** For a linked cel: the frame whose cel (on the same layer) this one shows. */
  link?: number;
  image?: AseImage;
  tilemap?: AseTilemap;
  /** Precise bounds from a cel extra chunk (scaled cels, used by reference layers). */
  extra?: { x: number; y: number; width: number; height: number };
  userData?: AseUserData;
}

export interface AseFrame {
  /** Milliseconds. */
  duration: number;
  cels: AseCel[];
  /** The palette in effect from this frame on, when this frame changed it. */
  palette?: AseColor[];
}

export interface AseTag {
  from: number;
  to: number;
  /** 0 forward, 1 reverse, 2 ping-pong, 3 ping-pong reverse. */
  direction: number;
  /** 0 = not specified (loops). */
  repeat: number;
  name: string;
  color?: [number, number, number, number];
  userData?: AseUserData;
}

export interface AseSliceKey {
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  center?: { x: number; y: number; width: number; height: number };
  pivot?: { x: number; y: number };
}

export interface AseSlice {
  name: string;
  keys: AseSliceKey[];
  nine: boolean;
  hasPivot: boolean;
  userData?: AseUserData;
}

export interface AseTileset {
  id: number;
  name: string;
  tileCount: number;
  tileWidth: number;
  tileHeight: number;
  baseIndex: number;
  /** True when tile 0 is the empty tile (the usual, newer way). */
  zeroEmpty: boolean;
  /** True when the tiles live in another file we can't read. */
  external: boolean;
  /** tileWidth x (tileHeight * tileCount) pixels in the file's format, when included. */
  image?: AseImage;
  userData?: AseUserData;
}

export interface AseColorProfile {
  type: number;
  gamma?: number;
}

export interface AseFile {
  width: number;
  height: number;
  depth: Depth;
  flags: number;
  /** Header speed (ms), the duration for frames that don't say. */
  speed: number;
  transparentIndex: number;
  pixelWidth: number;
  pixelHeight: number;
  grid?: { x: number; y: number; width: number; height: number };
  frames: AseFrame[];
  layers: AseLayer[];
  /** The palette at the first frame (null when the file has none). */
  palette: AseColor[] | null;
  /** True when a later frame changes the palette. */
  paletteChanges: boolean;
  tags: AseTag[];
  slices: AseSlice[];
  tilesets: AseTileset[];
  colorProfile?: AseColorProfile;
  userData?: AseUserData;
  /** Chunk kinds that were skipped because they are unknown or unsupported. */
  skipped: string[];
}

class Reader {
  readonly v: DataView;
  constructor(
    readonly b: Uint8Array,
    public p = 0,
    readonly end = b.length,
  ) {
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  need(n: number): void {
    if (this.p + n > this.end || this.p < 0) throw new AsepriteProblem('This Aseprite file ends too soon, so it may be damaged.');
  }
  u8(): number {
    this.need(1);
    return this.b[this.p++];
  }
  i8(): number {
    this.need(1);
    return this.v.getInt8(this.p++);
  }
  u16(): number {
    this.need(2);
    const r = this.v.getUint16(this.p, true);
    this.p += 2;
    return r;
  }
  i16(): number {
    this.need(2);
    const r = this.v.getInt16(this.p, true);
    this.p += 2;
    return r;
  }
  u32(): number {
    this.need(4);
    const r = this.v.getUint32(this.p, true);
    this.p += 4;
    return r;
  }
  i32(): number {
    this.need(4);
    const r = this.v.getInt32(this.p, true);
    this.p += 4;
    return r;
  }
  fixed(): number {
    return this.i32() / 65536;
  }
  f32(): number {
    this.need(4);
    const r = this.v.getFloat32(this.p, true);
    this.p += 4;
    return r;
  }
  f64(): number {
    this.need(8);
    const r = this.v.getFloat64(this.p, true);
    this.p += 8;
    return r;
  }
  u64(): number {
    this.need(8);
    const r = Number(this.v.getBigUint64(this.p, true));
    this.p += 8;
    return r;
  }
  i64(): number {
    this.need(8);
    const r = Number(this.v.getBigInt64(this.p, true));
    this.p += 8;
    return r;
  }
  skip(n: number): void {
    this.need(n);
    this.p += n;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const r = this.b.subarray(this.p, this.p + n);
    this.p += n;
    return r;
  }
  str(): string {
    const n = this.u16();
    return new TextDecoder().decode(this.bytes(n));
  }
}

const PIXEL_BYTES: Record<Depth, number> = { 8: 1, 16: 2, 32: 4 };
/** Far beyond any real sprite; stops a made-up size from asking for gigabytes. */
const MAX_IMAGE_BYTES = 512 * 1024 * 1024;

function inflate(data: Uint8Array, expected: number): Uint8Array {
  if (expected > MAX_IMAGE_BYTES) throw new AsepriteProblem('An image inside this Aseprite file is too big to open.');
  try {
    const out = unzlibSync(data, { out: new Uint8Array(expected) });
    return out.length === expected ? out : out.subarray(0, expected);
  } catch {
    throw new AsepriteProblem('An image inside this Aseprite file could not be unpacked, so the file may be damaged.');
  }
}

function readImage(r: Reader, depth: Depth, compressed: boolean, end: number): AseImage {
  const width = r.u16();
  const height = r.u16();
  const size = width * height * PIXEL_BYTES[depth];
  const data = compressed ? inflate(r.bytes(end - r.p), size) : r.bytes(size);
  if (data.length < size) throw new AsepriteProblem('An image inside this Aseprite file is cut short.');
  return { width, height, data };
}

/** One property value of a user data chunk, as plain JSON-able data. */
function readPropValue(r: Reader, type: number, depth = 0): unknown {
  if (depth > 128) throw new AsepriteProblem('This Aseprite file has properties nested too deeply.');
  switch (type) {
    case 0x0001:
      return r.u8() !== 0;
    case 0x0002:
      return r.i8();
    case 0x0003:
      return r.u8();
    case 0x0004:
      return r.i16();
    case 0x0005:
      return r.u16();
    case 0x0006:
      return r.i32();
    case 0x0007:
      return r.u32();
    case 0x0008:
      return r.i64();
    case 0x0009:
      return r.u64();
    case 0x000a:
      return r.fixed();
    case 0x000b:
      return r.f32();
    case 0x000c:
      return r.f64();
    case 0x000d:
      return r.str();
    case 0x000e:
      return { x: r.i32(), y: r.i32() };
    case 0x000f:
      return { width: r.i32(), height: r.i32() };
    case 0x0010:
      return { x: r.i32(), y: r.i32(), width: r.i32(), height: r.i32() };
    case 0x0011: {
      const n = r.u32();
      const elementType = r.u16();
      const out: unknown[] = [];
      for (let i = 0; i < n; i++) out.push(readPropValue(r, elementType === 0 ? r.u16() : elementType, depth + 1));
      return out;
    }
    case 0x0012: {
      const n = r.u32();
      return readProps(r, n, depth + 1);
    }
    case 0x0013: {
      return [...r.bytes(16)].map((x) => x.toString(16).padStart(2, '0')).join('');
    }
    default:
      throw new AsepriteProblem('This Aseprite file has a property of a kind Frameling does not know.');
  }
}

function readProps(r: Reader, count: number, depth: number): AseProps {
  const out: AseProps = {};
  for (let i = 0; i < count; i++) {
    const name = r.str();
    const type = r.u16();
    const value = readPropValue(r, type, depth);
    if (name !== '__proto__' && name !== 'constructor' && name !== 'prototype') out[name] = value;
  }
  return out;
}

function readUserData(r: Reader): AseUserData {
  const flags = r.u32();
  const out: AseUserData = {};
  if (flags & 1) out.text = r.str();
  if (flags & 2) out.color = [r.u8(), r.u8(), r.u8(), r.u8()];
  if (flags & 4) {
    r.u32();
    const maps = r.u32();
    const props: AseProps = {};
    for (let m = 0; m < maps; m++) {
      const key = r.u32();
      const n = r.u32();
      const one = readProps(r, n, 0);
      if (key === 0) Object.assign(props, one);
      else props[`ext${key}`] = one;
    }
    out.props = props;
  }
  return out;
}

const hasData = (u: AseUserData): boolean => u.text !== undefined || u.color !== undefined || (u.props !== undefined && Object.keys(u.props).length > 0);

/** The pieces of the file's user data that have something in them, or undefined. */
const keepUser = (u: AseUserData | undefined): AseUserData | undefined => (u && hasData(u) ? u : undefined);

export function parseAseprite(bytes: Uint8Array): AseFile {
  if (bytes.length < 128) throw new AsepriteProblem("That doesn't look like an Aseprite file (it is too small).");
  const r = new Reader(bytes);
  r.u32();
  if (r.u16() !== 0xa5e0) throw new AsepriteProblem("That doesn't look like an Aseprite file (.aseprite or .ase).");
  const frameCount = r.u16();
  const width = r.u16();
  const height = r.u16();
  const depthBits = r.u16();
  if (depthBits !== 8 && depthBits !== 16 && depthBits !== 32) throw new AsepriteProblem(`This Aseprite file uses a colour depth (${depthBits} bits) Frameling can't read.`);
  const depth = depthBits as Depth;
  const flags = r.u32();
  const speed = r.u16();
  r.skip(8);
  const transparentIndex = r.u8();
  r.skip(3);
  r.u16();
  const pixelWidth = r.u8();
  const pixelHeight = r.u8();
  const gx = r.i16();
  const gy = r.i16();
  const gw = r.u16();
  const gh = r.u16();
  r.p = 128;
  if (width < 1 || height < 1) throw new AsepriteProblem('This Aseprite file has no canvas size.');
  if (frameCount < 1) throw new AsepriteProblem('This Aseprite file has no frames.');

  const file: AseFile = {
    width,
    height,
    depth,
    flags,
    speed: speed || 100,
    transparentIndex,
    pixelWidth: pixelWidth || 1,
    pixelHeight: pixelHeight || 1,
    ...(gw && gh ? { grid: { x: gx, y: gy, width: gw, height: gh } } : {}),
    frames: [],
    layers: [],
    palette: null,
    paletteChanges: false,
    tags: [],
    slices: [],
    tilesets: [],
    skipped: [],
  };
  const skipped = new Set<string>();
  const layerOpacityValid = (flags & 1) !== 0;
  const groupBlendValid = (flags & 2) !== 0;

  // The palette as the frames go along. Old and new palette chunks both change it.
  let palette: AseColor[] = [];
  let sawNewPalette = false;
  const setColor = (i: number, c: AseColor) => {
    while (palette.length <= i) palette.push({ r: 0, g: 0, b: 0, a: 255 });
    palette[i] = c;
  };

  for (let f = 0; f < frameCount; f++) {
    const start = r.p;
    const frameBytes = r.u32();
    if (r.u16() !== 0xf1fa) throw new AsepriteProblem('This Aseprite file has a frame that is not where it should be, so the file may be damaged.');
    const oldChunks = r.u16();
    const duration = r.u16();
    r.skip(2);
    const newChunks = r.u32();
    const chunkCount = newChunks || (oldChunks === 0xffff ? 0 : oldChunks);
    const frameEnd = Math.min(bytes.length, start + frameBytes);
    const frame: AseFrame = { duration: duration || file.speed, cels: [] };
    file.frames.push(frame);

    // What the user data chunk that follows belongs to.
    type Target = { userData?: AseUserData };
    let last: Target | null = null;
    let tagTargets: Target[] = [];
    let tilesetTarget: AseTileset | null = null;
    let userAfterTileset = 0;
    let lastCel: AseCel | null = null;
    let paletteChanged = false;

    for (let c = 0; c < chunkCount && r.p + 6 <= frameEnd; c++) {
      const cstart = r.p;
      const size = r.u32();
      const type = r.u16();
      const cend = Math.min(frameEnd, cstart + size);
      if (size < 6) throw new AsepriteProblem('This Aseprite file has a damaged chunk.');
      switch (type) {
        case 0x0004:
        case 0x0011: {
          // Old palettes; the new chunk wins when there is one.
          if (sawNewPalette) break;
          const scale = type === 0x0011 ? 4 : 1;
          const packets = r.u16();
          let at = 0;
          for (let k = 0; k < packets; k++) {
            at += r.u8();
            const n = r.u8() || 256;
            for (let j = 0; j < n; j++) {
              const R = r.u8() * scale;
              const G = r.u8() * scale;
              const B = r.u8() * scale;
              setColor(at++, { r: Math.min(255, R), g: Math.min(255, G), b: Math.min(255, B), a: 255 });
            }
          }
          paletteChanged = true;
          break;
        }
        case 0x2004: {
          const lf = r.u16();
          const ltype = r.u16();
          const level = r.u16();
          r.skip(4);
          const blend = r.u16();
          const opacity = r.u8();
          r.skip(3);
          const name = r.str();
          let tileset = 0;
          if (ltype === LAYER_TILEMAP) tileset = r.u32();
          const group = ltype === LAYER_GROUP;
          const layer: AseLayer = {
            index: file.layers.length,
            name,
            type: ltype,
            level,
            visible: !!(lf & 1),
            editable: !!(lf & 2),
            lockMovement: !!(lf & 4),
            background: !!(lf & 8),
            preferLinked: !!(lf & 16),
            collapsed: !!(lf & 32),
            reference: !!(lf & 64),
            blend: group && !groupBlendValid ? 0 : blend,
            opacity: group ? (groupBlendValid && layerOpacityValid ? opacity : 255) : layerOpacityValid ? opacity : 255,
            tileset,
          };
          file.layers.push(layer);
          last = layer;
          break;
        }
        case 0x2005: {
          const layer = r.u16();
          const x = r.i16();
          const y = r.i16();
          const opacity = r.u8();
          const ctype = r.u16();
          const z = r.i16();
          r.skip(5);
          const cel: AseCel = { layer, frame: f, x, y, opacity, type: ctype, z };
          if (ctype === CEL_RAW || ctype === CEL_IMAGE) cel.image = readImage(r, depth, ctype === CEL_IMAGE, cend);
          else if (ctype === CEL_LINKED) cel.link = r.u16();
          else if (ctype === CEL_TILEMAP) {
            const w = r.u16();
            const h = r.u16();
            const bits = r.u16();
            const idMask = r.u32();
            const flipX = r.u32();
            const flipY = r.u32();
            const flipD = r.u32();
            r.skip(10);
            const per = bits / 8;
            if (per !== 1 && per !== 2 && per !== 4) throw new AsepriteProblem('This Aseprite file has tiles of a size Frameling does not know.');
            const raw = inflate(r.bytes(cend - r.p), w * h * per);
            const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
            const tiles = new Uint32Array(w * h);
            for (let i = 0; i < tiles.length; i++) tiles[i] = per === 4 ? dv.getUint32(i * 4, true) : per === 2 ? dv.getUint16(i * 2, true) : raw[i];
            cel.tilemap = { width: w, height: h, idMask, flipX, flipY, flipD, tiles };
          } else {
            skipped.add(`cel type ${ctype}`);
          }
          frame.cels.push(cel);
          lastCel = cel;
          last = cel;
          break;
        }
        case 0x2006: {
          const ef = r.u32();
          const px = r.fixed();
          const py = r.fixed();
          const pw = r.fixed();
          const ph = r.fixed();
          if ((ef & 1) && lastCel) lastCel.extra = { x: px, y: py, width: pw, height: ph };
          break;
        }
        case 0x2007: {
          const t = r.u16();
          const cf = r.u16();
          const gamma = r.fixed();
          file.colorProfile = { type: t, ...(cf & 1 ? { gamma } : {}) };
          break;
        }
        case 0x2018: {
          const n = r.u16();
          r.skip(8);
          tagTargets = [];
          for (let k = 0; k < n; k++) {
            const from = r.u16();
            const to = r.u16();
            const direction = r.u8();
            const repeat = r.u16();
            r.skip(6);
            const rgb: [number, number, number, number] = [r.u8(), r.u8(), r.u8(), 255];
            r.skip(1);
            const name = r.str();
            const tag: AseTag = { from, to, direction, repeat, name, color: rgb };
            file.tags.push(tag);
            tagTargets.push(tag);
          }
          last = null;
          break;
        }
        case 0x2019: {
          const total = r.u32();
          const from = r.u32();
          const to = r.u32();
          r.skip(8);
          if (total > 100000 || to < from || to >= total + 1) throw new AsepriteProblem('This Aseprite file has a palette that is not right.');
          if (!sawNewPalette) palette = [];
          sawNewPalette = true;
          for (let i = from; i <= to; i++) {
            const ef = r.u16();
            const color: AseColor = { r: r.u8(), g: r.u8(), b: r.u8(), a: r.u8() };
            if (ef & 1) color.name = r.str();
            setColor(i, color);
          }
          palette.length = Math.min(Math.max(palette.length, 0), total);
          paletteChanged = true;
          break;
        }
        case 0x2020: {
          const u = keepUser(readUserData(r));
          if (tagTargets.length) {
            const t = tagTargets.shift()!;
            if (u) {
              t.userData = u;
              if (u.color && 'from' in t) (t as AseTag).color = u.color;
            }
          } else if (tilesetTarget && userAfterTileset >= 0) {
            // The first one is the tileset's own, the rest are its tiles' (not kept).
            if (userAfterTileset === 0 && u) tilesetTarget.userData = u;
            userAfterTileset++;
          } else if (last && u) last.userData = u;
          else if (!last && u && file.frames.length === 1 && !file.userData) file.userData = u;
          break;
        }
        case 0x2022: {
          const n = r.u32();
          const sf = r.u32();
          r.skip(4);
          const name = r.str();
          const slice: AseSlice = { name, keys: [], nine: !!(sf & 1), hasPivot: !!(sf & 2) };
          for (let k = 0; k < n; k++) {
            const key: AseSliceKey = { frame: r.u32(), x: r.i32(), y: r.i32(), width: r.u32(), height: r.u32() };
            if (sf & 1) key.center = { x: r.i32(), y: r.i32(), width: r.u32(), height: r.u32() };
            if (sf & 2) key.pivot = { x: r.i32(), y: r.i32() };
            slice.keys.push(key);
          }
          file.slices.push(slice);
          last = slice;
          break;
        }
        case 0x2023: {
          const id = r.u32();
          const tf = r.u32();
          const tileCount = r.u32();
          const tileWidth = r.u16();
          const tileHeight = r.u16();
          const baseIndex = r.i16();
          r.skip(14);
          const name = r.str();
          const ts: AseTileset = { id, name, tileCount, tileWidth, tileHeight, baseIndex, zeroEmpty: !!(tf & 4), external: !!(tf & 1) && !(tf & 2) };
          if (tf & 1) {
            r.u32();
            r.u32();
          }
          if (tf & 2) {
            const len = r.u32();
            const size = tileWidth * tileHeight * tileCount * PIXEL_BYTES[depth];
            const data = inflate(r.bytes(Math.min(len, cend - r.p)), size);
            ts.image = { width: tileWidth, height: tileHeight * tileCount, data };
          }
          file.tilesets.push(ts);
          tilesetTarget = ts;
          userAfterTileset = 0;
          last = null;
          break;
        }
        case 0x2008:
        case 0x2016:
        case 0x2017:
          skipped.add(type === 0x2008 ? 'external files list' : type === 0x2016 ? 'old mask' : 'path');
          break;
        default:
          skipped.add(`chunk 0x${type.toString(16)}`);
      }
      r.p = cend;
    }
    // Where the frame says it ends is where the next one starts.
    r.p = start + frameBytes;
    if (paletteChanged) {
      if (f === 0) file.palette = palette.map((c) => ({ ...c }));
      else {
        file.paletteChanges = true;
        frame.palette = palette.map((c) => ({ ...c }));
      }
    }
  }
  file.skipped = [...skipped];
  return file;
}

/** The palette that is in effect at a frame (the last one set at or before it). */
export function paletteAt(file: AseFile, frame: number): AseColor[] | null {
  for (let f = Math.min(frame, file.frames.length - 1); f >= 1; f--) {
    const p = file.frames[f].palette;
    if (p) return p;
  }
  return file.palette;
}

/**
 * One image of the file's pixel format as RGBA. Indexed pixels use `palette` (the transparent index, and indexes the
 * palette does not have, become clear; on a background layer the transparent index is a colour like any other).
 */
export function imageRgba(file: AseFile, img: AseImage, palette: AseColor[] | null, background = false): Uint8ClampedArray {
  const n = img.width * img.height;
  const out = new Uint8ClampedArray(n * 4);
  const d = img.data;
  if (file.depth === 32) {
    out.set(d.subarray(0, n * 4));
  } else if (file.depth === 16) {
    for (let i = 0; i < n; i++) {
      const v = d[i * 2];
      const o = i * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = d[i * 2 + 1];
    }
  } else {
    for (let i = 0; i < n; i++) {
      const idx = d[i];
      const c = palette?.[idx];
      if (!c || (idx === file.transparentIndex && !background)) continue;
      const o = i * 4;
      out[o] = c.r;
      out[o + 1] = c.g;
      out[o + 2] = c.b;
      out[o + 3] = c.a;
    }
  }
  return out;
}
