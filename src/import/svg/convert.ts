// An SVG as Frameling shapes: paths, rectangles, ellipses, lines and polygons with fills, strokes, gradients and
// transforms; groups kept as groups; Inkscape and Illustrator layers as layers; text as text. What it can't carry (filters,
// masks, clip paths, patterns, pictures, markers, dashes, animation) is counted and said, never dropped quietly. Pure: text
// in, shapes out, no DOM.
import { uid } from '../../core/doc';
import type { Color, Gradient, PathPoint, PathShape, Shape, SubPath, TextShape } from '../../core/format';
import { addSheet, parseDecls, sheetStyle, type Sheet } from './css';
import { parsePathData } from './pathData';
import { apply, IDENTITY, meanScale, mul, parseColor, parseLength, parseNumbers, parseTransform, toHex, type Matrix, type Rgba } from './values';
import { elementKids, localName, parseXml, textOf, XmlProblem, type XmlEl } from './xml';

export class SvgProblem extends Error {}

export interface SvgLayerOut {
  name: string;
  visible: boolean;
  shapes: Shape[];
}

export interface SvgImport {
  /** The size of the drawing in pixels, from the file's width and height (or its viewBox). */
  width: number;
  height: number;
  /** Bottom first. Never empty. */
  layers: SvgLayerOut[];
  /** Sentences about what could not come across, in plain words. Empty when everything did. (A shape that came in a little different is in `info`.) */
  left: string[];
  /** Good to know, not a loss: text came in as text, groups one level deep, overlaps filled the other way. */
  info: string[];
  counts: { shapes: number; groups: number; text: number; gradients: number };
}

const MAX_SHAPES = 60_000;
const MAX_USE_DEPTH = 24;
/** Elements looked at in all, so a file whose <use> copies copies of copies can't run for ever. */
const MAX_VISITS = 1_500_000;

// ---------------------------------------------------------------- what is counted as left out

const LEFT = {
  filter: (n: number) => `${plural(n, 'filter effect')} (blurs, shadows and the like): the shapes are there without the effect.`,
  mask: (n: number) => `${plural(n, 'mask')}: the masked shapes show in full.`,
  clip: (n: number) => `${plural(n, 'clipping path')}: the shapes show in full, not cut to the clip.`,
  pattern: (n: number) => `${plural(n, 'pattern fill')}: filled with plain grey instead.`,
  image: (n: number) => `${plural(n, 'picture')} inside the file. Bring a picture in on its own with File > Import.`,
  marker: (n: number) => `${plural(n, 'line end marker')} (arrowheads and the like).`,
  dash: (n: number) => `${plural(n, 'dashed line')} came in solid, because lines can't be dashed here yet.`,
  anim: (n: number) => `${plural(n, 'animation')} inside the file: you get the drawing as it starts.`,
  textPath: (n: number) => `${plural(n, 'piece')} of text along a curve: left out.`,
  blend: (n: number) => `${plural(n, 'shape')} with a blend mode (multiply, screen and the like) came in as normal.`,
  groupOpacity: (n: number) => `${plural(n, 'group')} with see-through set on the whole group: each shape inside took the same see-through on its own, so overlaps may look a little different.`,
  fillRule: (n: number) => `${plural(n, 'shape')} filled with the "nonzero" rule where parts overlap: they fill the even-odd way here, so an overlap may show as a hole.`,
  spread: (n: number) => `${plural(n, 'gradient')} that repeats or reflects: it stretches once instead.`,
  focal: (n: number) => `${plural(n, 'radial gradient')} with an off-centre focal point: centred instead.`,
  broken: (n: number) => `${plural(n, 'shape')} with path data that stops making sense part way: what could be read is kept.`,
  css: (n: number) => `${plural(n, 'style rule')} too complicated to apply (rules about children, hover and the like).`,
  hidden: (n: number) => `${plural(n, 'hidden shape')} (set not to show) were not brought in.`,
  missing: (n: number) => `${plural(n, 'reference')} to something that isn't in the file (a gradient or a shape): left out.`,
  nested: (n: number) => `${plural(n, 'group')} inside another group: groups come in one level deep.`,
  foreign: (n: number) => `${plural(n, 'embedded web element')} (foreignObject): left out.`,
  tooMany: (n: number) => `${plural(n, 'shape')} past the limit of ${MAX_SHAPES.toLocaleString('en')}: left out.`,
} as const;

function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

type Key = keyof typeof LEFT;

/** The ones that are the shape still there, drawn a little differently, rather than something missing. */
const APPROX = new Set<Key>(['groupOpacity', 'fillRule', 'nested', 'spread', 'focal']);

// ---------------------------------------------------------------- styles

const PRES = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linejoin', 'stroke-linecap', 'stroke-dasharray', 'opacity', 'color', 'display', 'visibility', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'letter-spacing', 'mix-blend-mode', 'filter', 'clip-path', 'mask', 'stop-color', 'stop-opacity', 'marker-start', 'marker-mid', 'marker-end']);

interface Style {
  fill: string;
  fillOpacity: number;
  fillRule: string;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: string;
  linejoin: string;
  linecap: string;
  dash: boolean;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  anchor: string;
  letterSpacing: number;
  visibility: boolean;
}

