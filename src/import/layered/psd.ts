// A Photoshop (.psd) reader: the layers of an 8 or 16 bit RGB or grey file, with their names, order, opacity, blend mode,
// visibility, clipping, groups and layer masks. Text, smart objects, shape layers and the like come in as the pictures they
// show; adjustment layers and layer styles can't, and are counted and said. Pure: bytes in, layers out. Follows Adobe's
// "Photoshop File Formats Specification" (src/export/psd.ts is the same layout from the writing side).
import { unzlibSync } from 'fflate';
import type { BlendMode } from '../../core/format';
import { LayeredProblem, Leftovers, MAX_CANVAS_PIXELS, MAX_CANVAS_SIDE, namesOf, plural, type GroupNode, type LayeredFile, type LayerNode, type RasterNode } from './model';

const BLEND: Record<string, BlendMode> = {
  norm: 'normal',
  pass: 'normal',
  'mul ': 'multiply',
  scrn: 'screen',
  over: 'overlay',
  dark: 'darken',
  lite: 'lighten',
  'div ': 'color-dodge',
  idiv: 'color-burn',
  hLit: 'hard-light',
  sLit: 'soft-light',
  diff: 'difference',
  smud: 'exclusion',
  'hue ': 'hue',
  'sat ': 'saturation',
  colr: 'color',
  'lum ': 'luminosity',
  lddg: 'linear-dodge',
  fsub: 'subtract',
  fdiv: 'divide',
};

/** Blend modes Photoshop has that Frameling doesn't, by their names. */
const NO_BLEND: Record<string, string> = { diss: 'dissolve', lbrn: 'linear burn', dkCl: 'darker colour', lgCl: 'lighter colour', vLit: 'vivid light', lLit: 'linear light', pLit: 'pin light', hMix: 'hard mix' };

/** Layers that change the ones under them and hold no picture of their own. */
const ADJUST = new Set(['brit', 'levl', 'curv', 'expA', 'vibA', 'hue ', 'hue2', 'selc', 'mixr', 'grdm', 'phfl', 'blwh', 'thrs', 'nvrt', 'post', 'clrL', 'blnc', 'CgEd', 'CBrt']);
const FILL = new Set(['SoCo', 'GdFl', 'PtFl']);
const SMART = new Set(['SoLd', 'PlLd', 'plLd']);
const STYLES = new Set(['lrFX', 'lfx2', 'lmfx']);
const TEXT = new Set(['tySh', 'TySh']);
const VECTOR = new Set(['vmsk', 'vsms']);

const MAX_LAYER_PIXELS = 100_000_000;

