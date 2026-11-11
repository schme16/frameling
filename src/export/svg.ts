// One frame as an SVG: vector layers become real paths (brush strokes as their outline shape, exactly the one the
// canvas fills), pixel layers become one rectangle per run of same-coloured pixels, so nothing is lost.
import type { Doc, Drawing, Gradient, Layer, PathShape, PixelDrawing, Shape, StrokeShape, SubPath } from '../core/format';
import { isPosed, poseAt, type PosedInstance, type PosedLayer } from '../core/symbols';
import { drawMeshed, strokeOutline } from '../core/render';
import { encodePng } from '../io/png';
import { flattenTilemap } from '../tiles/model';
import { particlesToSvg, textToSvg, withSprites } from './svg-extra';
import { composeSvg, composeSymbol, tintAttr, tintDefs } from './svg-look';
import { cameraViewAt, layerCameraMatrix } from '../core/camera';
import { gradientKey, sortedStops } from '../core/gradient';

/** A number with at most 4 decimals (matrices need more than 2). */
export function n4(v: number): string {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
}

export interface SvgOptions {
  /** Output size as a multiple of the document size (the drawing itself always keeps its own units). */
  scale?: number;
  /** Leave the background out. */
  transparent?: boolean;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A number with at most 2 decimals and no trailing zeros. */
export function n2(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as a plain colour and an opacity (SVG tools cope badly with 8 digit hex). */
export function splitColor(c: string): { color: string; alpha: number } {
  const m = /^#([0-9a-f]{3,8})$/i.exec(c.trim());
  if (!m) return { color: c, alpha: 1 };
  let h = m[1].toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
  if (h.length === 8) return { color: '#' + h.slice(0, 6), alpha: parseInt(h.slice(6), 16) / 255 };
  return { color: '#' + h.slice(0, 6), alpha: 1 };
}

const op = (v: number) => String(Math.round(v * 1000) / 1000);

/** A gradient as an SVG element with a name made from its content (the same gradient twice gets the same name). */
export function svgGradient(gr: Gradient): { id: string; def: string } {
  const key = gradientKey(gr);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  const id = `grad${(h >>> 0).toString(36)}`;
  const stops = sortedStops(gr.stops)
    .map((st) => {
      const { color, alpha } = splitColor(st.color);
      return `<stop offset="${op(st.at)}" stop-color="${esc(color)}"${alpha < 1 ? ` stop-opacity="${op(alpha)}"` : ''}/>`;
    })
    .join('');
  const def =
    gr.kind === 'radial'
      ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n2(gr.from.x)}" cy="${n2(gr.from.y)}" r="${n2(Math.hypot(gr.to.x - gr.from.x, gr.to.y - gr.from.y))}">${stops}</radialGradient>`
      : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n2(gr.from.x)}" y1="${n2(gr.from.y)}" x2="${n2(gr.to.x)}" y2="${n2(gr.to.y)}">${stops}</linearGradient>`;
  return { id, def };
}

/** A paint attribute for a gradient, with its definition to put alongside (inside a <defs> next to the shape). */
function gradientPaint(attr: 'fill' | 'stroke', gr: Gradient, opacity: number, defs: string[]): string {
  const g = svgGradient(gr);
  defs.push(g.def);
  return ` ${attr}="url(#${g.id})"` + (opacity < 1 ? ` ${attr}-opacity="${op(opacity)}"` : '');
}

const withDefs = (defs: string[], el: string) => (defs.length ? `<defs>${defs.join('')}</defs>${el}` : el);

export function paint(attr: 'fill' | 'stroke', color: string, opacity: number): string {
  const { color: c, alpha } = splitColor(color);
  const o = alpha * opacity;
  return ` ${attr}="${esc(c)}"` + (o < 1 ? ` ${attr}-opacity="${op(o)}"` : '');
}

/** The outline of a brush stroke, smoothed the same way the canvas does it (quadratic curves through midpoints). */
export function strokeToPathData(s: StrokeShape): string {
  const pts = strokeOutline(s);
  const n = pts.length;
  if (n < 2) return '';
  let d = `M${n2(pts[0][0])} ${n2(pts[0][1])}`;
  if (n < 4) {
    for (let i = 1; i < n; i++) d += `L${n2(pts[i][0])} ${n2(pts[i][1])}`;
    return d + 'Z';
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    d += `Q${n2(a[0])} ${n2(a[1])} ${n2((a[0] + b[0]) / 2)} ${n2((a[1] + b[1]) / 2)}`;
  }
  return d + 'Z';
}

export function subPathsToPathData(paths: SubPath[]): string {
  let d = '';
  for (const sp of paths) {
    const pts = sp.points;
    if (!pts.length) continue;
    d += `M${n2(pts[0].x)} ${n2(pts[0].y)}`;
    const seg = (i: number) => {
      const q = pts[i];
      d += q.c1 && q.c2 ? `C${n2(q.c1.x)} ${n2(q.c1.y)} ${n2(q.c2.x)} ${n2(q.c2.y)} ${n2(q.x)} ${n2(q.y)}` : `L${n2(q.x)} ${n2(q.y)}`;
    };
    for (let i = 1; i < pts.length; i++) seg(i);
    if (sp.closed) {
      if (pts[0].c1 && pts[0].c2) seg(0);
      d += 'Z';
    }
  }
  return d;
}

