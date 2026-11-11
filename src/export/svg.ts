// One frame as an SVG: vector layers become real paths (brush strokes as their outline shape, exactly the one the
// canvas fills), pixel layers become one rectangle per run of same-coloured pixels, so nothing is lost.
import type { Doc, Layer, PathShape, PixelDrawing, Shape, StrokeShape, SubPath } from '../core/format';
import { isPosed, poseAt, type PosedInstance } from '../core/symbols';
import { drawMeshed, strokeOutline } from '../core/render';
import { encodePng } from '../io/png';
import { flattenTilemap } from '../tiles/model';

export interface SvgOptions {
  /** Output size as a multiple of the document size (the drawing itself always keeps its own units). */
  scale?: number;
  /** Leave the background out. */
  transparent?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

function paint(attr: 'fill' | 'stroke', color: string, opacity: number): string {
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

function shapeToSvg(s: Shape): string {
  if (s.type === 'instance') return isPosed(s) ? instanceToSvg(s) : '';
  if (s.type === 'stroke') {
    const d = strokeToPathData(s);
    return d ? `<path d="${d}"${paint('fill', s.color, s.opacity)}/>` : '';
  }
  if (s.type === 'fill') {
    const d = subPathsToPathData(s.paths);
    return d ? `<path d="${d}"${paint('fill', s.color, s.opacity)} fill-rule="evenodd"/>` : '';
  }
  return pathShapeToSvg(s);
}

// A posed instance becomes a group with its matrix; its layers nest inside. Tint has no plain SVG equivalent, so
// it's left out of SVG (video, GIF and sheets show it).
function instanceToSvg(s: PosedInstance): string {
  const inner: string[] = [];
  for (const l of s.posed.layers) {
    if (l.mesh) {
      // A layer bent by bones has no vector equivalent, so it goes in as a picture.
      const img = meshImage(l.drawing, l.pixelSize, l.mesh);
      if (img) inner.push(l.opacity < 1 ? `<g opacity="${op(l.opacity)}">${img}</g>` : img);
      continue;
    }
    const parts = l.drawing.kind === 'pixel' ? pixelRects(l.drawing, l.pixelSize) : l.drawing.kind === 'vector' ? l.drawing.shapes.map(shapeToSvg).filter(Boolean) : [];
    if (!parts.length) continue;
    inner.push(l.opacity < 1 ? `<g opacity="${op(l.opacity)}">${parts.join('')}</g>` : parts.join(''));
  }
  if (!inner.length || s.opacity <= 0) return '';
  const m = s.posed.matrix.map((v) => n2(v)).join(' ');
  return `<g transform="matrix(${m})"${s.opacity < 1 ? ` opacity="${op(s.opacity)}"` : ''}>${inner.join('')}</g>`;
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
  let a = s.fill ? paint('fill', s.fill, s.opacity) + ' fill-rule="evenodd"' : ' fill="none"';
  if (s.stroke) {
    a += paint('stroke', s.stroke.color, s.opacity) + ` stroke-width="${n2(s.stroke.width)}" stroke-linejoin="${s.stroke.join}" stroke-linecap="${s.stroke.cap}"`;
  }
  return `<path d="${d}"${a}/>`;
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

function layerToSvg(doc: Doc, layer: Layer, frame: number, id: string): string {
  const d = poseAt(doc, layer, frame);
  if (!d) return '';
  let inner: string[];
  if (d.kind === 'pixel') inner = pixelRects(d, layer.kind === 'pixel' ? layer.pixelSize : 1);
  else if (d.kind === 'tilemap') inner = pixelRects(flattenTilemap(doc, d, frame), layer.kind === 'tilemap' ? layer.pixelSize : 1);
  else inner = d.shapes.map(shapeToSvg).filter(Boolean);
  if (!inner.length) return '';
  const attrs = `id="${esc(id)}"` + (layer.opacity < 1 ? ` opacity="${op(layer.opacity)}"` : '') + (d.kind !== 'vector' ? ' shape-rendering="crispEdges"' : '');
  return `<g ${attrs}>\n${inner.join('\n')}\n</g>`;
}

export function frameToSvg(doc: Doc, frame: number, opts: SvgOptions = {}): string {
  const scale = opts.scale ?? 1;
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${n2(doc.width)} ${n2(doc.height)}">`];
  if (doc.background && !opts.transparent) lines.push(`<rect width="${n2(doc.width)}" height="${n2(doc.height)}"${paint('fill', doc.background, 1)}/>`);
  const used = new Set<string>();
  for (const layer of doc.layers) {
    if (!layer.visible || layer.reference) continue;
    let id = layer.name.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'layer';
    if (/^[0-9-]/.test(id)) id = 'layer-' + id;
    while (used.has(id)) id += '_';
    used.add(id);
    const g = layerToSvg(doc, layer, frame, id);
    if (g) lines.push(g);
  }
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}
