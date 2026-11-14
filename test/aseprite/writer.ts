// A small Aseprite file writer for tests: builds .aseprite bytes chunk by chunk, following the official spec, so the
// reader can be checked against files whose every pixel is known. Not a full writer, just what the tests need.
import { zlibSync } from 'fflate';

class W {
  b: number[] = [];
  u8(n: number) {
    this.b.push(n & 255);
    return this;
  }
  u16(n: number) {
    this.b.push(n & 255, (n >> 8) & 255);
    return this;
  }
  i16(n: number) {
    return this.u16(n < 0 ? n + 65536 : n);
  }
  u32(n: number) {
    this.b.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
    return this;
  }
  i32(n: number) {
    return this.u32(n >>> 0);
  }
  fixed(n: number) {
    return this.i32(Math.round(n * 65536));
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.b.push(0);
    return this;
  }
  str(s: string) {
    const e = new TextEncoder().encode(s);
    this.u16(e.length);
    for (const x of e) this.b.push(x);
    return this;
  }
  bytes(a: ArrayLike<number>) {
    for (let i = 0; i < a.length; i++) this.b.push(a[i]);
    return this;
  }
  get length() {
    return this.b.length;
  }
  out() {
    return Uint8Array.from(this.b);
  }
}

export type Chunk = { type: number; body: Uint8Array };

export const chunk = (type: number, fill: (w: W) => void): Chunk => {
  const w = new W();
  fill(w);
  return { type, body: w.out() };
};

export interface LayerOpts {
  name: string;
  /** 0 normal, 1 group, 2 tilemap. */
  type?: number;
  level?: number;
  /** Bit flags: 1 visible, 2 editable, 8 background, 64 reference. Default visible and editable. */
  flags?: number;
  blend?: number;
  opacity?: number;
  tileset?: number;
}

export const layerChunk = (o: LayerOpts): Chunk =>
  chunk(0x2004, (w) => {
    w.u16(o.flags ?? 3).u16(o.type ?? 0).u16(o.level ?? 0).u16(0).u16(0).u16(o.blend ?? 0).u8(o.opacity ?? 255).zeros(3).str(o.name);
    if (o.type === 2) w.u32(o.tileset ?? 0);
  });

export interface CelOpts {
  layer: number;
  x?: number;
  y?: number;
  opacity?: number;
  z?: number;
  /** 'raw' | 'image' (compressed) | 'linked' | 'tilemap'. */
  kind: 'raw' | 'image' | 'linked' | 'tilemap';
  width?: number;
  height?: number;
  /** Pixel bytes in the file's format (RGBA 4, grayscale 2, indexed 1 per pixel). */
  data?: ArrayLike<number>;
  link?: number;
  /** Tilemap: tiles as 32-bit values (or 8/16 with `bits`). */
  tiles?: number[];
  bits?: 8 | 16 | 32;
}

export const celChunk = (o: CelOpts): Chunk =>
  chunk(0x2005, (w) => {
    const type = { raw: 0, linked: 1, image: 2, tilemap: 3 }[o.kind];
    w.u16(o.layer).i16(o.x ?? 0).i16(o.y ?? 0).u8(o.opacity ?? 255).u16(type).i16(o.z ?? 0).zeros(5);
    if (o.kind === 'linked') w.u16(o.link ?? 0);
    else if (o.kind === 'raw') w.u16(o.width!).u16(o.height!).bytes(o.data!);
    else if (o.kind === 'image') w.u16(o.width!).u16(o.height!).bytes(zlibSync(Uint8Array.from(o.data!)));
    else {
      const bits = o.bits ?? 32;
      w.u16(o.width!).u16(o.height!).u16(bits).u32(0x1fffffff).u32(0x20000000).u32(0x40000000).u32(0x80000000).zeros(10);
      const t = new W();
      for (const v of o.tiles!) bits === 32 ? t.u32(v) : bits === 16 ? t.u16(v) : t.u8(v);
      w.bytes(zlibSync(t.out()));
    }
  });

export const celExtraChunk = (x: number, y: number, width: number, height: number): Chunk =>
  chunk(0x2006, (w) => w.u32(1).fixed(x).fixed(y).fixed(width).fixed(height).zeros(16));

export const profileChunk = (type = 1): Chunk => chunk(0x2007, (w) => w.u16(type).u16(0).fixed(1).zeros(8));

/** The new palette chunk (0x2019). `named` gives each colour index a name when set. */
export const paletteChunk = (colors: [number, number, number, number?][], first = 0, total = colors.length + first): Chunk =>
  chunk(0x2019, (w) => {
    w.u32(total).u32(first).u32(first + colors.length - 1).zeros(8);
    colors.forEach(([r, g, b, a], i) => {
      const named = i === 0;
      w.u16(named ? 1 : 0).u8(r).u8(g).u8(b).u8(a ?? 255);
      if (named) w.str('first');
    });
  });

/** The old palette chunks: 0x0004 (0 to 255) or 0x0011 (0 to 63). */
export const oldPaletteChunk = (colors: [number, number, number][], type: 0x0004 | 0x0011 = 0x0004): Chunk =>
  chunk(type, (w) => {
    w.u16(1).u8(0).u8(colors.length === 256 ? 0 : colors.length);
    for (const [r, g, b] of colors) w.u8(r).u8(g).u8(b);
  });

export interface TagOpts {
  from: number;
  to: number;
  direction?: number;
  repeat?: number;
  name: string;
  color?: [number, number, number];
}