export function shapeToSvg(s: Shape, doc?: Doc): string {
  if (s.type === 'instance') return isPosed(s) ? instanceToSvg(s, doc) : '';
  if (s.type === 'text') return textToSvg(s);
  if (s.type === 'particles') return particlesToSvg(s);
  if (s.type === 'stroke') {
    const d = strokeToPathData(s);
    return d ? `<path d="${d}"${paint('fill', s.color, s.opacity)}/>` : '';
  }
  if (s.type === 'fill') {
    const d = subPathsToPathData(s.paths);
    if (!d) return '';
    const defs: string[] = [];
    return withDefs(defs, `<path d="${d}"${s.gradient ? gradientPaint('fill', s.gradient, s.opacity, defs) : paint('fill', s.color, s.opacity)} fill-rule="evenodd"/>`);
  }
  return pathShapeToSvg(s);
}

/** One layer of a posed instance, without its opacity. */
export function posedLayerSvg(l: PosedLayer, doc?: Doc): string {
  // A layer bent by bones has no vector equivalent, so it goes in as a picture.
  if (l.mesh) return meshImage(l.drawing, l.pixelSize, l.mesh);
  const dr = l.drawing;
  const parts =
    dr.kind === 'pixel'
      ? pixelRects(dr, l.pixelSize)
      : dr.kind === 'vector'
        ? dr.shapes.map((x) => shapeToSvg(x, doc)).filter(Boolean)
        : dr.kind === 'tilemap' && doc && l.frame !== undefined
          ? pixelRects(flattenTilemap(doc, dr, l.frame), l.pixelSize)
          : [];
  return parts.join('');
}

// A posed instance becomes a group with its matrix; its layers nest inside. Its tint is a small filter (svg-look.ts).
// A symbol with looks on its own layers is composited inside the group, as the canvas does it.
export function instanceToSvg(s: PosedInstance, doc?: Doc): string {
  const inner: string[] = [];
  const looked = s.posed.look ? composeSymbol(s.posed.look, (pl) => posedLayerSvg(pl, doc)) : null;
  if (looked !== null) {
    if (looked) inner.push(looked);
  } else
    for (const l of s.posed.layers) {
      const body = posedLayerSvg(l, doc);
      if (body) inner.push(l.opacity < 1 ? `<g opacity="${op(l.opacity)}">${body}</g>` : body);
    }
  if (!inner.length || s.opacity <= 0) return '';
  const m = s.posed.matrix.map((v) => n2(v)).join(' ');
  return `<g transform="matrix(${m})"${tintAttr(s.tint)}${s.opacity < 1 ? ` opacity="${op(s.opacity)}"` : ''}>${inner.join('')}</g>`;
}

function meshImage(d: Parameters<typeof drawMeshed>[1], pixelSize: number, mesh: Parameters<typeof drawMeshed>[3]): string {
  if (typeof OffscreenCanvas === 'undefined' || !mesh.dst.length) return '';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < mesh.dst.length; i += 2) {
    x0 = Math.min(x0, mesh.dst[i]);
    y0 = Math.min(y0, mesh.dst[i + 1]);
    x1 = Math.max(x1, mesh.dst[i]);
    y1 = Math.max(y1, mesh.dst[i + 1]);
  }
  const k = 2;
  const w = Math.max(1, Math.ceil((x1 - x0) * k));
  const h = Math.max(1, Math.ceil((y1 - y0) * k));
  if (w * h > 16_000_000) return '';
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  if (!g) return '';
  g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  drawMeshed(g, d, pixelSize, mesh);
  const px = g.getImageData(0, 0, w, h).data;
  const png = encodePng({ width: w, height: h, pixels: px });
  let bin = '';
  for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return `<image x="${n2(x0)}" y="${n2(y0)}" width="${n2(w / k)}" height="${n2(h / k)}" href="data:image/png;base64,${btoa(bin)}"/>`;
}

