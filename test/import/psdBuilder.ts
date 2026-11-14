// A small PSD builder for tests: unlike the app's writer (src/export/psd.ts) it can make the odd things other programs
// write: raw, RLE and zip channels, 16 bit files, adjustment and text layers, layer styles, masks in their own box,
// unusual blend modes and files in the wrong colour mode.
import { zlibSync } from 'fflate';
import { packBits } from '../../src/export/psd';

export interface TestChannel {
  id: number;
  /** One byte per pixel, width x height of the layer (or of the mask for id -2). */
  plane: Uint8Array;
  compression?: 0 | 1 | 2 | 3;
}

export interface TestLayer {
  name: string;
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  channels?: TestChannel[];
  blend?: string;
  opacity?: number;
  clipping?: boolean;
  hidden?: boolean;
  /** 1 open group, 2 closed group, 3 end of group. */
  section?: number;
  sectionBlend?: string;
  tags?: { key: string; data?: Uint8Array }[];
  mask?: { top: number; left: number; bottom: number; right: number; def: number; flags?: number; plane: Uint8Array };
  /** The old style name differs from the unicode one (leaves 'luni' out when set to false). */
  unicode?: boolean;
}

class W {
  parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 255);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  u32(v: number) {
    this.u16((v >>> 16) & 0xffff);
    this.u16(v & 0xffff);
  }
  i32(v: number) {
    this.u32(v >>> 0);
  }
  tag(s: string) {
    for (const c of s) this.u8(c.charCodeAt(0));
  }
  bytes(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.parts.push(b[i]);
  }
  get length() {
    return this.parts.length;
  }
  out() {
    return Uint8Array.from(this.parts);
  }
}

/** One channel's bytes, with its compression marker. */
export function channelData(plane: Uint8Array, w: number, h: number, depth: 8 | 16, compression: 0 | 1 | 2 | 3): Uint8Array {
  const bpc = depth === 16 ? 2 : 1;
  const raw = new Uint8Array(w * h * bpc);
  if (bpc === 1) raw.set(plane);
  else for (let i = 0; i < plane.length; i++) (raw[i * 2] = plane[i]), (raw[i * 2 + 1] = plane[i]);
  const o = new W();
  o.u16(compression);
  if (compression === 0) o.bytes(raw);
  else if (compression === 1) {
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(packBits(raw.subarray(y * w * bpc, (y + 1) * w * bpc)));
    for (const r of rows) o.u16(r.length);
    for (const r of rows) o.bytes(r);
  } else if (compression === 2) o.bytes(zlibSync(raw));
  else {
    const d = raw.slice();
    for (let y = 0; y < h; y++) {
      const row = y * w * bpc;
      if (bpc === 1) for (let x = w - 1; x >= 1; x--) d[row + x] = (raw[row + x] - raw[row + x - 1]) & 255;
      else
        for (let x = w - 1; x >= 1; x--) {
          const p = row + x * 2;
          const diff = (((raw[p] << 8) | raw[p + 1]) - ((raw[p - 2] << 8) | raw[p - 1])) & 0xffff;
          d[p] = diff >> 8;
          d[p + 1] = diff & 255;
        }
    }
    o.bytes(zlibSync(d));
  }
  return o.out();
}

export interface BuildOptions {
  width: number;
  height: number;
  depth?: 8 | 16;
  /** 3 RGB, 1 grey, 4 CMYK... */
  mode?: number;
  version?: 1 | 2;
  layers: TestLayer[];
  /** Put the layers in an Lr16 block after an empty layer section (how 16 bit files do it). */
  lr16?: boolean;
  /** Flat picture for a file with no layers: one plane per channel. */
  merged?: { planes: Uint8Array[]; compression?: 0 | 1 };
}