class Reader {
  pos = 0;
  readonly v: DataView;
  constructor(readonly b: Uint8Array) {
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  private need(n: number) {
    if (this.pos + n > this.b.length) throw new LayeredProblem('That Photoshop file ends too early: it is cut short or damaged.');
  }
  u8() {
    this.need(1);
    return this.b[this.pos++];
  }
  u16() {
    this.need(2);
    const v = this.v.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  i16() {
    this.need(2);
    const v = this.v.getInt16(this.pos);
    this.pos += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.v.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.v.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  tag() {
    this.need(4);
    const s = String.fromCharCode(this.b[this.pos], this.b[this.pos + 1], this.b[this.pos + 2], this.b[this.pos + 3]);
    this.pos += 4;
    return s;
  }
  skip(n: number) {
    this.need(n);
    this.pos += n;
  }
  bytes(n: number) {
    this.need(n);
    const out = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

interface Chan {
  id: number;
  length: number;
}

interface MaskInfo {
  top: number;
  left: number;
  bottom: number;
  right: number;
  def: number;
  disabled: boolean;
  invert: boolean;
}

interface Rec {
  top: number;
  left: number;
  bottom: number;
  right: number;
  chans: Chan[];
  blend: string;
  opacity: number;
  clip: boolean;
  hidden: boolean;
  name: string;
  /** The section divider type: 1 open group, 2 closed group, 3 end of a group. */
  section: number;
  sectionBlend?: string;
  keys: Set<string>;
  mask: MaskInfo | null;
  fillOpacity: number;
  data: { id: number; compression: number; bytes: Uint8Array }[];
}

/** One row of PackBits. */
function unpackRow(src: Uint8Array, at: number, end: number, out: Uint8Array, outAt: number, rowBytes: number): void {
  let o = 0;
  let i = at;
  while (o < rowBytes && i < end) {
    const n = (src[i++] << 24) >> 24;
    if (n >= 0) {
      const c = Math.min(n + 1, rowBytes - o, end - i);
      out.set(src.subarray(i, i + c), outAt + o);
      i += n + 1;
      o += c;
    } else if (n !== -128) {
      const c = Math.min(1 - n, rowBytes - o);
      out.fill(src[i++], outAt + o, outAt + o + c);
      o += c;
    }
  }
}

/** A channel's bytes as one plane of 8 bit values, width x height. */
function decodePlane(bytes: Uint8Array, compression: number, w: number, h: number, depth: number): Uint8Array {
  const bpc = depth === 16 ? 2 : 1;
  const rowBytes = w * bpc;
  let raw: Uint8Array;
  if (w === 0 || h === 0) return new Uint8Array(0);
  if (compression === 0) {
    if (bytes.length < rowBytes * h) throw new LayeredProblem('A layer\'s picture is cut short: the file is damaged.');
    raw = bytes.subarray(0, rowBytes * h);
  } else if (compression === 1) {
    raw = new Uint8Array(rowBytes * h);
    if (bytes.length < h * 2) throw new LayeredProblem('A layer\'s picture is cut short: the file is damaged.');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = h * 2;
    for (let y = 0; y < h; y++) {
      const n = dv.getUint16(y * 2);
      if (at + n > bytes.length) throw new LayeredProblem('A layer\'s picture is cut short: the file is damaged.');
      unpackRow(bytes, at, at + n, raw, y * rowBytes, rowBytes);
      at += n;
    }
  } else if (compression === 2 || compression === 3) {
    try {
      raw = unzlibSync(bytes, { out: new Uint8Array(rowBytes * h) });
    } catch {
      throw new LayeredProblem('A layer\'s picture is packed in a way that is damaged.');
    }
    if (compression === 3) {
      // Each value is stored as the difference from the one before it in its row.
      for (let y = 0; y < h; y++) {
        const row = y * rowBytes;
        if (bpc === 1) for (let x = 1; x < w; x++) raw[row + x] = (raw[row + x] + raw[row + x - 1]) & 255;
        else
          for (let x = 1; x < w; x++) {
            const p = row + x * 2;
            const sum = (((raw[p] << 8) | raw[p + 1]) + ((raw[p - 2] << 8) | raw[p - 1])) & 0xffff;
            raw[p] = sum >> 8;
            raw[p + 1] = sum & 255;
          }
      }
    }
  } else throw new LayeredProblem(`A layer's picture uses a way of packing (${compression}) that Frameling doesn't know.`);
  if (bpc === 1) return raw;
  // 16 bit: keep the top byte, rounded.
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.round(((raw[i * 2] << 8) | raw[i * 2 + 1]) / 257));
  return out;
}

const unicodeName = (b: Uint8Array): string => {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 4) return '';
  const n = Math.min(dv.getUint32(0), (b.length - 4) >> 1);
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint16(4 + i * 2));
  return s.replace(/\0+$/, '');
};

function readRecord(r: Reader): Rec {
  const top = r.i32();
  const left = r.i32();
  const bottom = r.i32();
  const right = r.i32();
  const nch = r.u16();
  if (nch > 56) throw new LayeredProblem('A layer lists more channels than a Photoshop file can have: the file is damaged.');
  const chans: Chan[] = [];
  for (let i = 0; i < nch; i++) chans.push({ id: r.i16(), length: r.u32() });
  if (r.tag() !== '8BIM') throw new LayeredProblem('A layer record is not where it should be: the file is damaged.');
  const blend = r.tag();
  const opacity = r.u8();
  const clipping = r.u8();
  const flags = r.u8();
  r.skip(1);
  const extraLen = r.u32();
  const extraEnd = r.pos + extraLen;
  if (extraEnd > r.b.length) throw new LayeredProblem('That Photoshop file ends too early: it is cut short or damaged.');
  // Layer mask.
  let mask: MaskInfo | null = null;
  const maskLen = r.u32();
  if (maskLen >= 18) {
    const t = r.i32();
    const l = r.i32();
    const bo = r.i32();
    const ri = r.i32();
    const def = r.u8();
    const mflags = r.u8();
    mask = { top: t, left: l, bottom: bo, right: ri, def, disabled: !!(mflags & 2), invert: !!(mflags & 4) };
    r.skip(maskLen - 18);
  } else r.skip(maskLen);
  // Blending ranges.
  r.skip(r.u32());
  // The old style name: a length byte and text, padded so the whole is a multiple of 4.
  const nl = r.u8();
  let name = '';
  for (const c of r.bytes(nl)) name += String.fromCharCode(c);
  r.skip((4 - ((nl + 1) % 4)) % 4);
  const keys = new Set<string>();
  let section = 0;
  let sectionBlend: string | undefined;
  let fillOpacity = 255;
  while (r.pos + 12 <= extraEnd) {
    const sig = r.tag();
    if (sig !== '8BIM' && sig !== '8B64') break;
    const key = r.tag();
    const len = r.u32();
    const end = r.pos + len;
    if (end > extraEnd) break;
    keys.add(key);
    if (key === 'luni') name = unicodeName(r.bytes(len)) || name;
    else if (key === 'lsct' || key === 'lsdk') {
      section = r.u32();
      if (len >= 12) {
        r.tag();
        sectionBlend = r.tag();
      }
    } else if (key === 'iOpa') fillOpacity = r.u8();
    r.pos = end;
    // Blocks are padded; the next one starts with a signature, so step over padding until one does.
    for (let k = 0; k < 3 && r.pos + 4 <= extraEnd && !(r.b[r.pos] === 0x38 && r.b[r.pos + 1] === 0x42); k++) r.pos++;
  }
  r.pos = extraEnd;
  return { top, left, bottom, right, chans, blend, opacity, clip: clipping !== 0, hidden: !!(flags & 2), name, section, sectionBlend, keys, mask, fillOpacity, data: [] };
}

/** A layer's pixels on the canvas: the part that is inside the picture, with its layer mask applied. */
function layerPixels(rec: Rec, canvasW: number, canvasH: number, depth: number): RasterNode | null {
  const w = rec.right - rec.left;
  const h = rec.bottom - rec.top;
  if (w <= 0 || h <= 0) return null;
  const planes = new Map<number, Uint8Array>();
  for (const d of rec.data) {
    if (d.id === -2 || d.id === -3) continue;
    planes.set(d.id, decodePlane(d.bytes, d.compression, w, h, depth));
  }
  // The part of the layer that sits inside the picture.
  const x0 = Math.max(0, rec.left);
  const y0 = Math.max(0, rec.top);
  const x1 = Math.min(canvasW, rec.right);
  const y1 = Math.min(canvasH, rec.bottom);
  const vw = x1 - x0;
  const vh = y1 - y0;
  if (vw <= 0 || vh <= 0) return null;
  const px = new Uint8ClampedArray(vw * vh * 4);
  const R = planes.get(0);
  const G = planes.get(1) ?? R;
  const B = planes.get(2) ?? R;
  const A = planes.get(-1);
  if (!R) throw new LayeredProblem(`The layer "${rec.name}" has no colour channels Frameling can read.`);
  // The mask, when there is one that is on.
  const m = rec.mask && !rec.mask.disabled ? rec.mask : null;
  const mdata = m ? rec.data.find((d) => d.id === -2) : undefined;
  const mw = m ? m.right - m.left : 0;
  const mh = m ? m.bottom - m.top : 0;
  const mplane = m && mdata && mw > 0 && mh > 0 ? decodePlane(mdata.bytes, mdata.compression, mw, mh, depth) : null;
  for (let y = 0; y < vh; y++) {
    const ly = y + y0 - rec.top;
    for (let x = 0; x < vw; x++) {
      const lx = x + x0 - rec.left;
      const i = ly * w + lx;
      const o = (y * vw + x) * 4;
      px[o] = R[i];
      px[o + 1] = G![i];
      px[o + 2] = B![i];
      let a = A ? A[i] : 255;
      if (m) {
        const mx = x + x0 - m.left;
        const my = y + y0 - m.top;
        let mv = mplane && mx >= 0 && my >= 0 && mx < mw && my < mh ? mplane[my * mw + mx] : m.def;
        if (m.invert) mv = 255 - mv;
        a = Math.round((a * mv) / 255);
      }
      px[o + 3] = a;
    }
  }
  return { type: 'layer', name: rec.name, hidden: rec.hidden, opacity: 1, blend: 'normal', clip: rec.clip, x: x0, y: y0, width: vw, height: vh, pixels: px };
}

/** The picture of a file with no layers: its flattened image. */
function mergedImage(r: Reader, w: number, h: number, channels: number, depth: number): { pixels: Uint8ClampedArray } {
  const compression = r.u16();
  const bpc = depth === 16 ? 2 : 1;
  const planes: Uint8Array[] = [];
  const n = Math.min(channels, 4);
  if (compression === 0) {
    for (let c = 0; c < channels; c++) {
      const bytes = r.bytes(w * h * bpc);
      if (c < n) planes.push(decodePlane(bytes, 0, w, h, depth));
    }
  } else if (compression === 1) {
    const counts: number[] = [];
    for (let i = 0; i < channels * h; i++) counts.push(r.u16());
    for (let c = 0; c < channels; c++) {
      const rows = counts.slice(c * h, (c + 1) * h);
      const total = rows.reduce((a, b) => a + b, 0);
      const data = r.bytes(total);
      if (c >= n) continue;
      // Rebuild the per-plane layout decodePlane expects: counts, then rows.
      const buf = new Uint8Array(h * 2 + total);
      const dv = new DataView(buf.buffer);
      rows.forEach((v, i) => dv.setUint16(i * 2, v));
      buf.set(data, h * 2);
      planes.push(decodePlane(buf, 1, w, h, depth));
    }
  } else throw new LayeredProblem('The flattened picture in that file is packed in a way Frameling does not read.');
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = planes[0][i];
    px[i * 4 + 1] = (planes[1] ?? planes[0])[i];
    px[i * 4 + 2] = (planes[2] ?? planes[0])[i];
    px[i * 4 + 3] = planes[3] && planes.length >= 4 ? planes[3][i] : 255;
  }
  return { pixels: px };
}

export const isPsd = (b: Uint8Array): boolean => b.length > 26 && b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53;

/** Reads a .psd. Throws LayeredProblem in plain words when it can't. */
export function readPsd(bytes: Uint8Array): LayeredFile {
  if (!isPsd(bytes)) throw new LayeredProblem("That file isn't a Photoshop file: it doesn't start the way .psd files do.");
  const r = new Reader(bytes);
  r.skip(4);
  const version = r.u16();
  if (version === 2) throw new LayeredProblem('That is a Photoshop "large document" (.psb). Frameling reads .psd files: in Photoshop, save a copy as .psd, or flatten it down to a size .psd can hold.');
  if (version !== 1) throw new LayeredProblem('That Photoshop file is a version Frameling does not know.');
  r.skip(6);
  const channels = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();
  if (width < 1 || height < 1) throw new LayeredProblem('That Photoshop file has no size: it is damaged.');
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_PIXELS) throw new LayeredProblem(`That picture is ${width} x ${height}, which is bigger than Frameling can hold (up to ${MAX_CANVAS_SIDE} across and ${Math.round(MAX_CANVAS_PIXELS / 1e6)} million pixels). Make it smaller in Photoshop first.`);
  if (depth !== 8 && depth !== 16) throw new LayeredProblem(`That Photoshop file uses ${depth} bits per colour (${depth === 32 ? '32-bit floating point' : depth === 1 ? 'black and white only' : 'an unusual depth'}). Frameling reads 8 and 16 bit files: in Photoshop use Image > Mode > 8 Bits/Channel, then save again.`);
  const modeName: Record<number, string> = { 0: 'black and white (bitmap)', 2: 'indexed colour', 4: 'CMYK', 7: 'multichannel', 8: 'duotone', 9: 'Lab' };
  if (mode !== 1 && mode !== 3) throw new LayeredProblem(`That Photoshop file is in ${modeName[mode] ?? 'a colour mode'} colour. Frameling reads RGB and grey files: in Photoshop use Image > Mode > RGB Color, then save again.`);

