/**
 * A small PDF writer for vector frames. Shapes stay vector (fills, strokes, curves), layers become PDF layers
 * (optional content, which Acrobat shows as layers; Illustrator keeps them as groups and drops the names), layer opacity and blend modes become transparency
 * groups, and anything PDF can't draw as vector (pixel layers, effects, masks) comes in as a picture with its alpha.
 * One page per frame. Streams are Flate compressed.
 *
 * Pure apart from text, which is traced into outlines (text/convert.ts, needs a canvas); without one it is skipped.
 */
import { zlibSync } from 'fflate';
import { cameraViewAt, layerCameraMatrix } from '../core/camera';
import type { BlendMode, CameraView, Color, Doc, Drawing, Gradient, Layer, ParticlesShape, PixelDrawing, Shape, SubPath } from '../core/format';
import { strokeOutline } from '../core/render';
import { isPosed, poseAt, type PosedInstance } from '../core/symbols';
import { flattenTilemap } from '../tiles/model';
import type { RawImage } from '../io/png';
import { posedParticles } from '../particles/draw';
import type { Particle } from '../particles/model';
import { textOutlines } from '../text/convert';
import { flatPlan, type FlatUnit } from './layered';
import { gradientKey, sortedStops } from '../core/gradient';
import { flattenRing, lineArea } from '../geometry/merge';

const PDF_BLEND: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten',
  'color-dodge': 'ColorDodge',
  'color-burn': 'ColorBurn',
  'hard-light': 'HardLight',
  'soft-light': 'SoftLight',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
  // PDF has no add; Screen is the nearest.
  add: 'Screen',
};

export function pdfBlend(b: BlendMode | undefined): string {
  return PDF_BLEND[b ?? 'normal'] ?? 'Normal';
}

