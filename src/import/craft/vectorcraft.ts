// A VectorCraft file (.vectorcraft): plain JSON with a document of artboards, layers, swatches and shapes. Paths come
// across as Frameling paths with their fills, strokes and gradients, text as text, artboards as artboards and swatches as
// swatches. What has no equivalent here is counted and named, never dropped quietly. The file is somebody else's, so it
// is read as untrusted: a size cap, a depth cap, a shape cap, bad numbers refused, and nothing in it is ever run. Pure.
import { uid } from '../../core/doc';
import type { Color, Gradient, LayerEffect, PathPoint, PathShape, Shape, SubPath, TextShape } from '../../core/format';
import { newTextShape } from '../../text/model';
import { mapShape } from '../pieces';
import { Leftovers, namesOf, plural } from '../layered/model';
import { toHex } from '../svg/values';

export class CraftProblem extends Error {}

export const VECTORCRAFT_EXT = /\.vectorcraft$/i;
export const VECTORCRAFT_ACCEPT = '.vectorcraft';

const MAX_BYTES = 256 * 1024 * 1024;
const MAX_SHAPES = 100_000;
const MAX_ANCHORS = 4_000_000;
const MAX_DEPTH = 48;
const MAX_ARTBOARDS = 200;
const MAX_SWATCHES = 512;
const LIMIT = 1e7;
/** The newest version of the file this reader was written against. */
export const KNOWN_VERSION = 4;

export interface CraftLayer {
  name: string;
  visible: boolean;
  opacity?: number;
  locked?: boolean;
  shapes: Shape[];
}

export interface CraftBoard {
  name: string;
  /** Where it sits on the file's pasteboard. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Bottom first, with the shapes moved so the artboard's corner is 0, 0. */
  layers: CraftLayer[];
}

export interface CraftSwatch {
  name: string;
  color: Color;
}