export const tagsChunk = (tags: TagOpts[]): Chunk =>
  chunk(0x2018, (w) => {
    w.u16(tags.length).zeros(8);
    for (const t of tags) {
      const [r, g, b] = t.color ?? [0, 0, 0];
      w.u16(t.from).u16(t.to).u8(t.direction ?? 0).u16(t.repeat ?? 0).zeros(6).u8(r).u8(g).u8(b).u8(0).str(t.name);
    }
  });

export interface UserOpts {
  text?: string;
  color?: [number, number, number, number];
  /** A few simple properties: numbers become int32, strings strings, booleans bool. */
  props?: Record<string, number | string | boolean>;
}

export const userChunk = (o: UserOpts): Chunk =>
  chunk(0x2020, (w) => {
    const hasProps = o.props && Object.keys(o.props).length > 0;
    w.u32((o.text !== undefined ? 1 : 0) | (o.color ? 2 : 0) | (hasProps ? 4 : 0));
    if (o.text !== undefined) w.str(o.text);
    if (o.color) w.u8(o.color[0]).u8(o.color[1]).u8(o.color[2]).u8(o.color[3]);
    if (hasProps) {
      const body = new W();
      const entries = Object.entries(o.props!);
      body.u32(entries.length);
      for (const [k, v] of entries) {
        body.str(k);
        if (typeof v === 'boolean') body.u16(1).u8(v ? 1 : 0);
        else if (typeof v === 'number') body.u16(6).i32(v);
        else body.u16(0x0d).str(v);
      }
      w.u32(8 + body.length + 4).u32(1).u32(0).bytes(body.out());
    }
  });

export interface SliceOpts {
  name: string;
  nine?: boolean;
  pivot?: boolean;
  keys: { frame: number; x: number; y: number; w: number; h: number; center?: [number, number, number, number]; pivot?: [number, number] }[];
}

export const sliceChunk = (o: SliceOpts): Chunk =>
  chunk(0x2022, (w) => {
    w.u32(o.keys.length).u32((o.nine ? 1 : 0) | (o.pivot ? 2 : 0)).u32(0).str(o.name);
    for (const k of o.keys) {
      w.u32(k.frame).i32(k.x).i32(k.y).u32(k.w).u32(k.h);
      if (o.nine) w.i32(k.center![0]).i32(k.center![1]).u32(k.center![2]).u32(k.center![3]);
      if (o.pivot) w.i32(k.pivot![0]).i32(k.pivot![1]);
    }
  });

export interface TilesetOpts {
  id?: number;
  name?: string;
  tileWidth: number;
  tileHeight: number;
  /** Tile images in the file's format, one after another. */
  data: ArrayLike<number>;
  count: number;
  /** Tile 0 is the empty tile (the usual). */
  zeroEmpty?: boolean;
  external?: boolean;
}

export const tilesetChunk = (o: TilesetOpts): Chunk =>
  chunk(0x2023, (w) => {
    const flags = (o.external ? 1 : 2) | (o.zeroEmpty === false ? 0 : 4);
    w.u32(o.id ?? 0).u32(flags).u32(o.count).u16(o.tileWidth).u16(o.tileHeight).i16(1).zeros(14).str(o.name ?? 'Tileset');
    if (o.external) w.u32(1).u32(0);
    else {
      const z = zlibSync(Uint8Array.from(o.data));
      w.u32(z.length).bytes(z);
    }
  });

export interface FrameOpts {
  duration: number;
  chunks: Chunk[];
  /** Write the chunk count in the old 16-bit field only (the default writes both). */
  oldCountOnly?: boolean;
}

export interface FileOpts {
  width: number;
  height: number;
  /** 32 RGBA, 16 grayscale, 8 indexed. */
  depth: 8 | 16 | 32;
  frames: FrameOpts[];
  /** Header flags: 1 layer opacity valid, 2 group blend valid. Default 1. */
  flags?: number;
  transparentIndex?: number;
  speed?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  grid?: [number, number, number, number];
}

export function aseFile(o: FileOpts): Uint8Array {
  const frames = o.frames.map((f) => {
    const body = new W();
    for (const c of f.chunks) body.u32(c.body.length + 6).u16(c.type).bytes(c.body);
    const w = new W();
    w.u32(body.length + 16).u16(0xf1fa).u16(f.oldCountOnly ? f.chunks.length : f.chunks.length >= 0xffff ? 0xffff : f.chunks.length).u16(f.duration).zeros(2).u32(f.oldCountOnly ? 0 : f.chunks.length).bytes(body.out());
    return w.out();
  });
  const h = new W();
  const total = 128 + frames.reduce((n, f) => n + f.length, 0);
  h.u32(total).u16(0xa5e0).u16(o.frames.length).u16(o.width).u16(o.height).u16(o.depth).u32(o.flags ?? 1).u16(o.speed ?? 100).u32(0).u32(0).u8(o.transparentIndex ?? 0).zeros(3).u16(0).u8(o.pixelWidth ?? 1).u8(o.pixelHeight ?? 1);
  const g = o.grid ?? [0, 0, 0, 0];
  h.i16(g[0]).i16(g[1]).u16(g[2]).u16(g[3]).zeros(84);
  const out = new Uint8Array(total);
  out.set(h.out(), 0);
  let at = 128;
  for (const f of frames) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}

/** RGBA bytes of a w x h image from a function of (x, y). */
export function rgbaImage(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): number[] {
  const out: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(...fn(x, y));
  return out;
}