const BASE: Style = { fill: 'black', fillOpacity: 1, fillRule: 'nonzero', stroke: 'none', strokeOpacity: 1, strokeWidth: '1', linejoin: 'miter', linecap: 'butt', dash: false, color: 'black', fontFamily: 'sans-serif', fontSize: 16, fontWeight: 400, italic: false, anchor: 'start', letterSpacing: 0, visibility: true };

const num01 = (v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback;
  const t = v.trim();
  const n = t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

function weightOf(v: string): number {
  if (v === 'bold') return 700;
  if (v === 'bolder') return 800;
  if (v === 'lighter') return 300;
  if (v === 'normal') return 400;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(100, Math.min(900, n)) : 400;
}

function inherit(parent: Style, d: Record<string, string>): Style {
  const s = { ...parent };
  const get = (k: string) => {
    const v = d[k];
    return v === undefined || v === 'inherit' ? undefined : v;
  };
  s.color = get('color') ?? s.color;
  s.fill = get('fill') ?? s.fill;
  s.fillOpacity = num01(get('fill-opacity'), s.fillOpacity);
  s.fillRule = get('fill-rule') ?? s.fillRule;
  s.stroke = get('stroke') ?? s.stroke;
  s.strokeOpacity = num01(get('stroke-opacity'), s.strokeOpacity);
  s.strokeWidth = get('stroke-width') ?? s.strokeWidth;
  s.linejoin = get('stroke-linejoin') ?? s.linejoin;
  s.linecap = get('stroke-linecap') ?? s.linecap;
  const dash = get('stroke-dasharray');
  if (dash !== undefined) s.dash = dash !== 'none' && parseNumbers(dash).some((n) => n > 0);
  const ff = get('font-family');
  if (ff) s.fontFamily = ff.split(',')[0].trim().replace(/^['"]|['"]$/g, '').replace(/ Variable$/, '') || s.fontFamily;
  const fs = get('font-size');
  if (fs) s.fontSize = parseLength(fs, s.fontSize, s.fontSize) ?? s.fontSize;
  const fw = get('font-weight');
  if (fw) s.fontWeight = weightOf(fw);
  const fst = get('font-style');
  if (fst) s.italic = fst === 'italic' || fst === 'oblique';
  s.anchor = get('text-anchor') ?? s.anchor;
  const ls = get('letter-spacing');
  if (ls && ls !== 'normal') s.letterSpacing = parseLength(ls, 0, s.fontSize) ?? s.letterSpacing;
  const vis = get('visibility');
  if (vis) s.visibility = vis !== 'hidden' && vis !== 'collapse';
  return s;
}

// ---------------------------------------------------------------- geometry helpers

type Pt = { x: number; y: number };

function transformPaths(paths: SubPath[], m: Matrix): SubPath[] {
  const tp = (p: Pt): Pt => apply(m, p.x, p.y);
  return paths.map((sp) => ({
    closed: sp.closed,
    points: sp.points.map((p): PathPoint => {
      const q = tp(p);
      return { x: q.x, y: q.y, ...(p.c1 && p.c2 ? { c1: tp(p.c1), c2: tp(p.c2) } : {}) };
    }),
  }));
}

/** The box of a shape, sampling its curves so a bulge is counted. */
export function boundsOf(paths: SubPath[]): { x: number; y: number; w: number; h: number } | null {
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
  for (const sp of paths) {
    let prev: PathPoint | null = null;
    sp.points.forEach((p, i) => {
      add(p.x, p.y);
      if (prev && p.c1 && p.c2) {
        for (let k = 1; k < 12; k++) {
          const t = k / 12;
          const u = 1 - t;
          add(u * u * u * prev.x + 3 * u * u * t * p.c1.x + 3 * u * t * t * p.c2.x + t * t * t * p.x, u * u * u * prev.y + 3 * u * u * t * p.c1.y + 3 * u * t * t * p.c2.y + t * t * t * p.y);
        }
      }
      if (i === 0 && p.c1 && p.c2) {
        // A closing curve into the first point.
        const last = sp.points[sp.points.length - 1];
        for (let k = 1; k < 12; k++) {
          const t = k / 12;
          const u = 1 - t;
          add(u * u * u * last.x + 3 * u * u * t * p.c1.x + 3 * u * t * t * p.c2.x + t * t * t * p.x, u * u * u * last.y + 3 * u * u * t * p.c1.y + 3 * u * t * t * p.c2.y + t * t * t * p.y);
        }
      }
      prev = p;
    });
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

const signedArea = (sp: SubPath): number => {
  let a = 0;
  const p = sp.points;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a / 2;
};

/** True when an even-odd fill would show a hole that a nonzero fill wouldn't: one part inside another, turning the same way. */
export function nonzeroDiffers(paths: SubPath[]): boolean {
  if (paths.length < 2) return false;
  const info = paths.map((sp) => ({ b: boundsOf([sp]), s: Math.sign(signedArea(sp)) }));
  for (let i = 0; i < info.length; i++)
    for (let j = 0; j < info.length; j++) {
      if (i === j) continue;
      const a = info[i].b;
      const b = info[j].b;
      if (!a || !b || !info[i].s || info[i].s !== info[j].s) continue;
      if (b.x >= a.x - 1e-6 && b.y >= a.y - 1e-6 && b.x + b.w <= a.x + a.w + 1e-6 && b.y + b.h <= a.y + a.h + 1e-6) return true;
    }
  return false;
}

function rectPaths(x: number, y: number, w: number, h: number, rx: number, ry: number): SubPath[] {
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx <= 0 || ry <= 0) {
    return [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }];
  }
  const d = `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  return parsePathData(d).paths;
}

function ellipsePaths(cx: number, cy: number, rx: number, ry: number): SubPath[] {
  const d = `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`;
  return parsePathData(d).paths;
}

// ---------------------------------------------------------------- reading a file

/** The text of an SVG file's bytes: plain, or gzip packed (.svgz), in UTF-8 or UTF-16. */
export function svgTextOf(bytes: Uint8Array, gunzip: (b: Uint8Array) => Uint8Array): string {
  let b = bytes;
  if (b.length > 2 && b[0] === 0x1f && b[1] === 0x8b) {
    try {
      b = gunzip(b);
    } catch {
      throw new SvgProblem('That file looks like a packed SVG (.svgz), but it is damaged and can\'t be unpacked.');
    }
  }
  if (b.length > 1 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) return new TextDecoder(b[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(b);
  return new TextDecoder('utf-8').decode(b);
}

/** Reads an SVG document. Throws SvgProblem in plain words when it is not one or can't be read. */
export function importSvg(text: string, fallbackName = 'Drawing'): SvgImport {
  let root: XmlEl;
  try {
    root = parseXml(text);
  } catch (e) {
    if (e instanceof XmlProblem) throw new SvgProblem(`That file isn't a readable SVG: ${e.message.charAt(0).toLowerCase()}${e.message.slice(1)}`);
    throw e;
  }
  if (localName(root) !== 'svg') {
    const what = root.name.length > 30 ? 'something else' : `<${root.name}>`;
    throw new SvgProblem(`That file isn't an SVG: it starts with ${what} instead of <svg>.`);
  }
  return new Reader(root, fallbackName).run();
}

type Paint = { kind: 'none' } | { kind: 'color'; rgba: Rgba } | { kind: 'gradient'; el: XmlEl } | { kind: 'pattern' };

class Reader {
  private counts = new Map<Key, number>();
  private ids = new Map<string, XmlEl>();
  private sheet: Sheet = { rules: [], skipped: [] };
  private layers: SvgLayerOut[] = [];
  private shapes = 0;
  private groups = 0;
  private texts = 0;
  private gradients = 0;
  private textSeen = false;
  private vw = 0;
  private vh = 0;
  private groupInfo = new Map<string, { n: number; parent?: string }>();
  private groupOpacityAt = new Map<string, number>();
  private all: { shape: Shape; gid?: string }[] = [];
  private cur: SvgLayerOut | null = null;
  private visits = 0;
  /** Every top-level group has a name of its own (Frameling's own export, Illustrator layers): each is a layer. */
  private namedGroups = false;

  constructor(
    private root: XmlEl,
    private fallbackName: string,
  ) {}

  private bump(k: Key, by = 1) {
    this.counts.set(k, (this.counts.get(k) ?? 0) + by);
  }

  private index(el: XmlEl, depth = 0) {
    if (depth > 220) return;
    if (el.attrs.id && !this.ids.has(el.attrs.id)) this.ids.set(el.attrs.id, el);
    const ln = localName(el);
    if (ln === 'style') addSheet(this.sheet, textOf(el));
    if (ln === 'animate' || ln === 'animateTransform' || ln === 'animateMotion' || ln === 'set') this.bump('anim');
    for (const k of elementKids(el)) this.index(k, depth + 1);
  }

  /** The viewBox and size: a matrix from the file's units to pixels, and the size in pixels. */
  private viewport(): { m: Matrix; w: number; h: number; explicit: boolean } {
    const a = this.root.attrs;
    const vb = parseNumbers(a.viewBox);
    const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
    const vw = hasVb ? vb[2] : 0;
    const vh = hasVb ? vb[3] : 0;
    let w = parseLength(a.width, vw || 0, 16);
    let h = parseLength(a.height, vh || 0, 16);
    if (a.width?.trim().endsWith('%')) w = null;
    if (a.height?.trim().endsWith('%')) h = null;
    if (hasVb) {
      if (w === null && h === null) {
        w = vw;
        h = vh;
      } else if (w === null) w = (h as number) * (vw / vh);
      else if (h === null) h = w * (vh / vw);
      const par = (a.preserveAspectRatio ?? '').trim().split(/\s+/);
      if (par[0] === 'none') return { m: [(w as number) / vw, 0, 0, (h as number) / vh, (-vb[0] * (w as number)) / vw, (-vb[1] * (h as number)) / vh], w: w as number, h: h as number, explicit: true };
      const slice = par[1] === 'slice';
      const sc = slice ? Math.max((w as number) / vw, (h as number) / vh) : Math.min((w as number) / vw, (h as number) / vh);
      const align = par[0] && par[0] !== 'defer' ? par[0] : 'xMidYMid';
      const ax = align.includes('xMin') ? 0 : align.includes('xMax') ? 1 : 0.5;
      const ay = align.includes('YMin') ? 0 : align.includes('YMax') ? 1 : 0.5;
      return { m: [sc, 0, 0, sc, ((w as number) - vw * sc) * ax - vb[0] * sc, ((h as number) - vh * sc) * ay - vb[1] * sc], w: w as number, h: h as number, explicit: true };
    }
    if (w !== null && h !== null && w > 0 && h > 0) return { m: IDENTITY, w, h, explicit: true };
    return { m: IDENTITY, w: w && w > 0 ? w : 0, h: h && h > 0 ? h : 0, explicit: false };
  }

  run(): SvgImport {
    this.index(this.root);
    const vp = this.viewport();
    this.vw = vp.w || 800;
    this.vh = vp.h || 600;

    const tops = elementKids(this.root).filter((k) => DRAWN.has(localName(k)));
    this.namedGroups = tops.length > 0 && tops.every((k) => localName(k) === 'g' && !!k.attrs.id && !AUTO_ID.test(k.attrs.id));
    const style = inherit(BASE, this.declared(this.root));
    this.layers = [];
    this.walkChildren(this.root, vp.m, style, 1, undefined, 0, true);

    let width = vp.w;
    let height = vp.h;
    if (!width || !height) {
      // No size in the file: take the drawing's own extent.
      const boxes = this.layers.flatMap((l) => l.shapes.map((s) => (s.type === 'path' ? boundsOf(s.paths) : null))).filter((b): b is NonNullable<typeof b> => !!b);
      const x1 = Math.max(1, ...boxes.map((b) => b.x + b.w));
      const y1 = Math.max(1, ...boxes.map((b) => b.y + b.h));
      width = width || Math.ceil(x1);
      height = height || Math.ceil(y1);
    }
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));

    // Groups with a single shape are not groups; nested ones come in one level deep.
    const size = new Map<string, number>();
    for (const a of this.all) if (a.gid) size.set(a.gid, (size.get(a.gid) ?? 0) + 1);
    for (const a of this.all) if (a.gid && (size.get(a.gid) ?? 0) < 2) delete (a.shape as { group?: string }).group;
    const real = [...size.entries()].filter(([, n]) => n >= 2).map(([g]) => g);
    this.groups = real.length;
    let nested = 0;
    for (const g of real) {
      let p = this.groupInfo.get(g)?.parent;
      while (p && (size.get(p) ?? 0) < 2) p = this.groupInfo.get(p)?.parent;
      if (p) nested++;
    }
    if (nested) this.bump('nested', nested);
    for (const [g, o] of this.groupOpacityAt) if ((size.get(g) ?? 0) >= 2 && o < 1) this.bump('groupOpacity');
    if (this.sheet.skipped.length) this.bump('css', this.sheet.skipped.length);

    const layers = this.layers.filter((l) => l.shapes.length);
    if (!layers.length) {
      const only = this.layers[0] ?? { name: this.fallbackName, visible: true, shapes: [] };
      layers.push(only);
    }
    const said = (k: Key) => LEFT[k](this.counts.get(k)!);
    const keys = (Object.keys(LEFT) as Key[]).filter((k) => this.counts.get(k));
    const left = keys.filter((k) => !APPROX.has(k)).map(said);
    // Things that came in, a little changed: good to know, not lost.
    const info: string[] = keys.filter((k) => APPROX.has(k)).map(said);
    if (this.textSeen) info.push('Text came in as text, so it shows in a font this computer has. If the original font is missing it will look a little different.');
    return { width, height, layers, left, info, counts: { shapes: this.shapes, groups: this.groups, text: this.texts, gradients: this.gradients } };
  }

  private declared(el: XmlEl): Record<string, string> {
    const d: Record<string, string> = {};
    for (const [k, v] of Object.entries(el.attrs)) if (PRES.has(k)) d[k] = v.trim();
    Object.assign(d, sheetStyle(this.sheet, el));
    if (el.attrs.style) Object.assign(d, parseDecls(el.attrs.style));
    return d;
  }

  private layerFor(name: string, visible = true): SvgLayerOut {
    const l: SvgLayerOut = { name, visible, shapes: [] };
    this.layers.push(l);
    return l;
  }

  private defaultLayer(): SvgLayerOut {
    const last = this.layers[this.layers.length - 1];
    if (last && last.name === this.fallbackName) return last;
    return this.layerFor(this.fallbackName);
  }

  private walkChildren(el: XmlEl, ctm: Matrix, style: Style, opacity: number, group: string | undefined, depth: number, top = false, useDepth = 0) {
    if (depth > 200) return;
    for (const k of elementKids(el)) this.walk(k, ctm, style, opacity, group, depth + 1, top, useDepth);
  }

  private walk(el: XmlEl, ctm: Matrix, parent: Style, opacity: number, group: string | undefined, depth: number, top: boolean, useDepth: number) {
    if (++this.visits > MAX_VISITS) throw new SvgProblem('That SVG is too complicated to bring in: it repeats shapes inside shapes so many times that Frameling gave up. Simplify it, or flatten the repeats, in the program that made it.');
    if (this.shapes >= MAX_SHAPES) {
      this.bump('tooMany');
      return;
    }
    const name = localName(el);
    if (SKIP.has(name)) {
      if (name === 'image') this.bump('image');
      if (name === 'foreignObject') this.bump('foreign');
      return;
    }
    if (!DRAWN.has(name)) return;
    const d = this.declared(el);
    if (d.display === 'none') {
      if (!(top && this.isLayer(el))) {
        this.bump('hidden');
        return;
      }
    }
    const tr = parseTransform(el.attrs.transform);
    let m = ctm;
    if (tr) m = mul(ctm, tr);
    const style = inherit(parent, d);
    const own = num01(d.opacity, 1);
    const op = opacity * own;

    // Things the shape asks for that are not brought in.
    const filter = d.filter && d.filter !== 'none';
    if (filter) this.bump('filter');
    if (d.mask && d.mask !== 'none') this.bump('mask');
    if (d['clip-path'] && d['clip-path'] !== 'none' && !this.clipIsFrame(d['clip-path'], m)) this.bump('clip');
    if (d['mix-blend-mode'] && d['mix-blend-mode'] !== 'normal') this.bump('blend');

    if (name === 'g' || name === 'a' || name === 'switch' || name === 'svg') {
      // Inkscape and Illustrator layers at the top level become layers.
      if (top && this.isLayer(el)) {
        const l = this.layerFor(this.layerName(el), d.display !== 'none' && !/hidden/.test(el.attrs.visibility ?? ''));
        this.cur = l;
        const kids = name === 'switch' ? elementKids(el).slice(0, 1) : elementKids(el);
        for (const k of kids) this.walk(k, m, style, op, undefined, depth + 1, false, useDepth);
        this.cur = null;
        return;
      }
      const gid = uid('g');
      this.groupInfo.set(gid, { n: 0, parent: group });
      if (op < 1 && own < 1) this.groupOpacityAt.set(gid, own);
      let mm = m;
      if (name === 'svg' && depth > 1) mm = mul(m, [1, 0, 0, 1, parseLength(el.attrs.x, this.vw) ?? 0, parseLength(el.attrs.y, this.vh) ?? 0]);
      const kids = name === 'switch' ? elementKids(el).slice(0, 1) : elementKids(el);
      for (const k of kids) this.walk(k, mm, style, op, gid, depth + 1, false, useDepth);
      return;
    }
    if (name === 'use') {
      const href = el.attrs['xlink:href'] ?? el.attrs.href;
      const target = href && href.startsWith('#') ? this.ids.get(href.slice(1)) : undefined;
      if (!target || useDepth >= MAX_USE_DEPTH) {
        this.bump('missing');
        return;
      }
      const at = mul(m, [1, 0, 0, 1, parseLength(el.attrs.x, this.vw) ?? 0, parseLength(el.attrs.y, this.vh) ?? 0]);
      const tn = localName(target);
      const gid = uid('g');
      this.groupInfo.set(gid, { n: 0, parent: group });
      if (tn === 'symbol') {
        for (const k of elementKids(target)) this.walk(k, at, style, op, gid, depth + 1, false, useDepth + 1);
      } else {
        // The referenced element is drawn in place, even though it sits in <defs>.
        this.draw(target, at, style, op, gid, useDepth + 1, depth);
      }
      return;
    }
    this.draw(el, m, style, op, group, useDepth, depth, d);
  }

  private isLayer(el: XmlEl): boolean {
    if (localName(el) !== 'g') return false;
    return el.attrs['inkscape:groupmode'] === 'layer' || (el.attrs['data-name'] !== undefined && el.attrs.id !== undefined) || this.namedGroups;
  }

  private layerName(el: XmlEl): string {
    const given = el.attrs['inkscape:label'] ?? el.attrs['data-name'];
    const n = given ?? el.attrs.id ?? `Layer ${this.layers.length + 1}`;
    const plain = n.replace(/_x([0-9A-Fa-f]{2})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    return (given === undefined ? plain.replace(/[_-]+/g, ' ') : plain).trim().slice(0, 80) || `Layer ${this.layers.length + 1}`;
  }

  /** A clip that is just the whole picture (Figma and others wrap everything in one) cuts nothing. */
  private clipIsFrame(value: string, m: Matrix): boolean {
    const id = /url\(\s*['"]?#([^)'"]+)['"]?\s*\)/.exec(value)?.[1];
    const clip = id ? this.ids.get(id) : undefined;
    if (!clip || localName(clip) !== 'clipPath') return false;
    const kids = elementKids(clip);
    if (kids.length !== 1 || localName(kids[0]) !== 'rect') return false;
    const r = kids[0];
    const tr = parseTransform(r.attrs.transform) ?? IDENTITY;
    const x = parseLength(r.attrs.x, this.vw) ?? 0;
    const y = parseLength(r.attrs.y, this.vh) ?? 0;
    const w = parseLength(r.attrs.width, this.vw);
    const h = parseLength(r.attrs.height, this.vh);
    if (w === null || h === null) return false;
    const full = mul(m, tr);
    const p0 = apply(full, x, y);
    const p1 = apply(full, x + w, y + h);
    const eps = 1.5;
    return Math.min(p0.x, p1.x) <= eps && Math.min(p0.y, p1.y) <= eps && Math.max(p0.x, p1.x) >= this.vw - eps && Math.max(p0.y, p1.y) >= this.vh - eps;
  }

  private place(shape: Shape, gid: string | undefined): void {
    if (this.shapes >= MAX_SHAPES) {
      this.bump('tooMany');
      return;
    }
    this.shapes++;
    if (gid) (shape as { group?: string }).group = gid;
    const layer = this.cur ?? this.defaultLayer();
    layer.shapes.push(shape);
    this.all.push({ shape, gid });
  }

  private paint(value: string, style: Style): Paint {
    const v = value.trim();
    if (!v || v === 'none') return { kind: 'none' };
    const url = /^url\(\s*['"]?#([^)'"]+)['"]?\s*\)\s*(.*)$/.exec(v);
    if (url) {
      const el = this.ids.get(url[1]);
      const ln = el ? localName(el) : '';
      if (ln === 'linearGradient' || ln === 'radialGradient') return { kind: 'gradient', el: el! };
      if (ln === 'pattern') return { kind: 'pattern' };
      this.bump('missing');
      return url[2] ? this.paint(url[2], style) : { kind: 'none' };
    }
    if (v === 'currentColor' || v === 'currentcolor') {
      const c = parseColor(style.color);
      return c ? { kind: 'color', rgba: c } : { kind: 'color', rgba: { r: 0, g: 0, b: 0, a: 1 } };
    }
    const c = parseColor(v);
    return c ? { kind: 'color', rgba: c } : { kind: 'none' };
  }

  /** A paint as a colour string and, for gradients, the gradient in shape space. */
  private resolvePaint(p: Paint, opacity: number, local: SubPath[], m: Matrix): { color: Color; gradient?: Gradient } | null {
    if (p.kind === 'none') return null;
    if (p.kind === 'pattern') {
      this.bump('pattern');
      return { color: toHex({ r: 128, g: 128, b: 128, a: opacity }) };
    }
    if (p.kind === 'color') return { color: toHex({ ...p.rgba, a: p.rgba.a * opacity }) };
    return this.gradient(p.el, opacity, local, m);
  }

  private gradientAttr(el: XmlEl, name: string, seen = new Set<XmlEl>()): string | undefined {
    if (el.attrs[name] !== undefined) return el.attrs[name];
    const href = el.attrs['xlink:href'] ?? el.attrs.href;
    const next = href && href.startsWith('#') ? this.ids.get(href.slice(1)) : undefined;
    if (!next || seen.has(next)) return undefined;
    seen.add(el);
    const ln = localName(next);
    // Geometry only carries between gradients of the same kind.
    if (['x1', 'y1', 'x2', 'y2'].includes(name) && ln !== localName(el)) return undefined;
    if (['cx', 'cy', 'r', 'fx', 'fy'].includes(name) && ln !== localName(el)) return undefined;
    return this.gradientAttr(next, name, seen);
  }

  private gradientStops(el: XmlEl, seen = new Set<XmlEl>()): XmlEl[] {
    const own = elementKids(el).filter((k) => localName(k) === 'stop');
    if (own.length) return own;
    const href = el.attrs['xlink:href'] ?? el.attrs.href;
    const next = href && href.startsWith('#') ? this.ids.get(href.slice(1)) : undefined;
    if (!next || seen.has(next)) return [];
    seen.add(el);
    return this.gradientStops(next, seen);
  }

  private gradient(el: XmlEl, opacity: number, local: SubPath[], m: Matrix): { color: Color; gradient?: Gradient } | null {
    const stops: { at: number; color: Color }[] = [];
    let last = 0;
    for (const s of this.gradientStops(el)) {
      const d = this.declared(s);
      const off = num01(s.attrs.offset, 0);
      last = Math.max(last, off);
      const c = parseColor(d['stop-color'] ?? 'black') ?? { r: 0, g: 0, b: 0, a: 1 };
      stops.push({ at: last, color: toHex({ ...c, a: c.a * num01(d['stop-opacity'], 1) * opacity }) });
    }
    if (!stops.length) return null;
    if (stops.length === 1) return { color: stops[0].color };
    const radial = localName(el) === 'radialGradient';
    const spread = this.gradientAttr(el, 'spreadMethod');
    if (spread === 'repeat' || spread === 'reflect') this.bump('spread');
    const units = this.gradientAttr(el, 'gradientUnits') ?? 'objectBoundingBox';
    const gt = parseTransform(this.gradientAttr(el, 'gradientTransform')) ?? IDENTITY;
    const box = boundsOf(local);
    let space: Matrix = m;
    const len = (name: string, fallback: number): number => {
      const raw = this.gradientAttr(el, name);
      if (raw === undefined) return fallback;
      const t = raw.trim();
      if (units === 'objectBoundingBox') return t.endsWith('%') ? parseFloat(t) / 100 : (parseFloat(t) || 0);
      const ref = name.startsWith('x') || name === 'cx' || name === 'fx' ? this.vw : name === 'r' ? Math.hypot(this.vw, this.vh) / Math.SQRT2 : this.vh;
      return parseLength(t, ref) ?? fallback;
    };
    if (units === 'objectBoundingBox') {
      if (!box || box.w <= 0 || box.h <= 0) return { color: stops[0].color };
      space = mul(m, [box.w, 0, 0, box.h, box.x, box.y]);
    }
    space = mul(space, gt);
    let gradient: Gradient;
    if (radial) {
      const cx = len('cx', units === 'objectBoundingBox' ? 0.5 : this.vw / 2);
      const cy = len('cy', units === 'objectBoundingBox' ? 0.5 : this.vh / 2);
      const r = len('r', units === 'objectBoundingBox' ? 0.5 : Math.min(this.vw, this.vh) / 2);
      const fx = this.gradientAttr(el, 'fx');
      const fy = this.gradientAttr(el, 'fy');
      if ((fx !== undefined && Math.abs(len('fx', cx) - cx) > 1e-6) || (fy !== undefined && Math.abs(len('fy', cy) - cy) > 1e-6)) this.bump('focal');
      const c = apply(space, cx, cy);
      const e = apply(space, cx + r, cy);
      gradient = { kind: 'radial', stops, from: c, to: e };
    } else {
      const x1 = len('x1', 0);
      const y1 = len('y1', 0);
      const x2 = len('x2', units === 'objectBoundingBox' ? 1 : this.vw);
      const y2 = len('y2', 0);
      gradient = { kind: 'linear', stops, from: apply(space, x1, y1), to: apply(space, x2, y2) };
    }
    this.gradients++;
    return { color: stops[0].color, gradient };
  }

  private draw(el: XmlEl, m: Matrix, parentStyle: Style, opacity: number, gid: string | undefined, useDepth: number, depth: number, declared?: Record<string, string>) {
    const name = localName(el);
    const d = declared ?? this.declared(el);
    // A referenced element (from <use>) brings its own transform, style and opacity along.
    let mm = m;
    let style = parentStyle;
    let op = opacity;
    if (!declared) {
      const tr = parseTransform(el.attrs.transform);
      if (tr) mm = mul(m, tr);
      style = inherit(parentStyle, d);
      op = opacity * num01(d.opacity, 1);
    }
    if (name === 'g' || name === 'svg' || name === 'symbol' || name === 'a') {
      for (const k of elementKids(el)) this.walk(k, mm, style, op, gid, depth + 1, false, useDepth);
      return;
    }
    if (name === 'text') return this.text(el, mm, style, op, gid);
    if (name === 'textPath') {
      this.bump('textPath');
      return;
    }
    const a = el.attrs;
    const W = this.vw;
    const H = this.vh;
    const L = (v: string | undefined, of: number) => parseLength(v, of, style.fontSize) ?? 0;
    let paths: SubPath[] = [];
    let broken = false;
    if (name === 'path') {
      const r = parsePathData(a.d ?? '');
      paths = r.paths;
      if (r.problem) broken = true;
    } else if (name === 'rect') {
      const w = L(a.width, W);
      const h = L(a.height, H);
      if (w <= 0 || h <= 0) return;
      let rx = a.rx !== undefined ? L(a.rx, W) : null;
      let ry = a.ry !== undefined ? L(a.ry, H) : null;
      if (rx === null) rx = ry ?? 0;
      if (ry === null) ry = rx;
      paths = rectPaths(L(a.x, W), L(a.y, H), w, h, rx, ry);
    } else if (name === 'circle') {
      const r = L(a.r, Math.hypot(W, H) / Math.SQRT2);
      if (r <= 0) return;
      paths = ellipsePaths(L(a.cx, W), L(a.cy, H), r, r);
    } else if (name === 'ellipse') {
      const rx = L(a.rx, W);
      const ry = L(a.ry, H);
      if (rx <= 0 || ry <= 0) return;
      paths = ellipsePaths(L(a.cx, W), L(a.cy, H), rx, ry);
    } else if (name === 'line') {
      paths = [{ closed: false, points: [{ x: L(a.x1, W), y: L(a.y1, H) }, { x: L(a.x2, W), y: L(a.y2, H) }] }];
    } else if (name === 'polyline' || name === 'polygon') {
      const n = parseNumbers(a.points);
      const pts: PathPoint[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] });
      if (pts.length >= 2) paths = [{ closed: name === 'polygon', points: pts }];
      if (n.length % 2) broken = true;
    } else return;
    if (broken) this.bump('broken');
    if (!paths.length) return;
    if (!style.visibility) {
      this.bump('hidden');
      return;
    }

    const fillPaint = this.paint(style.fill, style);
    const strokePaint = this.paint(style.stroke, style);
    const sw = parseLength(style.strokeWidth, Math.hypot(W, H) / Math.SQRT2, style.fontSize) ?? 1;
    const wantStroke = strokePaint.kind !== 'none' && sw > 0;
    // One see-through for the whole shape when fill and line share it (that is how Frameling holds it); otherwise each keeps its own.
    const fo = fillPaint.kind === 'none' ? null : style.fillOpacity;
    const so = wantStroke ? style.strokeOpacity : null;
    const shared = fo === null ? so ?? 1 : so === null || so === fo ? fo : null;
    const fill = this.resolvePaint(fillPaint, shared === null ? style.fillOpacity : 1, paths, mm);
    const stroke = wantStroke ? this.resolvePaint(strokePaint, shared === null ? style.strokeOpacity : 1, paths, mm) : null;
    if (!fill && !stroke) return;
    if (wantStroke && style.dash) this.bump('dash');
    if (['marker-start', 'marker-mid', 'marker-end'].some((k) => d[k] && d[k] !== 'none') && name !== 'rect' && name !== 'circle' && name !== 'ellipse') this.bump('marker');
    if (fill && style.fillRule !== 'evenodd' && nonzeroDiffers(paths)) this.bump('fillRule');

    const world = transformPaths(paths, mm);
    if (world.some((sp) => sp.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))) {
      this.bump('broken');
      return;
    }
    const k = meanScale(mm) || 1;
    const shape: PathShape = {
      id: uid('sh'),
      type: 'path',
      paths: world,
      fill: fill ? fill.color : null,
      stroke: stroke ? { color: stroke.color, width: sw * k, join: style.linejoin === 'round' ? 'round' : style.linejoin === 'bevel' ? 'bevel' : 'miter', cap: style.linecap === 'round' ? 'round' : style.linecap === 'square' ? 'square' : 'butt' } : null,
      opacity: Math.max(0, Math.min(1, op * (shared ?? 1))),
      ...(fill?.gradient ? { fillGradient: fill.gradient } : {}),
      ...(stroke?.gradient ? { strokeGradient: stroke.gradient } : {}),
    };
    this.place(shape, gid);
  }

  private text(el: XmlEl, m: Matrix, style: Style, op: number, gid: string | undefined) {
    if (!style.visibility) return;
    // Lines: a child span that starts a new line (its own y, or a dy) begins one.
    const lines: string[] = [];
    let buf = '';
    let dyFirst = 0;
    let lastY = el.attrs.y;
    let lastYn = parseLength(el.attrs.y?.split(/[\s,]+/)[0], this.vh, style.fontSize);
    const flush = () => {
      if (buf.trim()) lines.push(buf.replace(/\s+/g, ' ').trim());
      buf = '';
    };
    const visit = (e: XmlEl) => {
      for (const k of e.kids) {
        if (typeof k === 'string') {
          buf += k;
          continue;
        }
        const ln = localName(k);
        if (ln === 'textPath') {
          this.bump('textPath');
          continue;
        }
        if (ln !== 'tspan') continue;
        const dy = parseLength(k.attrs.dy?.split(/[\s,]+/)[0], 0, style.fontSize);
        const newLine = (dy !== null && dy !== 0) || (k.attrs.y !== undefined && k.attrs.y !== lastY);
        const ny = k.attrs.y !== undefined ? parseLength(k.attrs.y.split(/[\s,]+/)[0], this.vh, style.fontSize) : null;
        if (newLine) {
          const had = buf.trim() !== '';
          flush();
          if (had && !dyFirst) dyFirst = dy || (ny !== null && lastYn !== null ? ny - lastYn : 0);
        }
        if (k.attrs.y !== undefined) {
          lastY = k.attrs.y;
          if (ny !== null) lastYn = ny;
        }
        visit(k);
      }
    };
    visit(el);
    flush();
    if (!lines.length) return;
    const text = lines.join('\n');
    const x = parseLength(el.attrs.x?.split(/[\s,]+/)[0], this.vw, style.fontSize) ?? 0;
    const y = parseLength(el.attrs.y?.split(/[\s,]+/)[0], this.vh, style.fontSize) ?? 0;
    const o = apply(m, x, y);
    const [a, b, c, dd] = m;
    const sx = Math.hypot(a, b) || 1;
    const rot = Math.atan2(b, a);
    const sy = (a * dd - b * c) / sx || 1;
    const k = (c * Math.cos(rot) + dd * Math.sin(rot)) / (sy || 1);
    const fillPaint = this.paint(style.fill, style);
    let color: Color = '#000000';
    if (fillPaint.kind === 'color') color = toHex({ ...fillPaint.rgba, a: fillPaint.rgba.a * style.fillOpacity });
    else if (fillPaint.kind === 'gradient') {
      const g = this.gradient(fillPaint.el, style.fillOpacity, [], m);
      if (g) color = g.color;
    } else if (fillPaint.kind === 'none') return;
    this.textSeen = true;
    this.texts++;
    const shape: TextShape = {
      id: uid('sh'),
      type: 'text',
      text,
      font: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      ...(style.italic ? { italic: true } : {}),
      color,
      align: style.anchor === 'middle' ? 'center' : style.anchor === 'end' ? 'right' : 'left',
      ...(dyFirst && style.fontSize ? { lineHeight: Math.round((Math.abs(dyFirst) / style.fontSize) * 100) / 100 } : {}),
      ...(style.letterSpacing ? { letterSpacing: style.letterSpacing } : {}),
      opacity: Math.max(0, Math.min(1, op)),
      transform: { x: o.x, y: o.y, scaleX: sx, scaleY: sy, rotation: (rot * 180) / Math.PI, skew: (Math.atan(k) * 180) / Math.PI },
    };
    this.place(shape, gid);
  }
}

/** Names a program makes up for a group nobody named (g1234, path12). */
const AUTO_ID = /^[A-Za-z]+-?\d+(-\d+)*$/;

/** What is never drawn by being met in the tree. */
const SKIP = new Set(['defs', 'symbol', 'clipPath', 'mask', 'marker', 'pattern', 'linearGradient', 'radialGradient', 'style', 'title', 'desc', 'metadata', 'filter', 'script', 'image', 'foreignObject', 'stop', 'animate', 'animateTransform', 'animateMotion', 'set', 'font', 'font-face', 'view', 'cursor', 'sodipodi:namedview']);
const DRAWN = new Set(['g', 'a', 'switch', 'svg', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text']);