export interface VectorcraftFile {
  title: string;
  /** Always at least one. */
  boards: CraftBoard[];
  swatches: CraftSwatch[];
  left: string[];
  info: string[];
  counts: { shapes: number; text: number; gradients: number; layers: number };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** What a file that isn't VectorCraft looks like, in a few words, by its first bytes. */
export function describeBytes(b: Uint8Array): string {
  const head = new TextDecoder('utf-8').decode(b.subarray(0, 200)).trimStart().toLowerCase();
  if (b[0] === 0x50 && b[1] === 0x4b) return 'a zip. A Photocraft file is a zip: bring it in with File > Import > Photocraft file';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'a PNG picture';
  if (b[0] === 0xff && b[1] === 0xd8) return 'a JPEG picture';
  if (head.startsWith('%pdf')) return 'a PDF';
  if (head.startsWith('8bps') || (b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53)) return 'a Photoshop file';
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'an SVG. Bring it in with File > Import > SVG or logo';
  if (head.startsWith('<')) return 'a web or XML file';
  return 'not text that Frameling can read';
}

// ---------------------------------------------------------------- colours

const hex2 = (n: number): number => Math.max(0, Math.min(255, Math.round(n * 255)));

/** A colour as the file stores it ({model: 'rgb', r, g, b} and the like, each 0 to 1) as RGBA bytes; null for a model nobody here knows. */
export function craftColor(c: unknown, a = 1): { r: number; g: number; b: number; a: number; converted?: string } | null {
  if (!isObj(c)) return null;
  const model = str(c.model).toLowerCase();
  const n = (k: string) => num(c[k], 0);
  const alpha = clamp01(a * (typeof c.a === 'number' ? clamp01(c.a) : typeof c.alpha === 'number' ? clamp01(c.alpha) : 1));
  if (model === 'rgb') return { r: hex2(n('r')), g: hex2(n('g')), b: hex2(n('b')), a: alpha };
  if (model === 'gray' || model === 'grey') {
    const v = hex2(1 - clamp01(n('k')));
    return { r: v, g: v, b: v, a: alpha };
  }
  if (model === 'cmyk') {
    const k = clamp01(n('k'));
    const f = (x: number) => hex2((1 - clamp01(x)) * (1 - k));
    return { r: f(n('c')), g: f(n('m')), b: f(n('y')), a: alpha, converted: 'CMYK' };
  }
  if (model === 'hsb' || model === 'hsv') {
    const h = ((n('h') % 360) + 360) % 360;
    const s = clamp01(n('s'));
    const v = clamp01(n('b') || n('v'));
    const k = (m: number) => (m + h / 60) % 6;
    const f = (m: number) => hex2(v - v * s * Math.max(0, Math.min(k(m), 4 - k(m), 1)));
    return { r: f(5), g: f(3), b: f(1), a: alpha };
  }
  return null;
}

// ---------------------------------------------------------------- the reader

interface Placed {
  layer: number;
  shape: Shape;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}

interface LayerIn {
  name: string;
  visible: boolean;
  opacity?: number;
  locked?: boolean;
}

function fontWeight(style: string): { weight: number; italic: boolean } {
  const s = style.toLowerCase();
  const italic = /italic|oblique/.test(s);
  const weight = /thin|hairline/.test(s) ? 100 : /extra ?light|ultra ?light/.test(s) ? 200 : /light/.test(s) ? 300 : /semi ?bold|demi/.test(s) ? 600 : /extra ?bold|ultra ?bold|heavy/.test(s) ? 800 : /black/.test(s) ? 900 : /medium/.test(s) ? 500 : /bold/.test(s) ? 700 : 400;
  return { weight, italic };
}

/** Reads a .vectorcraft file. Throws CraftProblem in plain words when it can't. */
export function readVectorcraft(bytes: Uint8Array): VectorcraftFile {
  if (!bytes.length) throw new CraftProblem("That file is empty: there's nothing in it to read.");
  if (bytes.length > MAX_BYTES) throw new CraftProblem('That file is bigger than 256 MB, which is more than Frameling will read for a drawing. Something may have gone wrong when it was saved.');
  let root: unknown;
  try {
    root = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CraftProblem(`That doesn't look like a VectorCraft file. A .vectorcraft file is plain text (JSON), and this is ${describeBytes(bytes)}, or it is damaged.`);
  }
  if (!isObj(root)) throw new CraftProblem("That is text, but it isn't a VectorCraft file: it is not a drawing document.");
  if (root.format !== 'vectorcraft') {
    const what = isObj(root.document) && root.format_version !== undefined ? 'It looks like a Photocraft manifest, not a VectorCraft file.' : `Its "format" says ${typeof root.format === 'string' ? `"${root.format.slice(0, 30)}"` : 'nothing'}, not "vectorcraft".`;
    throw new CraftProblem(`That is JSON, but not a VectorCraft file. ${what}`);
  }
  const version = num(root.version, 0);
  if (version < 1) throw new CraftProblem("That VectorCraft file doesn't say which version it is, so Frameling can't be sure how to read it.");
  if (!isObj(root.document)) throw new CraftProblem('That VectorCraft file has no drawing in it (no "document").');
  const doc = root.document;

  const left = new Leftovers();
  const info: string[] = [];
  if (version > KNOWN_VERSION) info.push(`This file is VectorCraft format version ${version}, newer than version ${KNOWN_VERSION}, which Frameling was made for. What it understood is in; anything newer is listed.`);
  const units = str(doc.units, 'Points');
  if (!/^(points?|pixels?|px|pt)$/i.test(units)) info.push(`The file measures in ${units.toLowerCase()}. Frameling counts in pixels, so the numbers in the file were used as they are, one point to one pixel.`);

  const placed: Placed[] = [];
  const layers: LayerIn[] = [];
  let anchors = 0;
  let shapesSeen = 0;
  let overShapes = false;
  const colour: { converted: string | null } = { converted: null };
  const counts = { shapes: 0, text: 0, gradients: 0, layers: 0 };

  const gradientOf = (g: unknown, angle: number, box: Placed['box']): Gradient | null => {
    if (!isObj(g) || !box) return null;
    const kind = str(g.kind).toLowerCase();
    if (kind !== 'linear' && kind !== 'radial') {
      left.add(`grad:${kind}`, (n) => `${plural(n, 'gradient')} of a kind Frameling doesn't have (${kind || 'unnamed'}): filled with its first colour instead.`);
      return null;
    }
    const stops = arr(g.stops)
      .filter(isObj)
      .map((s) => {
        const c = craftColor(s.color, clamp01(num(s.opacity, 1)));
        if (c?.converted) colour.converted = c.converted;
        if (num(s.midpoint, 0.5) !== 0.5) left.add('midpoint', (n) => `${plural(n, 'gradient')} with the middle of a colour change moved: the change is even instead.`);
        return c ? { at: clamp01(num(s.offset, 0)), color: toHex(c) } : null;
      })
      .filter((s): s is { at: number; color: string } => !!s)
      .sort((a, b) => a.at - b.at);
    if (stops.length < 2) return null;
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    const cx = box.x0 + w / 2;
    const cy = box.y0 + h / 2;
    if (kind === 'radial') return { kind: 'radial', stops, from: { x: cx, y: cy }, to: { x: cx + Math.max(w, h) / 2, y: cy } };
    // The angle runs anticlockwise from "to the right", and the line reaches the corners of the box.
    const a = (angle * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = -Math.sin(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    return { kind: 'linear', stops, from: { x: cx - dx * half, y: cy - dy * half }, to: { x: cx + dx * half, y: cy + dy * half } };
  };

  /** A paint as a plain colour or a gradient; `none` for no paint. */
  const paintOf = (p: unknown, box: Placed['box']): { color: Color; gradient?: Gradient } | 'none' | null => {
    if (!isObj(p)) return 'none';
    const type = str(p.type);
    if (type === 'none') return 'none';
    if (type === 'solid') {
      const c = craftColor(p.color);
      if (!c) {
        left.add('model', (n) => `${plural(n, 'colour')} in a colour model Frameling doesn't know: painted mid grey instead.`);
        return { color: '#808080' };
      }
      if (c.converted) colour.converted = c.converted;
      return { color: toHex(c) };
    }
    if (type === 'gradient') {
      const g = gradientOf(p.gradient, num(p.angle, 0), box);
      const first = isObj(p.gradient) ? craftColor(arr((p.gradient as Obj).stops).filter(isObj)[0]?.color) : null;
      if (g) {
        counts.gradients++;
        return { color: g.stops[0].color, gradient: g };
      }
      return first ? { color: toHex(first) } : { color: '#808080' };
    }
    left.add(`paint:${type}`, (n) => `${plural(n, 'fill or line')} painted with ${type ? `a ${type}` : 'something unnamed'}: painted mid grey instead.`);
    return { color: '#808080' };
  };

  const boxOf = (subs: SubPath[]): Placed['box'] => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x: number, y: number) => {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    };
    for (const sp of subs) {
      sp.points.forEach((p, i) => {
        add(p.x, p.y);
        const prev = sp.points[(i + sp.points.length - 1) % sp.points.length];
        if (p.c1 && p.c2 && (i > 0 || sp.closed)) {
          // Sample the curve so the box is its real extent, not the loose box of its handles.
          for (let t = 1; t < 8; t++) {
            const u = t / 8;
            const m = 1 - u;
            add(m * m * m * prev.x + 3 * m * m * u * p.c1.x + 3 * m * u * u * p.c2.x + u * u * u * p.x, m * m * m * prev.y + 3 * m * m * u * p.c1.y + 3 * m * u * u * p.c2.y + u * u * u * p.y);
          }
        }
      });
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  };

  const pathOf = (item: Obj, kind: Obj, layer: number, gid: string | undefined, name: string | undefined): void => {
    const path = isObj(kind.path) ? kind.path : null;
    const subs: SubPath[] = [];
    for (const sp of arr(path?.subpaths)) {
      if (!isObj(sp)) continue;
      const list = arr(sp.anchors);
      anchors += list.length;
      if (anchors > MAX_ANCHORS) throw new CraftProblem('That file has more points than Frameling will read for one drawing (4 million).');
      const pts: PathPoint[] = [];
      const outs: ({ x: number; y: number } | null)[] = [];
      const ins: ({ x: number; y: number } | null)[] = [];
      let bad = false;
      const pt = (v: unknown): { x: number; y: number } | null => {
        if (!Array.isArray(v) || v.length < 2) return null;
        const [x, y] = v;
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > LIMIT || Math.abs(y) > LIMIT) {
          bad = true;
          return null;
        }
        return { x, y };
      };
      for (const a of list) {
        const p = isObj(a) ? pt(a.p) : null;
        if (!p || !isObj(a)) {
          bad = true;
          continue;
        }
        pts.push({ x: p.x, y: p.y });
        ins.push(pt(a.in));
        outs.push(pt(a.out));
      }
      if (bad) left.add('broken', (n) => `${plural(n, 'shape')} with points that don't make sense: what could be read is kept.`);
      if (pts.length < 2) continue;
      const closed = sp.closed === true;
      // A segment from one point to the next is a curve when either end has a handle (a missing one sits on its point).
      const seg = (from: number, to: number): { c1: { x: number; y: number }; c2: { x: number; y: number } } | null => {
        const o = outs[from];
        const i = ins[to];
        if (!o && !i) return null;
        return { c1: o ?? { x: pts[from].x, y: pts[from].y }, c2: i ?? { x: pts[to].x, y: pts[to].y } };
      };
      for (let i = 1; i < pts.length; i++) {
        const s = seg(i - 1, i);
        if (s) Object.assign(pts[i], s);
      }
      if (closed) {
        const s = seg(pts.length - 1, 0);
        if (s) Object.assign(pts[0], s);
      }
      subs.push({ points: pts, closed });
    }
    if (!subs.length) return;
    const box = boxOf(subs);
    const items = arr(isObj(item.appearance) ? item.appearance.items : null).filter(isObj);
    const fills = items.filter((i) => i.kind === 'fill' && i.visible !== false);
    const strokes = items.filter((i) => i.kind === 'stroke' && i.visible !== false);
    if (fills.length > 1) left.add('fills', (n) => `${plural(n, 'shape')} with more than one fill: only the top fill came in.`);
    if (strokes.length > 1) left.add('strokes', (n) => `${plural(n, 'shape')} with more than one line around it: only the top line came in.`);
    const fill = fills.length ? paintOf(fills[fills.length - 1].paint, box) : 'none';
    const lineItem = strokes[strokes.length - 1];
    const line = lineItem ? paintOf(lineItem.paint, box) : 'none';
    const width = lineItem ? Math.max(0, num(lineItem.width, 1)) : 0;
    const effects: LayerEffect[] = [];
    const fx = arr(isObj(item.appearance) ? item.appearance.effects : null).filter(isObj);
    for (const e of fx) {
      if (e.visible === false) continue;
      const id = str(e.id);
      const p = isObj(e.params) ? e.params : {};
      if (id === 'stylize.outerGlow') {
        const hex = /^#[0-9a-f]{6}$/i.test(str(p.color)) ? str(p.color).toLowerCase() : '#ffd76a';
        const mode = str(p.mode, 'normal').toLowerCase();
        if (mode !== 'normal') left.add('glowblend', (n) => `${plural(n, 'glow')} that blends with ${mode} (or another mode): it glows in the normal way here.`);
        effects.push({ id: uid('e'), kind: 'glow', values: { color: hex, size: Math.max(0, Math.min(80, num(p.blur, 12))), strength: Math.max(0, Math.min(3, num(p.opacity, 100) / 100)) } });
      } else left.add(`fx:${id}`, (n) => `${plural(n, 'effect')} (${id || 'unnamed'}): the shapes came in without ${n === 1 ? 'it' : 'them'}.`);
    }
    const shape: PathShape = {
      id: uid('sh'),
      type: 'path',
      paths: subs,
      fill: fill === 'none' || !fill ? null : fill.color,
      stroke: line === 'none' || !line || !width ? null : { color: line.color, width, join: /^(round|bevel)$/.test(str(lineItem?.join)) ? (str(lineItem?.join) as 'round' | 'bevel') : 'miter', cap: /^(round|square)$/.test(str(lineItem?.cap)) ? (str(lineItem?.cap) as 'round' | 'square') : 'butt' },
      opacity: clamp01(num(item.opacity, 1)),
      ...(fill && fill !== 'none' && fill.gradient ? { fillGradient: fill.gradient } : {}),
      ...(line && line !== 'none' && line.gradient ? { strokeGradient: line.gradient } : {}),
      ...(effects.length ? { effects } : {}),
    };
    if (!shape.fill && !shape.stroke) {
      left.add('unpainted', (n) => `${plural(n, 'shape')} with no fill and no line: nothing to show, so they were left out.`);
      return;
    }
    if (arr(lineItem?.dash).length) left.add('dash', (n) => `${plural(n, 'dashed line')} came in solid, because lines can't be dashed here yet.`);
    if (gid) shape.group = gid;
    if (name) named.push(name);
    placed.push({ layer, shape, box });
    counts.shapes++;
  };

  const textOf = (item: Obj, kind: Obj, layer: number, gid: string | undefined): void => {
    const runs = arr(kind.runs).filter(isObj);
    const text = runs.map((r) => str(r.text)).join('');
    if (!text.trim()) return;
    const style = isObj(runs[0]?.style) ? (runs[0].style as Obj) : {};
    const xf = arr(kind.xf).map((n) => num(n, NaN));
    const m = xf.length === 6 && xf.every(Number.isFinite) ? xf : [1, 0, 0, 1, 0, 0];
    const sx = Math.hypot(m[0], m[1]) || 1;
    const sy = Math.hypot(m[2], m[3]) || 1;
    const size = Math.max(1, num(style.size, 16) * (num(style.v_scale, 100) / 100) * sy);
    const fillP = isObj(style.fill) ? style.fill : { type: 'none' };
    const paint = paintOf(fillP, null);
    const { weight, italic } = fontWeight(str(style.font_style, 'Regular'));
    if (runs.length > 1) {
      const looks = new Set(runs.map((r) => JSON.stringify(r.style)));
      if (looks.size > 1) left.add('runs', (n) => `${plural(n, 'piece of text')} in more than one look (fonts, sizes or colours mixed): the whole text took the first look.`);
    }
    if (style.underline === true || style.strikethrough === true) left.add('underline', (n) => `${plural(n, 'piece of text')} with an underline or a strikethrough: they came in without it.`);
    if (isObj(style.stroke) && style.stroke.type !== 'none') left.add('textline', (n) => `${plural(n, 'piece of text')} with an outline: they came in without it.`);
    const justify = isObj(kind.para) ? str(kind.para.justify, 'Left') : 'Left';
    const align: TextShape['align'] = /^center/i.test(justify) ? 'center' : /^right/i.test(justify) ? 'right' : 'left';
    if (/^justify/i.test(justify)) left.add('justify', (n) => `${plural(n, 'piece of text')} spread to fill the line (justified): they came in left aligned.`);
    const k = isObj(kind.kind) ? str(kind.kind.kind, 'point') : 'point';
    if (k !== 'point') left.add('areatext', (n) => `${plural(n, 'piece of text')} set inside a box: Frameling text has no box, so it came in as lines.`);
    const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI + num(style.rotation, 0);
    const t = newTextShape(uid('t'), { x: m[4], y: m[5] }, {
      text: style.all_caps === true ? text.toUpperCase() : text,
      font: str(style.font_family, 'Inter').replace(/ Variable$/, '') || 'Inter',
      size,
      weight,
      ...(italic ? { italic: true } : {}),
      color: paint && paint !== 'none' ? paint.color : '#000000',
      align,
      letterSpacing: (num(style.tracking, 0) / 1000) * size,
      opacity: clamp01(num(item.opacity, 1)),
      transform: { x: m[4], y: m[5], scaleX: (sx / sy) * (num(style.h_scale, 100) / 100), scaleY: 1, rotation: rot, skew: 0 },
    });
    if (gid) t.group = gid;
    placed.push({ layer, shape: t, box: { x0: m[4], y0: m[5] - size, x1: m[4] + size * 0.6 * text.length, y1: m[5] } });
    counts.shapes++;
    counts.text++;
  };

  const named: string[] = [];
  const unknown = (kindName: string, name?: string) => {
    if (/image|raster|placed|bitmap|picture/i.test(kindName)) left.add('pictures', (n, names) => `${plural(n, 'picture')}${names.length ? ` (${namesOf(names, n)})` : ''} inside the file: left out. Bring a picture in on its own with File > Import.`, name);
    else left.add(`kind:${kindName}`, (n, names) => `${plural(n, 'object')}${names.length ? ` (${namesOf(names, n)})` : ''} of a kind Frameling can't read (${kindName || 'unnamed'}): left out.`, name);
  };

  /** Goes through a list of objects: shapes, text, and groups (which share a group id). */
  const walk = (list: unknown[], layer: number, depth: number, gid: string | undefined): void => {
    if (depth > MAX_DEPTH) {
      left.add('deep', () => `Groups more than ${MAX_DEPTH} levels deep: what was inside them was left out.`);
      return;
    }
    for (const raw of list) {
      if (!isObj(raw)) continue;
      if (++shapesSeen > MAX_SHAPES * 2) {
        overShapes = true;
        return;
      }
      const kind = isObj(raw.kind) ? raw.kind : {};
      const type = str(kind.type);
      if (type !== 'layer' && (raw.visible === false || raw.hidden === true)) {
        left.add('hidden', (n) => `${plural(n, 'hidden object')} (set not to show) were not brought in.`);
        continue;
      }
      if (placed.length >= MAX_SHAPES) {
        overShapes = true;
        return;
      }
      if (type === 'path') pathOf(raw, kind, layer, gid, typeof raw.name === 'string' ? raw.name : undefined);
      else if (type === 'text') textOf(raw, kind, layer, gid);
      else if (Array.isArray(kind.children)) {
        if (type === 'layer') {
          // A layer inside a layer is a layer of its own, after the one it sits in.
          layers.push(layerIn(raw, kind));
          walk(kind.children, layers.length - 1, depth + 1, undefined);
        } else walk(kind.children, layer, depth + 1, uid('g'));
      } else unknown(type, typeof raw.name === 'string' ? raw.name : undefined);
    }
  };

  const layerIn = (raw: Obj, kind: Obj): LayerIn => ({
    name: str(raw.name, str(kind.name, 'Layer')).slice(0, 200) || 'Layer',
    visible: !(raw.visible === false || kind.visible === false || raw.hidden === true || kind.hidden === true),
    ...(typeof raw.opacity === 'number' ? { opacity: clamp01(raw.opacity) } : typeof kind.opacity === 'number' ? { opacity: clamp01(kind.opacity) } : {}),
    ...(raw.locked === true || kind.locked === true ? { locked: true } : {}),
  });

  const top = arr(doc.layers);
  if (!top.length) throw new CraftProblem('That VectorCraft file has no layers in it.');
  for (const l of top) {
    if (!isObj(l)) continue;
    const kind = isObj(l.kind) ? l.kind : {};
    const idx = layers.length;
    layers.push(layerIn(l, kind));
    if (Array.isArray(kind.children)) walk(kind.children, idx, 1, undefined);
    else if (kind.type === 'path' || kind.type === 'text') walk([l], idx, 1, undefined);
    else unknown(str(kind.type), typeof l.name === 'string' ? l.name : undefined);
  }
  if (overShapes) left.add('many', () => `More than ${MAX_SHAPES.toLocaleString('en-GB')} shapes: the rest were left out.`);
  for (const nm of named) left.add('names', (n, names) => `${plural(n, 'shape')} with names (${namesOf(names, n)}): Frameling shapes don't carry names, so they came in as shapes in the same order.`, nm);
  if (arr(doc.symbols).length) left.add('symbols', (n) => `${plural(n, 'symbol')} in the file's symbol library: any used in the drawing came in as plain shapes, and the library itself wasn't kept.`);
  if (arr(doc.graphic_styles).length > 1) info.push('Graphic styles the file defines were not kept; shapes keep the look they have.');

  // ---------------------------------------------------------------- artboards
  const abs = arr(doc.artboards)
    .filter(isObj)
    .slice(0, MAX_ARTBOARDS)
    .map((a, i) => {
      const r = isObj(a.rect) ? a.rect : {};
      const x0 = num(r.x0, 0);
      const y0 = num(r.y0, 0);
      return { name: str(a.name, `Artboard ${i + 1}`).slice(0, 200), x: x0, y: y0, width: Math.round(num(r.x1, 0) - x0), height: Math.round(num(r.y1, 0) - y0) };
    })
    .filter((a) => a.width >= 1 && a.height >= 1 && a.width <= 16384 && a.height <= 16384);
  if (arr(doc.artboards).length > abs.length) left.add('abs', (n) => `${plural(n, 'artboard')} with no sensible size: left out.`);
  if (!abs.length) {
    // No artboard: the picture is wherever the shapes are.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of placed) if (p.box) ((x0 = Math.min(x0, p.box.x0)), (y0 = Math.min(y0, p.box.y0)), (x1 = Math.max(x1, p.box.x1)), (y1 = Math.max(y1, p.box.y1)));
    if (!Number.isFinite(x0)) throw new CraftProblem('That VectorCraft file has no artboard and nothing drawn in it.');
    abs.push({ name: 'Artboard 1', x: Math.floor(x0), y: Math.floor(y0), width: Math.max(1, Math.min(16384, Math.ceil(x1 - x0))), height: Math.max(1, Math.min(16384, Math.ceil(y1 - y0))) });
    info.push('The file has no artboard, so the drawing is sized to fit everything in it.');
  }

  const boards: CraftBoard[] = abs.map((a) => ({ ...a, layers: [] }));
  const inside = (b: Placed['box'], a: (typeof abs)[number]) => !!b && (b.x0 + b.x1) / 2 >= a.x && (b.x0 + b.x1) / 2 <= a.x + a.width && (b.y0 + b.y1) / 2 >= a.y && (b.y0 + b.y1) / 2 <= a.y + a.height;
  let outside = 0;
  for (const [bi, a] of abs.entries()) {
    for (const [li, l] of layers.entries()) {
      const own = placed.filter((p) => p.layer === li && (abs.length === 1 || inside(p.box, a)));
      if (!own.length && abs.length > 1) continue;
      boards[bi].layers.push({ name: l.name, visible: l.visible, ...(l.opacity !== undefined ? { opacity: l.opacity } : {}), ...(l.locked ? { locked: true } : {}), shapes: own.map((p) => mapShape(p.shape, 1, -a.x, -a.y)) });
    }
  }
  if (abs.length > 1) {
    outside = placed.filter((p) => !abs.some((a) => inside(p.box, a))).length;
    if (outside) left.add('outside', (n) => `${plural(n, 'shape')} that sit outside every artboard: left out.`);
  }
  for (const b of boards) if (!b.layers.length) b.layers.push({ name: 'Layer 1', visible: true, shapes: [] });
  counts.layers = layers.length;

  // ---------------------------------------------------------------- swatches
  const swatches: CraftSwatch[] = [];
  const seen = new Set<string>();
  let gradientSwatches = 0;
  let spot = 0;
  const addSwatch = (s: unknown): void => {
    if (!isObj(s) || !isObj(s.paint)) return;
    const type = str(s.paint.type);
    if (type === 'none') return;
    if (type !== 'solid') {
      gradientSwatches++;
      return;
    }
    const c = craftColor(s.paint.color);
    if (!c) return;
    if (c.converted) colour.converted ??= c.converted;
    if (s.spot === true) spot++;
    const color = toHex(c);
    const name = str(s.name, color).slice(0, 80) || color;
    const key = `${name}|${color}`;
    if (seen.has(key) || swatches.length >= MAX_SWATCHES) return;
    seen.add(key);
    swatches.push({ name, color });
  };
  for (const s of arr(doc.swatches)) addSwatch(s);
  for (const g of arr(doc.swatch_groups)) if (isObj(g)) for (const s of arr(g.swatches)) addSwatch(s);
  if (gradientSwatches) left.add('gswatch', () => `${plural(gradientSwatches, 'gradient or pattern swatch', 'gradient or pattern swatches')}: swatches here are single colours, so they were left out.`);
  if (spot) info.push(`${plural(spot, 'spot colour')} came in as ordinary colours.`);
  if (colour.converted) info.push(`${colour.converted} colours were turned into screen (RGB) colours with a plain conversion, so they can look a little different from print.`);

  return { title: str(doc.title).slice(0, 200), boards, swatches, left: left.sentences(), info, counts };
}