  r.skip(r.u32()); // colour mode data
  r.skip(r.u32()); // image resources
  const infoLen = r.u32();
  const infoEnd = r.pos + infoLen;
  if (infoEnd > bytes.length) throw new LayeredProblem('That Photoshop file ends too early: it is cut short or damaged.');

  const left = new Leftovers();
  const info: string[] = [];
  let recs: Rec[] = [];
  const secStart = r.pos;
  const layerInfoLen = infoLen > 0 ? r.u32() : 0;
  let found = false;
  const readLayers = (len: number) => {
    const start = r.pos;
    let count = r.i16();
    count = Math.abs(count);
    if (count > 10000) throw new LayeredProblem('That file says it has more than 10,000 layers: it is damaged.');
    const list: Rec[] = [];
    for (let i = 0; i < count; i++) list.push(readRecord(r));
    for (const rec of list) {
      for (const c of rec.chans) {
        const compression = r.u16();
        const data = r.bytes(Math.max(0, c.length - 2));
        rec.data.push({ id: c.id, compression, bytes: data });
      }
    }
    recs = list;
    found = true;
    r.pos = start + len;
  };
  if (layerInfoLen > 0) {
    if (r.pos + layerInfoLen > infoEnd) throw new LayeredProblem('That Photoshop file ends too early: it is cut short or damaged.');
    readLayers(layerInfoLen);
  } else if (infoLen > 0) {
    // 16 and 32 bit files keep their layers in a tagged block after an empty layer section.
    r.pos = secStart + 4;
    const gl = r.pos + 4 <= infoEnd ? r.u32() : 0;
    r.skip(Math.min(gl, Math.max(0, infoEnd - r.pos)));
    while (!found && r.pos + 12 <= infoEnd) {
      const sig = r.tag();
      if (sig !== '8BIM' && sig !== '8B64') break;
      const key = r.tag();
      const len = r.u32();
      const end = r.pos + len;
      if (end > infoEnd) break;
      if (key === 'Lr16' || key === 'Layr') readLayers(len);
      r.pos = end + (len % 4 ? 4 - (len % 4) : 0);
    }
  }
  r.pos = infoEnd;

