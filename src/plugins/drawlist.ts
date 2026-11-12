// A draw list: how a plugin shows something without ever touching a canvas. It sends a plain list of shapes (lines,
// boxes, ellipses, polygons, paths, text); Frameling checks it and draws it itself, on the canvas as a guide, or
// turns it into ordinary shapes in the drawing. Pure apart from `drawDrawList`, which needs a 2D context.
import type { PathShape, SubPath, TextShape } from '../core/format';
import { newTextShape } from '../text/model';
import { cssFontFor, knownFont } from './fonts';

export type Style = {
  /** Outline colour, `#rrggbb` or `#rrggbbaa`. */
  stroke?: string;
  /** Inside colour. */
  fill?: string;
  /** Outline width in stage pixels (screen pixels with `screen: true`, on the canvas guide only). */
  width?: number;
  opacity?: number;
  join?: 'round' | 'miter' | 'bevel';
  cap?: 'round' | 'butt' | 'square';
  /** Dash and gap lengths, on the canvas guide only. */
  dash?: number[];
  screen?: boolean;
};

export type PathCommand = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number] | ['C', number, number, number, number, number, number] | ['Z'];

export type DrawItem =
  | ({ type: 'line'; x1: number; y1: number; x2: number; y2: number } & Style)
  | ({ type: 'rect'; x: number; y: number; w: number; h: number; r?: number } & Style)
  | ({ type: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & Style)
  | ({ type: 'polygon' | 'polyline'; points: [number, number][] } & Style)
  | ({ type: 'path'; d: PathCommand[] } & Style)
  | ({ type: 'text'; x: number; y: number; text: string; size?: number; align?: 'left' | 'center' | 'right'; font?: string; weight?: number; italic?: boolean } & Style)
  /** A dot the person can drag (tool previews only): Frameling draws it at a fixed size on screen and tells the tool when it is grabbed. */
  | ({ type: 'handle'; id: string; x: number; y: number; size?: number; shape?: 'square' | 'circle' | 'diamond' } & Style);

export type DrawList = DrawItem[];

export const DRAW_LIMITS = { items: 1000, points: 20000, text: 100, handles: 50, coord: 1_000_000 };

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const HANDLE_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** A font family name: letters, numbers, spaces, dots and dashes only (no quotes or punctuation that could break out of a CSS list). */
const FONT_NAME = /^[\p{L}\p{N} ._-]{1,60}$/u;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= DRAW_LIMITS.coord;

function cleanStyle(o: Record<string, any>): Style {
  const s: Style = {};
  if (typeof o.stroke === 'string' && COLOR.test(o.stroke)) s.stroke = o.stroke;
  if (typeof o.fill === 'string' && COLOR.test(o.fill)) s.fill = o.fill;
  if (fin(o.width) && o.width >= 0) s.width = Math.min(500, o.width);
  if (fin(o.opacity)) s.opacity = Math.min(1, Math.max(0, o.opacity));
  if (o.join === 'round' || o.join === 'miter' || o.join === 'bevel') s.join = o.join;
  if (o.cap === 'round' || o.cap === 'butt' || o.cap === 'square') s.cap = o.cap;
  if (Array.isArray(o.dash) && o.dash.length && o.dash.length <= 6 && o.dash.every((n: unknown) => fin(n) && (n as number) >= 0) && o.dash.some((n: number) => n > 0)) s.dash = o.dash.slice(0, 6);
  if (o.screen === true) s.screen = true;
  return s;
}

/** The draw list, cleaned: only known items with finite numbers, at most `DRAW_LIMITS` of them. Never throws. */
export function sanitizeDrawList(raw: unknown): DrawList {
  const out: DrawList = [];
  if (!Array.isArray(raw)) return out;
  let points = 0;
  let texts = 0;
  let handles = 0;
  for (const o of raw) {
    if (out.length >= DRAW_LIMITS.items) break;
    if (!isObj(o)) continue;
    const st = cleanStyle(o);
    switch (o.type) {
      case 'line':
        if (fin(o.x1) && fin(o.y1) && fin(o.x2) && fin(o.y2)) {
          out.push({ type: 'line', x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, ...st });
          points += 2;
        }
        break;
      case 'rect':
        if (fin(o.x) && fin(o.y) && fin(o.w) && fin(o.h)) out.push({ type: 'rect', x: o.x, y: o.y, w: o.w, h: o.h, ...(fin(o.r) && o.r > 0 ? { r: o.r } : {}), ...st });
        break;
      case 'ellipse':
        if (fin(o.cx) && fin(o.cy) && fin(o.rx) && fin(o.ry)) out.push({ type: 'ellipse', cx: o.cx, cy: o.cy, rx: Math.abs(o.rx), ry: Math.abs(o.ry), ...st });
        break;
      case 'polygon':
      case 'polyline': {
        if (!Array.isArray(o.points)) break;
        const pts: [number, number][] = [];
        for (const p of o.points) {
          if (points + pts.length >= DRAW_LIMITS.points) break;
          if (Array.isArray(p) && fin(p[0]) && fin(p[1])) pts.push([p[0], p[1]]);
        }
        if (pts.length >= 2) {
          points += pts.length;
          out.push({ type: o.type, points: pts, ...st });
        }
        break;
      }
      case 'path': {
        if (!Array.isArray(o.d)) break;
        const d: PathCommand[] = [];
        for (const c of o.d) {
          if (points >= DRAW_LIMITS.points) break;
          if (!Array.isArray(c)) continue;
          const need = c[0] === 'M' || c[0] === 'L' ? 2 : c[0] === 'Q' ? 4 : c[0] === 'C' ? 6 : c[0] === 'Z' ? 0 : -1;
          if (need < 0) continue;
          const nums = c.slice(1, 1 + need);
          if (nums.length !== need || !nums.every(fin)) continue;
          d.push([c[0], ...nums] as PathCommand);
          points += Math.max(1, need / 2);
        }
        if (d.length >= 2 && d[0][0] === 'M') out.push({ type: 'path', d, ...st });
        break;
      }
      case 'text':
        if (fin(o.x) && fin(o.y) && typeof o.text === 'string' && texts < DRAW_LIMITS.text) {
          texts++;
          const font = typeof o.font === 'string' && FONT_NAME.test(o.font.trim()) ? o.font.trim() : null;
          out.push({
            type: 'text',
            x: o.x,
            y: o.y,
            text: o.text.replace(/[\u0000-\u001f]/g, ' ').slice(0, 200),
            ...(fin(o.size) && o.size > 0 ? { size: Math.min(500, o.size) } : {}),
            ...(o.align === 'center' || o.align === 'right' ? { align: o.align } : {}),
            ...(font ? { font } : {}),
            ...(fin(o.weight) ? { weight: Math.round(Math.min(900, Math.max(100, o.weight)) / 100) * 100 } : {}),
            ...(o.italic === true ? { italic: true } : {}),
            ...st,
          });
        }
        break;
      case 'handle':
        if (fin(o.x) && fin(o.y) && typeof o.id === 'string' && HANDLE_ID.test(o.id) && handles < DRAW_LIMITS.handles && !out.some((h) => h.type === 'handle' && h.id === o.id)) {
          handles++;
          out.push({ type: 'handle', id: o.id, x: o.x, y: o.y, ...(fin(o.size) && o.size > 0 ? { size: Math.min(40, Math.max(4, o.size)) } : {}), ...(o.shape === 'circle' || o.shape === 'diamond' ? { shape: o.shape } : {}), ...st });
        }
        break;
    }
  }
  return out;
}

/** Most a shape's settings may take once written as JSON, and how deep they may nest. */
export const PROPS_LIMITS = { bytes: 64 * 1024, depth: 12 };

/** A shape's settings as plain data (a copy), or null when they are not plain, too deep or too big. */
export function plainProps(v: unknown): Record<string, unknown> | null {
  if (v === undefined) return {};
  if (!isObj(v)) return null;
  const deep = (x: unknown, d: number): boolean => {
    if (d > PROPS_LIMITS.depth) return false;
    if (Array.isArray(x)) return x.every((i) => deep(i, d + 1));
    if (isObj(x)) return Object.values(x).every((i) => deep(i, d + 1));
    return true;
  };
  if (!deep(v, 0)) return null;
  try {
    const json = JSON.stringify(v);
    if (json.length > PROPS_LIMITS.bytes) return null;
    const copy = JSON.parse(json, (k, val) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : val));
    return isObj(copy) ? copy : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- drawing on a canvas (the guide on screen)

const KAPPA = 0.5522847498307936;

function tracePath(g: CanvasRenderingContext2D, item: DrawItem): void {
  g.beginPath();
  switch (item.type) {
    case 'line':
      g.moveTo(item.x1, item.y1);
      g.lineTo(item.x2, item.y2);
      break;
    case 'rect': {
      const r = Math.min(item.r ?? 0, Math.abs(item.w) / 2, Math.abs(item.h) / 2);
      if (r > 0 && typeof g.roundRect === 'function') g.roundRect(item.x, item.y, item.w, item.h, r);
      else g.rect(item.x, item.y, item.w, item.h);
      break;
    }
    case 'ellipse':
      g.ellipse(item.cx, item.cy, item.rx, item.ry, 0, 0, Math.PI * 2);
      break;
    case 'polygon':
    case 'polyline':
      item.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (item.type === 'polygon') g.closePath();
      break;
    case 'path':
      for (const c of item.d) {
        if (c[0] === 'M') g.moveTo(c[1], c[2]);
        else if (c[0] === 'L') g.lineTo(c[1], c[2]);
        else if (c[0] === 'Q') g.quadraticCurveTo(c[1], c[2], c[3], c[4]);
        else if (c[0] === 'C') g.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        else g.closePath();
      }
      break;
    case 'text':
      break;
  }
}

/** How big a handle is on screen, and how close the pointer must come to grab one. */
export const HANDLE_SIZE = 10;

function drawHandle(g: CanvasRenderingContext2D, h: Extract<DrawItem, { type: 'handle' }>, unit: number, hot: boolean): void {
  const r = ((h.size ?? HANDLE_SIZE) / 2) * unit * (hot ? 1.25 : 1);
  g.beginPath();
  if (h.shape === 'circle') g.arc(h.x, h.y, r, 0, Math.PI * 2);
  else if (h.shape === 'diamond') {
    g.moveTo(h.x, h.y - r * 1.2);
    g.lineTo(h.x + r * 1.2, h.y);
    g.lineTo(h.x, h.y + r * 1.2);
    g.lineTo(h.x - r * 1.2, h.y);
    g.closePath();
  } else g.rect(h.x - r, h.y - r, r * 2, r * 2);
  g.fillStyle = h.fill ?? '#ffffff';
  g.fill();
  g.strokeStyle = h.stroke ?? '#1a73e8';
  g.lineWidth = 2 * unit;
  g.lineJoin = 'round';
  g.stroke();
}

/** The handle under a point (the topmost), or null. `zoom` turns screen pixels into stage pixels, so a handle is as easy to grab at any zoom. */
export function handleAt(list: DrawList, x: number, y: number, zoom: number): string | null {
  const z = zoom > 0 ? zoom : 1;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    if (h.type !== 'handle') continue;
    const reach = Math.max(HANDLE_SIZE, h.size ?? HANDLE_SIZE) / 2 + 3;
    if (Math.hypot(h.x - x, h.y - y) * z <= reach) return h.id;
  }
  return null;
}

/** The mouse cursor for a handle: open hand while the pointer is over one, closed hand while it is dragged, else the tool's own (null). */
export function handleCursor(over: string | null, dragging: string | null): 'grab' | 'grabbing' | null {
  return dragging ? 'grabbing' : over ? 'grab' : null;
}

/** Smallest dash or gap that is drawn (in screen pixels) and most dashes one line may be cut into. Past either it is drawn solid. */
export const DASH_LIMITS = { minScreenPx: 0.5, maxDashes: 4000 };

/** About how long an item's outline is, in stage units (an upper bound is fine: it only guards the dash count). */
export function outlineLength(item: DrawItem): number {
  const along = (pts: number[][], close: boolean) => {
    let n = 0;
    for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (close && pts.length > 1) n += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return n;
  };
  switch (item.type) {
    case 'line':
      return Math.hypot(item.x2 - item.x1, item.y2 - item.y1);
    case 'rect':
      return 2 * (Math.abs(item.w) + Math.abs(item.h));
    case 'ellipse':
      return 2 * Math.PI * Math.max(Math.abs(item.rx), Math.abs(item.ry));
    case 'polygon':
    case 'polyline':
      return along(item.points, item.type === 'polygon');
    case 'path': {
      let n = 0;
      let at: number[] | null = null;
      for (const c of item.d) {
        if (c[0] === 'Z') continue;
        // Control points count too: the curve is never longer than the line through them.
        const pts = [] as number[][];
        for (let i = 1; i < c.length; i += 2) pts.push([c[i] as number, c[i + 1] as number]);
        if (c[0] === 'M') at = pts[0];
        else {
          n += along(at ? [at, ...pts] : pts, false);
          at = pts[pts.length - 1];
        }
      }
      return n;
    }
    default:
      return 0;
  }
}

/**
 * The dash pattern to draw an item with, in stage units, or null for a solid line. Every dash and gap is at least half a
 * screen pixel, and a line that would be cut into too many dashes is drawn solid, so a pattern like [1e-9, 1e-9] cannot stall the canvas.
 */
export function safeDash(dash: number[], unit: number, zoom: number, length: number): number[] | null {
  const min = DASH_LIMITS.minScreenPx / (zoom > 0 ? zoom : 1);
  const seg = dash.map((n) => (n * unit > 0 ? Math.max(n * unit, min) : 0));
  const sum = seg.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const period = sum * (seg.length % 2 ? 2 : 1);
  const perPeriod = seg.length % 2 ? seg.length * 2 : seg.length;
  return (length / period) * perPeriod > DASH_LIMITS.maxDashes ? null : seg;
}

/** Draws a checked draw list in stage coordinates. `zoom` keeps `screen` widths the same size on screen. `hot` is the handle under the pointer. */
export function drawDrawList(g: CanvasRenderingContext2D, list: DrawList, zoom = 1, hot: string | null = null): void {
  const z = zoom > 0 ? zoom : 1;
  for (const item of list) {
    g.save();
    g.globalAlpha = item.opacity ?? 1;
    const unit = item.screen ? 1 / z : 1;
    if (item.type === 'handle') {
      drawHandle(g, item, 1 / z, hot === item.id);
      g.restore();
      continue;
    }
    if (item.type === 'text') {
      g.font = `${item.italic ? 'italic ' : ''}${item.weight ?? 400} ${(item.size ?? 12) * unit}px ${cssFontFor(item.font)}`;
      g.textAlign = item.align ?? 'left';
      g.textBaseline = 'alphabetic';
      if (item.stroke) {
        g.strokeStyle = item.stroke;
        g.lineWidth = (item.width ?? 1) * unit;
        g.strokeText(item.text, item.x, item.y);
      }
      g.fillStyle = item.fill ?? (item.stroke ? 'transparent' : '#000000');
      g.fillText(item.text, item.x, item.y);
      g.restore();
      continue;
    }
    tracePath(g, item);
    const open = item.type === 'line' || item.type === 'polyline';
    if (item.fill && !open) {
      g.fillStyle = item.fill;
      g.fill('evenodd');
    }
    if (item.stroke || open || !item.fill) {
      g.strokeStyle = item.stroke ?? '#000000';
      g.lineWidth = (item.width ?? 1) * unit;
      g.lineJoin = item.join ?? 'round';
      g.lineCap = item.cap ?? 'round';
      const dash = item.dash ? safeDash(item.dash, unit, z, outlineLength(item)) : null;
      if (dash) g.setLineDash(dash);
      g.stroke();
    }
    g.restore();
  }
}

// ---------------------------------------------------------------- turning it into ordinary shapes

type Pt = { x: number; y: number };

function rectPath(x: number, y: number, w: number, h: number, radius: number): SubPath {
  const rx = Math.min(x, x + w);
  const ry = Math.min(y, y + h);
  const rw = Math.abs(w);
  const rh = Math.abs(h);
  const r = Math.max(0, Math.min(radius, rw / 2, rh / 2));
  if (r < 0.01) return { closed: true, points: [{ x: rx, y: ry }, { x: rx + rw, y: ry }, { x: rx + rw, y: ry + rh }, { x: rx, y: ry + rh }] };
  const k = KAPPA * r;
  return {
    closed: true,
    points: [
      { x: rx + r, y: ry, c1: { x: rx, y: ry + r - k }, c2: { x: rx + r - k, y: ry } },
      { x: rx + rw - r, y: ry },
      { x: rx + rw, y: ry + r, c1: { x: rx + rw - r + k, y: ry }, c2: { x: rx + rw, y: ry + r - k } },
      { x: rx + rw, y: ry + rh - r },
      { x: rx + rw - r, y: ry + rh, c1: { x: rx + rw, y: ry + rh - r + k }, c2: { x: rx + rw - r + k, y: ry + rh } },
      { x: rx + r, y: ry + rh },
      { x: rx, y: ry + rh - r, c1: { x: rx + r - k, y: ry + rh }, c2: { x: rx, y: ry + rh - r + k } },
      { x: rx, y: ry + r },
    ],
  };
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): SubPath {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return {
    closed: true,
    points: [
      { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
      { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
      { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
      { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
    ],
  };
}

function commandsToSubPaths(d: PathCommand[]): SubPath[] {
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let at: Pt = { x: 0, y: 0 };
  for (const c of d) {
    if (c[0] === 'M') {
      if (cur && cur.points.length > 1) out.push(cur);
      at = { x: c[1], y: c[2] };
      cur = { closed: false, points: [{ ...at }] };
    } else if (!cur) {
      continue;
    } else if (c[0] === 'L') {
      at = { x: c[1], y: c[2] };
      cur.points.push({ ...at });
    } else if (c[0] === 'C') {
      cur.points.push({ x: c[5], y: c[6], c1: { x: c[1], y: c[2] }, c2: { x: c[3], y: c[4] } });
      at = { x: c[5], y: c[6] };
    } else if (c[0] === 'Q') {
      // A quadratic as the equal cubic.
      const c1 = { x: at.x + (2 / 3) * (c[1] - at.x), y: at.y + (2 / 3) * (c[2] - at.y) };
      const c2 = { x: c[3] + (2 / 3) * (c[1] - c[3]), y: c[4] + (2 / 3) * (c[2] - c[4]) };
      cur.points.push({ x: c[3], y: c[4], c1, c2 });
      at = { x: c[3], y: c[4] };
    } else {
      cur.closed = true;
    }
  }
  if (cur && cur.points.length > 1) out.push(cur);
  return out;
}

function subPathsOf(item: DrawItem): SubPath[] {
  switch (item.type) {
    case 'line':
      return [{ closed: false, points: [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }] }];
    case 'rect':
      return [rectPath(item.x, item.y, item.w, item.h, item.r ?? 0)];
    case 'ellipse':
      return item.rx > 0 && item.ry > 0 ? [ellipsePath(item.cx, item.cy, item.rx, item.ry)] : [];
    case 'polygon':
    case 'polyline':
      return [{ closed: item.type === 'polygon', points: item.points.map(([x, y]) => ({ x, y })) }];
    case 'path':
      return commandsToSubPaths(item.d);
    case 'text':
    case 'handle':
      return [];
  }
}

/**
 * The draw list as ordinary shapes: a path for each item that has an outline or an inside, and a text shape for each
 * text item (in the font asked for when it is installed here, else Nunito). Handles are for tool previews and are left out.
 */
export function drawListToShapes(list: DrawList, newId: () => string): (PathShape | TextShape)[] {
  const shapes: (PathShape | TextShape)[] = [];
  for (const item of list) {
    if (item.type === 'text') {
      if (!item.text.trim()) continue;
      shapes.push(
        newTextShape(newId(), { x: item.x, y: item.y }, { text: item.text, font: knownFont(item.font) ?? 'Nunito', size: item.size ?? 16, weight: item.weight ?? 400, ...(item.italic ? { italic: true } : {}), color: item.fill ?? item.stroke ?? '#000000', align: item.align ?? 'left', opacity: item.opacity ?? 1 }),
      );
      continue;
    }
    const paths = subPathsOf(item);
    if (!paths.length) continue;
    const open = item.type === 'line' || item.type === 'polyline';
    const fill = open ? null : (item.fill ?? null);
    const stroke = item.stroke ?? (fill ? null : '#000000');
    shapes.push({
      id: newId(),
      type: 'path',
      paths,
      fill,
      stroke: stroke ? { color: stroke, width: item.width ?? 1, join: item.join ?? 'round', cap: item.cap ?? 'round' } : null,
      opacity: item.opacity ?? 1,
    });
  }
  return shapes;
}

/** A stand-in for a shape whose drawing is not there (a faint box with a cross), so it can still be seen and moved. */
export function placeholderShapes(box: { x: number; y: number; w: number; h: number }, newId: () => string): PathShape[] {
  const { x, y, w, h } = box;
  const stroke = { color: '#8a8f98', width: 1, join: 'round' as const, cap: 'round' as const };
  return [
    { id: newId(), type: 'path', paths: [rectPath(x, y, w, h, 0)], fill: null, stroke, opacity: 0.8 },
    { id: newId(), type: 'path', paths: [{ closed: false, points: [{ x, y }, { x: x + w, y: y + h }] }, { closed: false, points: [{ x: x + w, y }, { x, y: y + h }] }], fill: null, stroke, opacity: 0.8 },
  ];
}

// ---------------------------------------------------------------- snap lines from a guide

/** Most snap lines one guide may offer, so a busy guide cannot slow every drag. */
export const GUIDE_SNAP_LIMIT = 400;

/**
 * The straight lines a canvas guide offers to snap to: sideways and up-and-down lines (and polygon edges), the edges
 * and middles of boxes, and the sides and middle of ellipses. Slanted lines, paths, text and handles offer none.
 */
export function guideSnapLines(list: DrawList): { x: number[]; y: number[] } {
  const cached = guideLinesCache.get(list);
  if (cached) return cached;
  const out = computeGuideSnapLines(list);
  guideLinesCache.set(list, out);
  return out;
}

/** Each draw list is checked once, however many drag moves ask. */
const guideLinesCache = new WeakMap<DrawList, { x: number[]; y: number[] }>();

function computeGuideSnapLines(list: DrawList): { x: number[]; y: number[] } {
  const xs = new Set<number>();
  const ys = new Set<number>();
  const round = (n: number) => Math.round(n * 100) / 100;
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    if (Math.abs(x1 - x2) < 0.01) xs.add(round(x1));
    else if (Math.abs(y1 - y2) < 0.01) ys.add(round(y1));
  };
  for (const item of list) {
    if (xs.size + ys.size >= GUIDE_SNAP_LIMIT) break;
    switch (item.type) {
      case 'line':
        seg(item.x1, item.y1, item.x2, item.y2);
        break;
      case 'polygon':
      case 'polyline': {
        const p = item.points;
        for (let i = 1; i < p.length; i++) seg(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
        if (item.type === 'polygon' && p.length > 2) seg(p[p.length - 1][0], p[p.length - 1][1], p[0][0], p[0][1]);
        break;
      }
      case 'rect':
        xs.add(round(item.x)).add(round(item.x + item.w / 2)).add(round(item.x + item.w));
        ys.add(round(item.y)).add(round(item.y + item.h / 2)).add(round(item.y + item.h));
        break;
      case 'ellipse':
        xs.add(round(item.cx - item.rx)).add(round(item.cx)).add(round(item.cx + item.rx));
        ys.add(round(item.cy - item.ry)).add(round(item.cy)).add(round(item.cy + item.ry));
        break;
      default:
        break;
    }
  }
  return { x: [...xs].slice(0, GUIDE_SNAP_LIMIT), y: [...ys].slice(0, GUIDE_SNAP_LIMIT) };
}