export function buildPsd(o: BuildOptions): Uint8Array {
  const depth = o.depth ?? 8;
  const out = new W();
  out.tag('8BPS');
  out.u16(o.version ?? 1);
  for (let i = 0; i < 6; i++) out.u8(0);
  out.u16(o.merged ? o.merged.planes.length : 3);
  out.u32(o.height);
  out.u32(o.width);
  out.u16(depth);
  out.u16(o.mode ?? 3);
  out.u32(0);
  out.u32(0);

  const li = new W();
  li.u16(o.layers.length & 0xffff);
  const datas: Uint8Array[] = [];
  for (const l of o.layers) {
    const top = l.top ?? 0;
    const left = l.left ?? 0;
    const bottom = l.bottom ?? top;
    const right = l.right ?? left;
    const w = right - left;
    const h = bottom - top;
    const chans = (l.channels ?? []).map((c) => ({ id: c.id, bytes: channelData(c.plane, c.id === -2 && l.mask ? l.mask.right - l.mask.left : w, c.id === -2 && l.mask ? l.mask.bottom - l.mask.top : h, depth, c.compression ?? 1) }));
    if (l.mask) chans.push({ id: -2, bytes: channelData(l.mask.plane, l.mask.right - l.mask.left, l.mask.bottom - l.mask.top, depth, 1) });
    li.i32(top);
    li.i32(left);
    li.i32(bottom);
    li.i32(right);
    li.u16(chans.length);
    for (const c of chans) {
      li.u16(c.id & 0xffff);
      li.u32(c.bytes.length);
    }
    li.tag('8BIM');
    li.tag(l.blend ?? 'norm');
    li.u8(l.opacity ?? 255);
    li.u8(l.clipping ? 1 : 0);
    li.u8(l.hidden ? 2 : 0);
    li.u8(0);
    const ex = new W();
    if (l.mask) {
      ex.u32(20);
      ex.i32(l.mask.top);
      ex.i32(l.mask.left);
      ex.i32(l.mask.bottom);
      ex.i32(l.mask.right);
      ex.u8(l.mask.def);
      ex.u8(l.mask.flags ?? 0);
      ex.u16(0);
    } else ex.u32(0);
    ex.u32(0);
    // The old style name, padded to a multiple of 4.
    const old = [...l.name].map((c) => (c.charCodeAt(0) < 128 ? c : '?')).join('').slice(0, 255);
    ex.u8(old.length);
    for (const c of old) ex.u8(c.charCodeAt(0));
    for (let i = (old.length + 1) % 4; i % 4 && i !== 0; i++) ex.u8(0);
    const block = (key: string, data: Uint8Array) => {
      ex.tag('8BIM');
      ex.tag(key);
      const padded = data.length + ((4 - (data.length % 4)) % 4);
      ex.u32(padded);
      ex.bytes(data);
      for (let i = data.length; i < padded; i++) ex.u8(0);
    };
    if (l.unicode !== false) {
      const u = new W();
      u.u32(l.name.length);
      for (const c of l.name) u.u16(c.charCodeAt(0));
      block('luni', u.out());
    }
    if (l.section) {
      const s = new W();
      s.u32(l.section);
      if (l.sectionBlend) {
        s.tag('8BIM');
        s.tag(l.sectionBlend);
      }
      block('lsct', s.out());
    }
    for (const t of l.tags ?? []) block(t.key, t.data ?? new Uint8Array(4));
    const eb = ex.out();
    li.u32(eb.length);
    li.bytes(eb);
    for (const c of chans) datas.push(c.bytes);
  }
  for (const d of datas) li.bytes(d);
  let lb = li.out();
  if (lb.length % 2) lb = Uint8Array.from([...lb, 0]);

  const info = new W();
  if (o.lr16) {
    info.u32(0);
    info.u32(0);
    info.tag('8BIM');
    info.tag('Lr16');
    info.u32(lb.length);
    info.bytes(lb);
  } else {
    info.u32(lb.length);
    info.bytes(lb);
    info.u32(0);
  }
  const ib = info.out();
  out.u32(ib.length);
  out.bytes(ib);
  if (o.merged) {
    const c = o.merged.compression ?? 0;
    out.u16(c);
    if (c === 0) for (const p of o.merged.planes) out.bytes(p);
    else {
      const rows = o.merged.planes.map((p) => Array.from({ length: o.height }, (_, y) => packBits(p.subarray(y * o.width, (y + 1) * o.width))));
      for (const pr of rows) for (const r of pr) out.u16(r.length);
      for (const pr of rows) for (const r of pr) out.bytes(r);
    }
  } else out.u16(0);
  return out.out();
}

/** Planes of one flat colour for a layer of w x h: R, G, B and alpha as the channels. */
export function solid(w: number, h: number, r: number, g: number, b: number, a = 255, compression?: 0 | 1 | 2 | 3): TestChannel[] {
  const f = (v: number) => new Uint8Array(w * h).fill(v);
  return [
    { id: -1, plane: f(a), compression },
    { id: 0, plane: f(r), compression },
    { id: 1, plane: f(g), compression },
    { id: 2, plane: f(b), compression },
  ];
}