const enc = new TextEncoder();
const num = (v: number) => {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A PDF text string: plain ASCII in brackets, anything else as UTF-16 with a byte order mark. */
export function pdfString(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => '\\' + c)})`;
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

function rawColor(c: Color): { r: number; g: number; b: number; a: number } {
  const h = c.replace('#', '');
  const full = h.length === 3 || h.length === 4 ? [...h].map((x) => x + x).join('') : h;
  const v = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  return { r: v(0) || 0, g: v(2) || 0, b: v(4) || 0, a: full.length >= 8 ? v(6) : 1 };
}

// Colour washes of the symbol copies being drawn, innermost first. The canvas paints a wash over the copy (source-atop
// at the wash's strength), which for each shape is its colour mixed towards the wash's, so PDF recolours the shapes.
let washes: { r: number; g: number; b: number; t: number }[] = [];

/** A colour with the washes in force mixed in. */
export function washColor(c: { r: number; g: number; b: number; a: number }, list = washes): { r: number; g: number; b: number; a: number } {
  let { r, g, b } = c;
  for (const w of list) {
    r = r * (1 - w.t) + w.r * w.t;
    g = g * (1 - w.t) + w.g * w.t;
    b = b * (1 - w.t) + w.b * w.t;
  }
  return { r, g, b, a: c.a };
}

function parseColor(c: Color): { r: number; g: number; b: number; a: number } {
  const p = rawColor(c);
  return washes.length ? washColor(p) : p;
}

/** Pixels with the washes in force mixed in (a copy; the original is left alone). */
function washPixels(img: RawImage): RawImage {
  if (!washes.length) return img;
  const px = new Uint8ClampedArray(img.pixels);
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const c = washColor({ r: px[i] / 255, g: px[i + 1] / 255, b: px[i + 2] / 255, a: 1 });
    px[i] = Math.round(c.r * 255);
    px[i + 1] = Math.round(c.g * 255);
    px[i + 2] = Math.round(c.b * 255);
  }
  return { width: img.width, height: img.height, pixels: px };
}

interface Obj {
  id: number;
  body: Uint8Array | string;
}

/** A gradient's stops in order, with the ends pushed out to 0 and 1 (PDF wants the colours to run the whole way). */
function gradientStops(gr: Gradient): Gradient['stops'] {
  const stops = sortedStops(gr.stops);
  if (stops[0].at > 0) stops.unshift({ at: 0, color: stops[0].color });
  if (stops[stops.length - 1].at < 1) stops.push({ at: 1, color: stops[stops.length - 1].color });
  return stops;
}

function gradientCoords(gr: Gradient): string {
  const { from: a, to: b } = gr;
  return gr.kind === 'radial' ? `${num(a.x)} ${num(a.y)} 0 ${num(a.x)} ${num(a.y)} ${num(Math.hypot(b.x - a.x, b.y - a.y))}` : `${num(a.x)} ${num(a.y)} ${num(b.x)} ${num(b.y)}`;
}

/** A PDF function running through the stops; `comp` turns a stop's colour into the function's output values. */
function stopsFunction(stops: Gradient['stops'], comp: (c: Color) => string): string {
  const seg = (a: Color, b: Color) => `<< /FunctionType 2 /Domain [0 1] /C0 ${comp(a)} /C1 ${comp(b)} /N 1 >>`;
  if (stops.length <= 2) return seg(stops[0].color, stops[stops.length - 1].color);
  const fns: string[] = [];
  const bounds: number[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    fns.push(seg(stops[i].color, stops[i + 1].color));
    if (i > 0) bounds.push(Math.max(stops[i].at, (bounds[bounds.length - 1] ?? 0) + 1e-4));
  }
  return `<< /FunctionType 3 /Domain [0 1] /Functions [${fns.join(' ')}] /Bounds [${bounds.map(num).join(' ')}] /Encode [${fns.map(() => '0 1').join(' ')}] >>`;
}

/** Collects objects and writes the file with its cross-reference table. */
export class PdfWriter {
  private objs: Obj[] = [];
  private nextId = 1;
  private gsKeys = new Map<string, string>();
  readonly gs: string[] = [];
  readonly xobjects: string[] = [];
  readonly ocgs: { id: number; name: string }[] = [];
  readonly shadings: string[] = [];
  private shadingKeys = new Map<string, string>();
  /** The shared resources dictionary every page and form points at (written last). */
  readonly resId: number;

  constructor() {
    this.resId = this.reserve();
  }

  reserve(): number {
    return this.nextId++;
  }

  set(id: number, body: string | Uint8Array): void {
    this.objs.push({ id, body });
  }

  add(body: string | Uint8Array): number {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  stream(dict: string, data: Uint8Array, compress = true): number {
    const bytes = compress ? zlibSync(data, { level: 6 }) : data;
    const head = enc.encode(`<< ${dict}${compress ? ' /Filter /FlateDecode' : ''} /Length ${bytes.length} >>\nstream\n`);
    const tail = enc.encode('\nendstream');
    const out = new Uint8Array(head.length + bytes.length + tail.length);
    out.set(head);
    out.set(bytes, head.length);
    out.set(tail, head.length + bytes.length);
    return this.add(out);
  }

  /** A graphics state name for fill/stroke alpha and a blend mode (shared across the file). */
  state(fill: number, stroke: number, blend = 'Normal'): string {
    const key = `${num(fill)}|${num(stroke)}|${blend}`;
    let name = this.gsKeys.get(key);
    if (!name) {
      name = `GS${this.gsKeys.size + 1}`;
      this.gsKeys.set(key, name);
      this.gs.push(`/${name} << /Type /ExtGState /ca ${num(fill)} /CA ${num(stroke)} /BM /${blend} >>`);
    }
    return name;
  }

  /** A shading (a gradient) as a resource, shared when the same one comes up again. Returns its name. */
  shading(gr: Gradient): string {
    const key = gradientKey(gr);
    let name = this.shadingKeys.get(key);
    if (name) return name;
    const stops = gradientStops(gr);
    const rgb = (c: Color) => {
      const p = parseColor(c);
      return `[${num(p.r)} ${num(p.g)} ${num(p.b)}]`;
    };
    const id = this.add(`<< /ShadingType ${gr.kind === 'radial' ? 3 : 2} /ColorSpace /DeviceRGB /Coords [${gradientCoords(gr)}] /Function ${stopsFunction(stops, rgb)} /Extend [true true] >>`);
    name = `Sh${this.shadingKeys.size + 1}`;
    this.shadingKeys.set(key, name);
    this.shadings.push(`/${name} ${id} 0 R`);
    return name;
  }

  /**
   * The graphics state that fades a gradient's colours by the alpha of its stops (PDF shadings have no alpha of their
   * own): a luminosity soft mask holding the same gradient in grey, white where opaque. Null when every stop is opaque.
   */
  gradientAlpha(gr: Gradient): string | null {
    const stops = gradientStops(gr);
    if (stops.every((st) => parseColor(st.color).a >= 0.999)) return null;
    const key = `a|${gradientKey(gr)}`;
    let name = this.gsKeys.get(key);
    if (name) return name;
    const grey = (c: Color) => `[${num(parseColor(c).a)}]`;
    const sh = this.add(`<< /ShadingType ${gr.kind === 'radial' ? 3 : 2} /ColorSpace /DeviceGray /Coords [${gradientCoords(gr)}] /Function ${stopsFunction(stops, grey)} /Extend [true true] >>`);
    const form = this.stream(`/Type /XObject /Subtype /Form /BBox [-100000 -100000 100000 100000] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /Shading << /ShA ${sh} 0 R >> >>`, enc.encode('/ShA sh'));
    name = `GS${this.gsKeys.size + 1}`;
    this.gsKeys.set(key, name);
    this.gs.push(`/${name} << /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ${form} 0 R >> >>`);
    return name;
  }

  /** An image XObject (with a soft mask for its alpha). Returns its resource name. */
  image(img: RawImage, interpolate: boolean): string {
    const n = img.width * img.height;
    const rgb = new Uint8Array(n * 3);
    const alpha = new Uint8Array(n);
    let opaque = true;
    for (let i = 0; i < n; i++) {
      const a = img.pixels[i * 4 + 3];
      alpha[i] = a;
      if (a < 255) opaque = false;
      // Canvas pixels are straight alpha already, which is what PDF images with an SMask want.
      rgb[i * 3] = img.pixels[i * 4];
      rgb[i * 3 + 1] = img.pixels[i * 4 + 1];
      rgb[i * 3 + 2] = img.pixels[i * 4 + 2];
    }
    const common = `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /BitsPerComponent 8 /Interpolate ${interpolate}`;
    const smask = opaque ? '' : ` /SMask ${this.stream(`${common} /ColorSpace /DeviceGray`, alpha)} 0 R`;
    const id = this.stream(`${common} /ColorSpace /DeviceRGB${smask}`, rgb);
    const name = `Im${this.xobjects.length + 1}`;
    this.xobjects.push(`/${name} ${id} 0 R`);
    return name;
  }

  /** A transparency group drawn as one (for opacity and blend on a whole layer or folder). Returns its name. */
  group(content: string, bbox: [number, number, number, number], isolated = false): string {
    const id = this.stream(`/Type /XObject /Subtype /Form /BBox [${bbox.map(num).join(' ')}] /Group << /S /Transparency /CS /DeviceRGB${isolated ? ' /I true' : ''} >> /Resources ${this.resId} 0 R`, enc.encode(content));
    const name = `Fm${this.xobjects.length + 1}`;
    this.xobjects.push(`/${name} ${id} 0 R`);
    return name;
  }

  /** A PDF layer (optional content group) by name, shared across pages. */
  layer(name: string): string {
    let i = this.ocgs.findIndex((o) => o.name === name);
    if (i < 0) {
      this.ocgs.push({ id: this.add(`<< /Type /OCG /Name ${pdfString(name)} >>`), name });
      i = this.ocgs.length - 1;
    }
    return `OC${i + 1}`;
  }

  finish(pages: { content: string; width: number; height: number }[], info: { title: string; creator: string }): Uint8Array {
    const pagesId = this.reserve();
    const kids: number[] = [];
    for (const p of pages) {
      const c = this.stream('', enc.encode(p.content));
      kids.push(this.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(p.width)} ${num(p.height)}] /Resources ${this.resId} 0 R /Contents ${c} 0 R /Group << /S /Transparency /CS /DeviceRGB >> >>`));
    }
    this.set(pagesId, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
    const props = this.ocgs.map((o, i) => `/OC${i + 1} ${o.id} 0 R`).join(' ');
    this.set(this.resId, `<< /ProcSet [/PDF /ImageC /ImageB] /ExtGState << ${this.gs.join(' ')} >> /XObject << ${this.xobjects.join(' ')} >> /Shading << ${this.shadings.join(' ')} >> /Properties << ${props} >> >>`);
    const ocgRefs = this.ocgs.map((o) => `${o.id} 0 R`).join(' ');
    // Layers listed top first, the way layer panels show them.
    const order = [...this.ocgs].reverse().map((o) => `${o.id} 0 R`).join(' ');
    const ocp = this.ocgs.length ? ` /OCProperties << /OCGs [${ocgRefs}] /D << /Order [${order}] /ON [${ocgRefs}] >> >>` : '';
    const catalog = this.add(`<< /Type /Catalog /Pages ${pagesId} 0 R${ocp}${this.ocgs.length ? ' /PageMode /UseOC' : ''} >>`);
    const infoId = this.add(`<< /Title ${pdfString(info.title)} /Creator ${pdfString(info.creator)} /Producer (Frameling) >>`);

    // The header, then a comment of high bytes so tools treat the file as binary.
    const parts: Uint8Array[] = [Uint8Array.from([...'%PDF-1.7\n'].map((c) => c.charCodeAt(0)).concat([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))];
    let offset = parts[0].length;
    const offsets = new Map<number, number>();
    this.objs.sort((a, b) => a.id - b.id);
    for (const o of this.objs) {
      offsets.set(o.id, offset);
      const head = enc.encode(`${o.id} 0 obj\n`);
      const body = typeof o.body === 'string' ? enc.encode(o.body) : o.body;
      const tail = enc.encode('\nendobj\n');
      parts.push(head, body, tail);
      offset += head.length + body.length + tail.length;
    }
    const size = this.nextId;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let id = 1; id < size; id++) {
      const off = offsets.get(id);
      xref += off === undefined ? '0000000000 65535 f \n' : `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${size} /Root ${catalog} 0 R /Info ${infoId} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    parts.push(enc.encode(xref));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

// ---------------------------------------------------------------- drawing operators

/** Builds one content stream in document coordinates (the page flips y once at the start). */
class Content {
  ops: string[] = [];
  constructor(private w: PdfWriter) {}

  push(s: string) {
    this.ops.push(s);
  }

  fillColor(c: Color, opacity: number): boolean {
    const p = parseColor(c);
    const a = p.a * opacity;
    if (a <= 0.001) return false;
    this.push(`${num(p.r)} ${num(p.g)} ${num(p.b)} rg`);
    if (a < 0.999) this.push(`/${this.w.state(a, 1)} gs`);
    return true;
  }

  /** Paints a gradient through the current path as a clip (`W*` even-odd, `W` non-zero). Ends the path. */
  shade(gr: Gradient, opacity: number, rule: 'W*' | 'W'): void {
    if (opacity < 0.999) this.push(`/${this.w.state(opacity, 1)} gs`);
    const fade = this.w.gradientAlpha(gr);
    if (fade) this.push(`/${fade} gs`);
    this.push(`${rule} n /${this.w.shading(gr)} sh`);
  }

  strokeColor(c: Color, opacity: number): boolean {
    const p = parseColor(c);
    const a = p.a * opacity;
    if (a <= 0.001) return false;
    this.push(`${num(p.r)} ${num(p.g)} ${num(p.b)} RG`);
    if (a < 0.999) this.push(`/${this.w.state(1, a)} gs`);
    return true;
  }

  subPaths(paths: SubPath[]) {
    for (const sp of paths) {
      const pts = sp.points;
      if (!pts.length) continue;
      this.push(`${num(pts[0].x)} ${num(pts[0].y)} m`);
      const seg = (i: number) => {
        const q = pts[i];
        if (q.c1 && q.c2) this.push(`${num(q.c1.x)} ${num(q.c1.y)} ${num(q.c2.x)} ${num(q.c2.y)} ${num(q.x)} ${num(q.y)} c`);
        else this.push(`${num(q.x)} ${num(q.y)} l`);
      };
      for (let i = 1; i < pts.length; i++) seg(i);
      if (sp.closed) {
        if (pts[0].c1 && pts[0].c2) seg(0);
        this.push('h');
      }
    }
  }

  /** The same smoothed outline the canvas draws for a brush stroke (quadratics through midpoints, as cubics). */
  outline(points: number[][]) {
    const n = points.length;
    if (n < 2) return;
    if (n < 4) {
      this.push(`${num(points[0][0])} ${num(points[0][1])} m`);
      for (let i = 1; i < n; i++) this.push(`${num(points[i][0])} ${num(points[i][1])} l`);
      this.push('h');
      return;
    }
    let cx = points[0][0];
    let cy = points[0][1];
    this.push(`${num(cx)} ${num(cy)} m`);
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const ex = (a[0] + b[0]) / 2;
      const ey = (a[1] + b[1]) / 2;
      const c1x = cx + (2 / 3) * (a[0] - cx);
      const c1y = cy + (2 / 3) * (a[1] - cy);
      const c2x = ex + (2 / 3) * (a[0] - ex);
      const c2y = ey + (2 / 3) * (a[1] - ey);
      this.push(`${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(ex)} ${num(ey)} c`);
      cx = ex;
      cy = ey;
    }
    this.push('h');
  }

  circle(x: number, y: number, r: number) {
    const k = 0.5523 * r;
    this.push(`${num(x + r)} ${num(y)} m`);
    this.push(`${num(x + r)} ${num(y + k)} ${num(x + k)} ${num(y + r)} ${num(x)} ${num(y + r)} c`);
    this.push(`${num(x - k)} ${num(y + r)} ${num(x - r)} ${num(y + k)} ${num(x - r)} ${num(y)} c`);
    this.push(`${num(x - r)} ${num(y - k)} ${num(x - k)} ${num(y - r)} ${num(x)} ${num(y - r)} c`);
    this.push(`${num(x + k)} ${num(y - r)} ${num(x + r)} ${num(y - k)} ${num(x + r)} ${num(y)} c h`);
  }

  toString() {
    return this.ops.join('\n');
  }
}

const JOIN = { miter: 0, round: 1, bevel: 2 } as const;
const CAP = { butt: 0, round: 1, square: 2 } as const;

export interface PdfFrameContext {
  writer: PdfWriter;
  doc: Doc;
  frame: number;
  /** A picture of these layers alone (with their effects, clipping and masks), the stage's size at `pictureScale`. */
  picture?: (layers: Layer[], own: boolean) => RawImage | null;
  pictureScale: number;
  /** Pixel art: pictures stay blocky when scaled (no smoothing). */
  crisp?: boolean;
  /** What the camera sees on this frame, when the drawing has one. */
  view?: CameraView;
}

function drawShape(cx: Content, ctx: PdfFrameContext, s: Shape): void {
  if (s.type === 'instance') {
    if (isPosed(s)) drawInstance(cx, ctx, s);
    return;
  }
  if (s.type === 'text') {
    const paths = textOutlines(s);
    if (!paths.length) return;
    cx.push('q');
    if (cx.fillColor(s.color, s.opacity)) {
      cx.subPaths(paths);
      cx.push('f*');
    }
    cx.push('Q');
    return;
  }
  if (s.type === 'particles') return drawParticles(cx, ctx, s);
  cx.push('q');
  if (s.type === 'stroke') {
    if (cx.fillColor(s.color, s.opacity)) {
      cx.outline(strokeOutline(s));
      cx.push('f');
    }
  } else if (s.type === 'fill') {
    if (s.gradient) {
      cx.subPaths(s.paths);
      cx.shade(s.gradient, s.opacity, 'W*');
    } else if (cx.fillColor(s.color, s.opacity)) {
      cx.subPaths(s.paths);
      cx.push('f*');
    }
  } else {
    if (s.fill && s.fillGradient) {
      cx.push('q');
      cx.subPaths(s.paths);
      cx.shade(s.fillGradient, s.opacity, 'W*');
      cx.push('Q');
    } else if (s.fill && cx.fillColor(s.fill, s.opacity)) {
      cx.subPaths(s.paths);
      cx.push('f*');
    }
    if (s.stroke && s.stroke.width > 0 && s.strokeGradient) {
      // A gradient line: the line's own outline clips the gradient (PDF can only shade areas).
      const st = s.stroke;
      cx.push('q');
      for (const sp of s.paths)
        for (const poly of lineArea(flattenRing(sp), sp.closed, st.width, st.join, st.cap))
          for (const ring of poly) {
            if (ring.length < 3) continue;
            cx.push(`${num(ring[0][0])} ${num(ring[0][1])} m`);
            for (let i = 1; i < ring.length; i++) cx.push(`${num(ring[i][0])} ${num(ring[i][1])} l`);
            cx.push('h');
          }
      cx.shade(s.strokeGradient, s.opacity, 'W');
      cx.push('Q');
    } else if (s.stroke && s.stroke.width > 0 && cx.strokeColor(s.stroke.color, s.opacity)) {
      cx.push(`${num(s.stroke.width)} w ${JOIN[s.stroke.join] ?? 1} j ${CAP[s.stroke.cap] ?? 1} J`);
      cx.subPaths(s.paths);
      cx.push('S');
    }
  }
  cx.push('Q');
}

function drawPixels(cx: Content, ctx: PdfFrameContext, d: PixelDrawing, pixelSize: number): void {
  const name = ctx.writer.image(washPixels({ width: d.width, height: d.height, pixels: d.pixels }), false);
  // Images fill the unit square; the page is flipped, so flip the picture back.
  cx.push(`q ${num(d.width * pixelSize)} 0 0 ${num(-d.height * pixelSize)} 0 ${num(d.height * pixelSize)} cm /${name} Do Q`);
}

function drawDrawing(cx: Content, ctx: PdfFrameContext, d: Drawing, pixelSize: number): void {
  if (d.kind === 'vector') for (const s of d.shapes) drawShape(cx, ctx, s);
  else if (d.kind === 'pixel') drawPixels(cx, ctx, d, pixelSize);
}

/** Draws `inner` as one faded and blended group (or straight in when there's nothing to do). */
function grouped(cx: Content, ctx: PdfFrameContext, opacity: number, blend: BlendMode | undefined, inner: (c: Content) => void): void {
  if (opacity >= 1 && (blend ?? 'normal') === 'normal') return inner(cx);
  if (opacity <= 0) return;
  const c = new Content(ctx.writer);
  inner(c);
  const name = ctx.writer.group(c.toString(), [-1e5, -1e5, 1e5, 1e5]);
  cx.push(`q /${ctx.writer.state(opacity, opacity, pdfBlend(blend))} gs /${name} Do Q`);
}

function drawInstance(cx: Content, ctx: PdfFrameContext, s: PosedInstance): void {
  if (s.opacity <= 0 || !s.posed.layers.length) return;
  const m = s.posed.matrix;
  const look = s.posed.look;
  // Blend modes inside the symbol stay blend modes, in a group of the symbol's own (other looks make the layer a
  // picture, see layered.ts).
  const layers = look ? look.layers.filter((l) => look.drawings.has(l.id) && !l.mask).map((l) => ({ pl: look.drawings.get(l.id)!, blend: l.blend })) : s.posed.layers.map((pl) => ({ pl, blend: undefined }));
  const outer = washes;
  if (s.tint && s.tint.amount > 0) {
    const w = rawColor(s.tint.color);
    washes = [{ r: w.r, g: w.g, b: w.b, t: Math.min(1, s.tint.amount) * w.a }, ...washes];
  }
  try {
    grouped(cx, ctx, s.opacity, undefined, (c) => {
      c.push(`q ${m.map(num).join(' ')} cm`);
      const draw = (c2: Content) => {
        for (const { pl: l, blend } of layers)
          grouped(c2, ctx, l.opacity, blend, (cc) =>
            // A tilemap inside a symbol goes in as its pixels, on the symbol's own frame.
            l.drawing.kind === 'tilemap' ? drawPixels(cc, ctx, flattenTilemap(ctx.doc, l.drawing, l.frame ?? ctx.frame), l.pixelSize) : drawDrawing(cc, ctx, l.drawing, l.pixelSize),
          );
      };
      // Blends mix with the symbol's own layers only, as on the canvas.
      if (look && layers.some((x) => x.blend && x.blend !== 'normal')) isolated(c, ctx, draw);
      else draw(c);
      c.push('Q');
    });
  } finally {
    washes = outer;
  }
}

/** Draws `inner` as its own transparency group, so blend modes inside it only mix with each other. */
function isolated(cx: Content, ctx: PdfFrameContext, inner: (c: Content) => void): void {
  const c = new Content(ctx.writer);
  inner(c);
  const name = ctx.writer.group(c.toString(), [-1e5, -1e5, 1e5, 1e5], true);
  cx.push(`q /${name} Do Q`);
}

function particleShape(cx: Content, s: ParticlesShape, p: Particle): void {
  const r = p.size / 2;
  const rot = (p.rotation * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const at = `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(p.x)} ${num(p.y)} cm`;
  switch (s.sprite) {
    case 'streak': {
      const len = Math.max(p.size * 2, Math.hypot(p.vx, p.vy) * 0.05);
      const ang = Math.atan2(p.vy, p.vx);
      cx.push(`${num(p.size)} w 1 J ${num(p.x)} ${num(p.y)} m ${num(p.x - Math.cos(ang) * len)} ${num(p.y - Math.sin(ang) * len)} l S`);
      return;
    }
    case 'square':
      cx.push(`q ${at} ${num(-r)} ${num(-r)} ${num(p.size)} ${num(p.size)} re f Q`);
      return;
    case 'confetti': {
      const flip = Math.cos((p.rotation * Math.PI) / 90) || 0.01;
      cx.push(`q ${at} 1 0 0 ${num(flip)} 0 0 cm ${num(-r)} ${num(-r * 0.5)} ${num(p.size)} ${num(p.size * 0.5)} re f Q`);
      return;
    }
    case 'star':
    case 'spark': {
      const points = s.sprite === 'star' ? 5 : 4;
      const inner = s.sprite === 'star' ? 0.45 : 0.22;
      cx.push(`q ${at}`);
      for (let i = 0; i < points * 2; i++) {
        const a = (i * Math.PI) / points - Math.PI / 2;
        const rr = i % 2 ? r * inner : r;
        cx.push(`${num(Math.cos(a) * rr)} ${num(Math.sin(a) * rr)} ${i ? 'l' : 'm'}`);
      }
      cx.push('h f Q');
      return;
    }
    case 'flake': {
      cx.push(`q ${at} ${num(Math.max(0.6, p.size / 9))} w 1 J`);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        cx.push(`${num(Math.cos(a) * r)} ${num(Math.sin(a) * r)} m ${num(-Math.cos(a) * r)} ${num(-Math.sin(a) * r)} l`);
      }
      cx.push('S Q');
      return;
    }
    case 'soft':
      cx.circle(p.x, p.y, r * 0.7);
      cx.push('f');
      return;
    default:
      cx.circle(p.x, p.y, r);
      cx.push('f');
  }
}

function drawParticles(cx: Content, ctx: PdfFrameContext, s: ParticlesShape): void {
  if (s.opacity <= 0) return;
  const posed = s as ParticlesShape & { posedSprites?: PosedInstance[]; posedSpriteSize?: number; posedFps?: number };
  for (const p of posedParticles(s)) {
    const a = p.alpha * s.opacity * (s.sprite === 'soft' ? 0.6 : 1);
    if (a <= 0.003 || p.size <= 0.01) continue;
    if (s.sprite === 'symbol' && posed.posedSprites?.length) {
      const k = p.size / Math.max(1, posed.posedSpriteSize ?? 1);
      const rot = (p.rotation * Math.PI) / 180;
      const sprite = posed.posedSprites[Math.floor(p.age * (posed.posedFps ?? 24)) % posed.posedSprites.length];
      grouped(cx, ctx, a, undefined, (c) => {
        c.push(`q ${num(Math.cos(rot) * k)} ${num(Math.sin(rot) * k)} ${num(-Math.sin(rot) * k)} ${num(Math.cos(rot) * k)} ${num(p.x)} ${num(p.y)} cm`);
        drawInstance(c, ctx, sprite);
        c.push('Q');
      });
      continue;
    }
    cx.push('q');
    const c = parseColor(p.color);
    const alpha = a * c.a;
    cx.push(`${num(c.r)} ${num(c.g)} ${num(c.b)} rg ${num(c.r)} ${num(c.g)} ${num(c.b)} RG`);
    if (alpha < 0.999) cx.push(`/${ctx.writer.state(alpha, alpha)} gs`);
    particleShape(cx, s, p);
    cx.push('Q');
  }
}

function drawPicture(cx: Content, ctx: PdfFrameContext, img: RawImage, crisp: boolean): void {
  const name = ctx.writer.image(img, !crisp);
  const { width: w, height: h } = ctx.doc;
  cx.push(`q ${num(w)} 0 0 ${num(-h)} 0 ${num(h)} cm /${name} Do Q`);
}

function drawUnit(cx: Content, ctx: PdfFrameContext, u: FlatUnit): void {
  if (u.kind === 'folder') {
    grouped(cx, ctx, u.folder.opacity, u.folder.blend, (c) => {
      for (const x of u.units) drawUnit(c, ctx, x);
    });
    return;
  }
  const first = u.kind === 'vector' ? u.layer : (u.own ?? u.layers[u.layers.length - 1]);
  const oc = ctx.writer.layer(u.kind === 'vector' || u.layers.length === 1 ? first.name : u.layers.map((l) => l.name).join(' + '));
  cx.push(`/OC /${oc} BDC`);
  if (u.kind === 'vector') {
    const l = u.layer;
    const d = poseAt(ctx.doc, l, ctx.frame);
    // Layers move with the camera (each by its own depth), like on the canvas.
    const cam = layerCameraMatrix(ctx.doc, l, ctx.view);
    if (d)
      grouped(cx, ctx, l.opacity, l.blend, (c) => {
        if (cam) c.push(`q ${cam.map(num).join(' ')} cm`);
        drawDrawing(c, ctx, d, 'pixelSize' in l ? l.pixelSize : 1);
        if (cam) c.push('Q');
      });
  } else if (ctx.picture) {
    const img = ctx.picture(u.layers, !!u.own);
    // Pixel and tile layers stay blocky when the picture is scaled.
    const crisp = !!ctx.crisp || u.layers.every((l) => l.kind !== 'vector');
    if (img) {
      if (u.own) grouped(cx, ctx, u.own.opacity, u.own.blend, (c) => drawPicture(c, ctx, img, crisp));
      else drawPicture(cx, ctx, img, crisp);
    }
  }
  cx.push('EMC');
}

/** One page's content for a frame: background, then every layer bottom first. */
export function pdfFrameContent(ctx: PdfFrameContext, scale: number, background: Color | null): string {
  const cx = new Content(ctx.writer);
  const { width: w, height: h } = ctx.doc;
  // Document pixels to points, with y going down like everywhere else in Frameling.
  cx.push(`${num(scale)} 0 0 ${num(-scale)} 0 ${num(h * scale)} cm`);
  if (background) {
    cx.fillColor(background, 1);
    cx.push(`0 0 ${num(w)} ${num(h)} re f`);
  }
  ctx.view = cameraViewAt(ctx.doc, ctx.frame);
  for (const u of flatPlan(ctx.doc, ctx.frame)) drawUnit(cx, ctx, u);
  return cx.toString();
}

export interface PdfOptions {
  frames: number[];
  /** Points per document pixel. */
  scale: number;
  background: Color | null;
  title: string;
  /** Pictures of layers PDF can't draw as vector (from the renderer). */
  picture?: (frame: number, layers: Layer[], own: boolean) => RawImage | null;
  pictureScale?: number;
  crisp?: boolean;
  creator?: string;
  /** Called after each page, for progress. */
  onPage?: (i: number) => void;
}

export function writePdf(doc: Doc, opts: PdfOptions): Uint8Array {
  const writer = new PdfWriter();
  const pages = opts.frames.map((frame, i) => {
    const content = pdfFrameContent({ writer, doc, frame, picture: opts.picture ? (ls, own) => opts.picture!(frame, ls, own) : undefined, pictureScale: opts.pictureScale ?? 1, crisp: opts.crisp }, opts.scale, opts.background);
    opts.onPage?.(i);
    return { content, width: doc.width * opts.scale, height: doc.height * opts.scale };
  });
  return writer.finish(pages, { title: opts.title, creator: opts.creator ?? 'Frameling' });
}