  const nodes: LayerNode[] = [];
  const stack: { children: LayerNode[] }[] = [{ children: nodes }];
  const blendOf = (key: string, name: string): BlendMode => {
    const b = BLEND[key];
    if (b) return b;
    if (NO_BLEND[key]) left.add(`blend:${key}`, (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) used the blend mode "${NO_BLEND[key]}", which Frameling doesn't have: they came in as normal.`, name);
    return 'normal';
  };

  for (const rec of recs) {
    if (rec.section === 3) {
      stack.push({ children: [] });
      continue;
    }
    if (rec.section === 1 || rec.section === 2) {
      const frame = stack.length > 1 ? stack.pop()! : { children: [] };
      const g: GroupNode = { type: 'group', name: rec.name, hidden: rec.hidden, opacity: rec.opacity / 255, blend: blendOf(rec.sectionBlend ?? rec.blend, rec.name), children: frame.children };
      stack[stack.length - 1].children.push(g);
      for (const k of rec.keys) if (STYLES.has(k)) left.add('styles', (n, names) => `Layer styles (shadows, glows, strokes and the like) on ${plural(n, 'layer')} (${namesOf(names, n)}).`, rec.name);
      continue;
    }
    const kind = [...rec.keys];
    const adjust = kind.find((k) => ADJUST.has(k));
    if (adjust) {
      left.add('adjust', (n, names) => `${plural(n, 'adjustment layer')} (${namesOf(names, n)}): levels, curves, colour changes and the like that act on the layers under them.`, rec.name);
      continue;
    }
    const area = Math.max(0, rec.right - rec.left) * Math.max(0, rec.bottom - rec.top);
    if (kind.some((k) => FILL.has(k)) && area === 0) {
      left.add('fill', (n, names) => `${plural(n, 'fill layer')} (${namesOf(names, n)}): a solid colour, gradient or pattern that fills the whole picture.`, rec.name);
      continue;
    }
    if (area > MAX_LAYER_PIXELS) {
      left.add('huge', (n, names) => `${plural(n, 'layer')} (${namesOf(names, n)}) far too big to hold.`, rec.name);
      continue;
    }
    let node: RasterNode | null;
    try {
      node = layerPixels(rec, width, height, depth);
    } catch (e) {
      if (e instanceof LayeredProblem) throw e;
      throw new LayeredProblem(`The layer "${rec.name}" can't be read: the file is damaged.`);
    }
    if (!node) node = { type: 'layer', name: rec.name, hidden: rec.hidden, opacity: 1, blend: 'normal', clip: rec.clip, x: 0, y: 0, width: 0, height: 0, pixels: new Uint8ClampedArray(0) };
    node.opacity = (rec.opacity / 255) * (rec.fillOpacity / 255);
    node.blend = blendOf(rec.blend, rec.name);
    if (kind.some((k) => TEXT.has(k))) left.add('text', (n, names) => `${plural(n, 'text layer')} (${namesOf(names, n)}) came in as ${n === 1 ? 'a picture' : 'pictures'} of the words, so the text can't be edited.`, rec.name);
    if (kind.some((k) => SMART.has(k))) left.add('smart', (n, names) => `${plural(n, 'smart object')} (${namesOf(names, n)}) came in as ${n === 1 ? 'a picture' : 'pictures'} of what ${n === 1 ? 'it shows' : 'they show'}, not as something you can open and edit.`, rec.name);
    if (kind.some((k) => VECTOR.has(k))) left.add('vector', (n, names) => `${plural(n, 'shape layer')} or vector mask (${namesOf(names, n)}) came in as the pixels ${n === 1 ? 'it draws' : 'they draw'}, not as ${n === 1 ? 'an editable shape' : 'editable shapes'}.`, rec.name);
    if (kind.some((k) => STYLES.has(k))) left.add('styles', (n, names) => `Layer styles (shadows, glows, strokes and the like) on ${plural(n, 'layer')} (${namesOf(names, n)}).`, rec.name);
    stack[stack.length - 1].children.push(node);
  }
  while (stack.length > 1) {
    const frame = stack.pop()!;
    stack[stack.length - 1].children.push({ type: 'group', name: 'Group', hidden: false, opacity: 1, blend: 'normal', children: frame.children });
  }

  // A file with no layers is one flat picture.
  if (!recs.length) {
    const m = mergedImage(r, width, height, channels, depth);
    nodes.push({ type: 'layer', name: 'Background', hidden: false, opacity: 1, blend: 'normal', clip: false, x: 0, y: 0, width, height, pixels: m.pixels });
    info.push('The file has no layers, only one flattened picture, so it came in as a single layer.');
  }
  if (mode === 1) info.push('The file is in greyscale, so the layers came in as grey pictures.');
  return { format: 'psd', width, height, nodes, left: left.sentences(), info };
}