function pathShapeToSvg(s: PathShape): string {
  const d = subPathsToPathData(s.paths);
  if (!d) return '';
  const defs: string[] = [];
  let a = s.fill ? (s.fillGradient ? gradientPaint('fill', s.fillGradient, s.opacity, defs) : paint('fill', s.fill, s.opacity)) + ' fill-rule="evenodd"' : ' fill="none"';
  if (s.stroke) {
    a += (s.strokeGradient ? gradientPaint('stroke', s.strokeGradient, s.opacity, defs) : paint('stroke', s.stroke.color, s.opacity)) + ` stroke-width="${n2(s.stroke.width)}" stroke-linejoin="${s.stroke.join}" stroke-linecap="${s.stroke.cap}"`;
  }
  return withDefs(defs, `<path d="${d}"${a}/>`);
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0');

/** Rectangles for a pixel drawing: runs of one colour along each row, and identical runs on following rows joined into one taller rectangle. */
export function pixelRects(d: PixelDrawing, size: number): string[] {
  const out: string[] = [];
  const px = d.pixels;
  type Open = { y: number; h: number; x: number; w: number; fill: string };
  let prev = new Map<string, Open>();
  const rects: Open[] = [];
  for (let y = 0; y < d.height; y++) {
    const cur = new Map<string, Open>();
    let x = 0;
    while (x < d.width) {
      const i = (y * d.width + x) * 4;
      const a = px[i + 3];
      if (a === 0) {
        x++;
        continue;
      }
      let x2 = x + 1;
      while (x2 < d.width) {
        const j = (y * d.width + x2) * 4;
        if (px[j] !== px[i] || px[j + 1] !== px[i + 1] || px[j + 2] !== px[i + 2] || px[j + 3] !== a) break;
        x2++;
      }
      const fill = hex2(px[i]) + hex2(px[i + 1]) + hex2(px[i + 2]) + (a < 255 ? ':' + n2(a / 255) : '');
      const key = `${x}:${x2 - x}:${fill}`;
      const above = prev.get(key);
      if (above) {
        above.h++;
        cur.set(key, above);
      } else {
        const r: Open = { y, h: 1, x, w: x2 - x, fill };
        rects.push(r);
        cur.set(key, r);
      }
      x = x2;
    }
    prev = cur;
  }
  for (const r of rects) {
    const [hex, alpha] = r.fill.split(':');
    out.push(`<rect x="${n2(r.x * size)}" y="${n2(r.y * size)}" width="${n2(r.w * size)}" height="${n2(r.h * size)}" fill="#${hex}"${alpha ? ` fill-opacity="${alpha}"` : ''}/>`);
  }
  return out;
}

/** The SVG elements for a drawing as a layer shows it (pixel and tile drawings as rectangles). */
export function drawingToSvg(doc: Doc, layer: Layer, d: Drawing, frame: number): string[] {
  if (d.kind === 'pixel') return pixelRects(d, layer.kind === 'pixel' ? layer.pixelSize : 1);
  if (d.kind === 'tilemap') return pixelRects(flattenTilemap(doc, d, frame), layer.kind === 'tilemap' ? layer.pixelSize : 1);
  if (d.kind === 'vector') return d.shapes.map((x) => shapeToSvg(x, doc)).filter(Boolean);
  return [];
}

/** A layer name made safe as an id, unique among `used`. */
export function layerId(name: string, used: Set<string>): string {
  let id = name.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'layer';
  if (/^[0-9-]/.test(id)) id = 'layer-' + id;
  while (used.has(id)) id += '_';
  used.add(id);
  return id;
}

function layerToSvg(doc: Doc, layer: Layer, frame: number, id: string): string {
  const d = poseAt(doc, layer, frame);
  if (!d || d.kind === 'camera') return '';
  const inner = drawingToSvg(doc, layer, d, frame);
  if (!inner.length) return '';
  // Opacity, blend mode and effects go on the groups around it (svg-look.ts).
  return `<g id="${esc(id)}"${d.kind !== 'vector' ? ' shape-rendering="crispEdges"' : ''}>\n${inner.join('\n')}\n</g>`;
}

/** Definitions (filters, masks, shared sprites) as one <defs>, or nothing. */
export function defsBlock(defs: string[], body: string): string {
  const all = [...defs, ...tintDefs(body + defs.join(''))];
  return all.length ? `<defs>\n${all.join('\n')}\n</defs>\n` : '';
}

/** One frame as SVG, and plain words about anything SVG couldn't keep. */
export function frameSvgExport(doc: Doc, frame: number, opts: SvgOptions = {}): { svg: string; notes: string[] } {
  const scale = opts.scale ?? 1;
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const used = new Set<string>();
  const view = cameraViewAt(doc, frame);
  const notes = new Set<string>();
  const defs: string[] = [];
  const { value: body, defs: sprites } = withSprites(() =>
    composeSvg({
      doc,
      frames: [frame],
      duration: 1 / doc.fps,
      loop: false,
      defs,
      notes,
      body(layer) {
        const g = layerToSvg(doc, layer, frame, layerId(layer.name, used));
        if (!g) return '';
        // Seen through the camera, like every other export.
        const m = layerCameraMatrix(doc, layer, view);
        return m ? `<g transform="matrix(${m.map((v) => n4(v)).join(' ')})">\n${g}\n</g>` : g;
      },
    }),
  );
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${n2(doc.width)} ${n2(doc.height)}">`];
  const d = defsBlock([...defs, ...sprites], body);
  if (d) lines.push(d.trimEnd());
  if (doc.background && !opts.transparent) lines.push(`<rect width="${n2(doc.width)}" height="${n2(doc.height)}"${paint('fill', doc.background, 1)}/>`);
  if (body) lines.push(body);
  lines.push('</svg>');
  return { svg: lines.join('\n') + '\n', notes: [...notes] };
}

export function frameToSvg(doc: Doc, frame: number, opts: SvgOptions = {}): string {
  return frameSvgExport(doc, frame, opts).svg;
}
