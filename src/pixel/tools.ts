/**
 * The pixel art tools: Shade [S] (one step lighter or darker along the palette ramp), Dither [Shift+B] (a pattern of
 * the stroke and fill colours), the pixel pencil (the Pencil on a pixel layer) and pixel rectangles, ellipses and
 * lines (the shape tools on a pixel layer). All of them mirror when mirror drawing is on, and snap to the palette on
 * a palette-locked layer (both handled by PixelSession).
 */
import { findLayer } from '../core/doc';
import type { PathShape, PixelLayer, SubPath } from '../core/format';
import { registerCommand, registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { parseHex } from '../canvas/colors';
import { getHover } from '../canvas/controller';
import { vanishingPoints } from '../canvas/guides';
import { docToPixel, type PxPt } from '../canvas/pixels';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { drawPixelFootprint } from '../tools/cursors';
import { PixelSession } from '../tools/pixelSession';
import { PixelStroke, lastPixelEnd } from '../tools/pixelStroke';
import { noteColorUsed } from '../tools/recent';
import { getToolSettings } from '../tools/settings';
import { reportEdit } from '../tools/util';
import { viewPixelSize } from '../tools/view-size';
import { ditherInk, shadeInk, solidInk, type Ink } from './ink';
import { docPalette } from './palette';
import { perspectivePixelOutline, type PixelPerspective } from './perspective';
import { dragBox, plotEllipse, plotLine, plotPolygon, plotRect, plotRectInside, snapCleanLine } from './raster';
import { flattenSubPath } from '../geometry/hit';
import { getPixelSettings } from './settings';
import { DitherOptions, PixelPencilOptions, ShadeOptions } from './ToolOptions';

/** The active layer when it's a pixel layer. */
export function activePixelLayer(): PixelLayer | null {
  const { doc, ui } = store().get();
  const l = findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  return l?.kind === 'pixel' ? l : null;
}

/** Dashed mirror lines on the canvas while mirror drawing is on. Drawn by every pixel tool's overlay. */
export function drawMirrorLines(g: CanvasRenderingContext2D, ctx: ToolContext): void {
  const s = getPixelSettings();
  if (s.symmetry === 'off') return;
  const layer = activePixelLayer();
  if (!layer) return;
  const { doc } = store().get();
  const ps = layer.pixelSize;
  const gw = Math.ceil(doc.width / ps);
  const gh = Math.ceil(doc.height / ps);
  const px = 1 / ctx.zoom;
  g.save();
  g.setLineDash([6 * px, 4 * px]);
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgb(255 255 255 / 0.7)';
    g.stroke();
    g.lineWidth = 1.5 * px;
    g.strokeStyle = 'rgb(155 123 255 / 0.95)';
    g.stroke();
  };
  if (s.symmetry === 'h' || s.symmetry === 'both') {
    const x = (s.axisX ?? gw / 2) * ps;
    line(x, 0, x, gh * ps);
  }
  if (s.symmetry === 'v' || s.symmetry === 'both') {
    const y = (s.axisY ?? gh / 2) * ps;
    line(0, y, gw * ps, y);
  }
  g.restore();
}

function hoverFootprint(g: CanvasRenderingContext2D, ctx: ToolContext, size: number, color: string | null): void {
  drawMirrorLines(g, ctx);
  const h = getHover();
  const layer = activePixelLayer();
  if (!h || !layer) return;
  drawPixelFootprint(g, ctx, docToPixel(h.x, h.y, layer.pixelSize), layer.pixelSize, size, getToolSettings().pixelBrushShape, color);
}

// ---------------------------------------------------------------- painting tools with an ink

interface InkToolSpec {
  id: string;
  label: string;
  icon: string;
  key?: string;
  order: number;
  help: string;
  what: string;
  undo: string;
  options: Tool['options'];
  size: () => number;
  perfect: () => boolean;
  /** The ink to paint with, or a friendly reason it can't paint. */
  ink: () => Ink | string;
  /** The colour to show in the hover footprint. */
  hoverColor: () => string | null;
  /** The colour to remember as "recently used". */
  used?: () => string | null;
}

function inkTool(spec: InkToolSpec): Tool {
  let stroke: PixelStroke | null = null;
  return {
    id: spec.id,
    label: spec.label,
    icon: spec.icon,
    key: spec.key,
    layers: ['pixel'],
    order: spec.order,
    help: spec.help,
    cursor: 'crosshair',
    options: spec.options,
    down(e, ctx) {
      const { layer, problem } = activeLayer();
      if (problem) return ctx.hint(EDIT_HINTS[problem]);
      if (!layer || layer.kind !== 'pixel') return ctx.hint(`${spec.what} works on pixel layers. Pick a pixel layer in the timeline first.`);
      const ink = spec.ink();
      if (typeof ink === 'string') return ctx.hint(ink);
      const { doc, ui } = store().get();
      stroke = new PixelStroke(doc, layer, ui.frame, { color: [0, 0, 0, 255], size: viewPixelSize(spec.size()), shape: getToolSettings().pixelBrushShape, perfect: spec.perfect(), ink });
      const here = stroke.cell(e.x, e.y);
      const from = e.shift ? lastPixelEnd(doc, layer) : null;
      if (from) stroke.beginLine(from, here);
      else stroke.begin(here);
    },
    move(e) {
      stroke?.moveTo(stroke.cell(e.x, e.y));
    },
    up(e, ctx) {
      const s = stroke;
      stroke = null;
      if (!s) return;
      s.moveTo(s.cell(e.x, e.y));
      const r = s.commit(spec.undo);
      if (r === 'ok') {
        const c = spec.used?.();
        if (c) noteColorUsed(c);
      } else if (r !== 'nothing') reportEdit(ctx, r);
      ctx.requestOverlay();
    },
    cancel(ctx) {
      stroke?.discard();
      stroke = null;
      ctx.requestOverlay();
    },
    overlay(g, ctx) {
      if (stroke) return drawMirrorLines(g, ctx);
      hoverFootprint(g, ctx, viewPixelSize(spec.size()), spec.hoverColor());
    },
  };
}

const rgbaOf = (hex: string | null) => (hex ? parseHex(hex) : null);

export const shadeTool = inkTool({
  id: 'shade',
  label: 'Shade',
  icon: 'shade',
  key: 's',
  order: 22,
  help: 'tool-shade',
  what: 'Shading',
  undo: 'Shade pixels',
  options: ShadeOptions,
  size: () => getToolSettings().pixelBrushSize,
  perfect: () => getToolSettings().pixelPerfect,
  ink: () => {
    const p = docPalette(store().get().doc);
    if (p.colors.length < 2) return 'Shading steps along the palette, and this one has fewer than two colours. Add some in the Palette panel.';
    return shadeInk(p, getPixelSettings().shadeLighter);
  },
  hoverColor: () => null,
});

export const ditherTool = inkTool({
  id: 'dither',
  label: 'Dither',
  icon: 'dither',
  order: 24,
  help: 'tool-dither',
  what: 'The dither brush',
  undo: 'Dither pixels',
  options: DitherOptions,
  size: () => getPixelSettings().ditherSize,
  perfect: () => false,
  ink: () => {
    const ui = store().get().ui;
    const a = rgbaOf(ui.color);
    if (!a) return "That colour isn't something I can paint with. Pick one from the Colours panel.";
    return ditherInk(getPixelSettings().ditherPattern, a, rgbaOf(ui.fillColor));
  },
  hoverColor: () => store().get().ui.color,
  used: () => store().get().ui.color,
});

registerTool(shadeTool);
registerTool(ditherTool);
// The dither tool's own command, so it gets Shift+B (single letters are running out).
registerCommand({
  id: 'tools.dither',
  label: 'Dither',
  category: 'Tools',
  keys: ['Shift+B'],
  description: 'Switch to the dither brush: paints a pattern of the stroke and fill colours.',
  help: 'tool-dither',
  keywords: ['tool', 'dither', 'pattern', 'checker', 'pixel'],
  enabled: () => !!activePixelLayer(),
  checked: (s) => s.ui.tool === 'dither',
  run: () => store().setUi({ tool: 'dither' }),
});

// ---------------------------------------------------------------- the pencil on a pixel layer

/** The Pencil on a pixel layer: always one pixel, pixel perfect unless turned off, Shift+click for a line. */
export function makePixelPencil() {
  let stroke: PixelStroke | null = null;
  let color = '';
  return {
    options: PixelPencilOptions,
    active: () => !!stroke,
    down(e: ToolPointer, ctx: ToolContext, layer: PixelLayer): void {
      const { doc, ui } = store().get();
      const rgba = parseHex(ui.color);
      if (!rgba) return ctx.hint("That colour isn't something I can paint with. Pick one from the Colours panel.");
      color = ui.color;
      stroke = new PixelStroke(doc, layer, ui.frame, { color: rgba, size: 1, shape: 'square', perfect: getToolSettings().pixelPerfect });
      const here = stroke.cell(e.x, e.y);
      const from = e.shift ? lastPixelEnd(doc, layer) : null;
      if (from) stroke.beginLine(from, here);
      else stroke.begin(here);
    },
    move(e: ToolPointer): void {
      stroke?.moveTo(stroke.cell(e.x, e.y));
    },
    up(e: ToolPointer, ctx: ToolContext): void {
      const s = stroke;
      stroke = null;
      if (!s) return;
      s.moveTo(s.cell(e.x, e.y));
      const r = s.commit('Draw pixels');
      if (r === 'ok') noteColorUsed(color);
      else if (r !== 'nothing') reportEdit(ctx, r);
      ctx.requestOverlay();
    },
    cancel(): void {
      stroke?.discard();
      stroke = null;
    },
    overlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
      if (stroke) return drawMirrorLines(g, ctx);
      hoverFootprint(g, ctx, 1, store().get().ui.color);
    },
  };
}

// ---------------------------------------------------------------- rectangles, ellipses and lines on a pixel layer

export type PixelShapeKind = 'rect' | 'ellipse' | 'line';

/**
 * Paints a pixel shape between two cells into a session (after a reset, so it can be called on every move).
 * Rectangles and ellipses take the fill colour inside and the stroke colour round the edge (either can be none); a
 * line always uses the stroke colour. Shift squares the box, or snaps a line to a clean pixel slope. `persp` puts a
 * rectangle or ellipse on a perspective plane.
 */
export function paintPixelShape(
  session: PixelSession,
  kind: PixelShapeKind,
  a: PxPt,
  b: PxPt,
  mod: { shift: boolean; alt: boolean },
  colors: { fill: string | null; stroke: string | null; line: string },
  persp?: PixelPerspective,
): void {
  session.reset();
  if (kind === 'line') {
    const c = parseHex(colors.line);
    if (!c) return;
    const ink = session.lock(solidInk(c));
    let end = b;
    let start = a;
    if (mod.shift) end = snapCleanLine(a, b);
    if (mod.alt) start = { x: 2 * a.x - end.x, y: 2 * a.y - end.y };
    plotLine(start.x, start.y, end.x, end.y, (x, y) => session.paint(x, y, ink));
    return;
  }
  const [p, q] = dragBox(a, b, mod.shift, mod.alt);
  // With perspective guides showing, it follows the plane it's drawn on, rasterised as crisply as a flat one.
  const outline = persp && perspectivePixelOutline(kind, p, q, session.pixelSize, persp);
  if (outline) return paintPixelPaths(session, [outline], { fill: colors.fill, stroke: colors.stroke });
  const fill = colors.fill ? parseHex(colors.fill) : null;
  const stroke = colors.stroke ? parseHex(colors.stroke) : null;
  const fi = fill ? session.lock(solidInk(fill)) : null;
  const si = stroke ? session.lock(solidInk(stroke)) : null;
  // With no outline the fill covers the whole shape, edge included.
  const edge = si ?? fi;
  if (!edge) return;
  if (kind === 'rect') {
    if (fi) plotRectInside(p.x, p.y, q.x, q.y, (x, y) => session.paint(x, y, fi));
    plotRect(p.x, p.y, q.x, q.y, false, (x, y) => session.paint(x, y, edge));
  } else {
    plotEllipse(p.x, p.y, q.x, q.y, (x, y) => session.paint(x, y, edge), fi ? (x, y) => session.paint(x, y, fi) : undefined);
  }
}

/** The handlers the shape tools use on a pixel layer. */
export function makePixelShape(kind: PixelShapeKind, label: string) {
  let session: PixelSession | null = null;
  let start: PxPt | null = null;
  let size = 1;
  const draw = (e: ToolPointer) => {
    if (!session || !start) return;
    const ui = store().get().ui;
    const here = docToPixel(e.x, e.y, size);
    const persp = kind === 'line' ? undefined : { vps: vanishingPoints(e.mod), plane: getToolSettings().perspectivePlane };
    paintPixelShape(session, kind, start, here, { shift: e.shift, alt: e.alt }, { fill: ui.fillColor, stroke: ui.strokeOn ? ui.color : null, line: ui.color }, persp);
    session.flush();
  };
  return {
    active: () => !!session,
    down(e: ToolPointer, ctx: ToolContext, layer: PixelLayer): void {
      const { doc, ui } = store().get();
      if (kind !== 'line' && !ui.fillColor && !ui.strokeOn) return ctx.hint('Fill and stroke are both set to none, so the shape would be invisible. Pick a colour for one of them.');
      session = new PixelSession(doc, layer, ui.frame, { adds: true });
      size = layer.pixelSize;
      start = docToPixel(e.x, e.y, size);
      draw(e);
    },
    move(e: ToolPointer): void {
      draw(e);
    },
    up(e: ToolPointer, ctx: ToolContext): void {
      draw(e);
      const s = session;
      session = null;
      start = null;
      if (!s) return;
      const r = s.commit(`Draw ${label.toLowerCase()}`);
      if (r === 'ok') {
        const ui = store().get().ui;
        if (kind === 'line' || ui.strokeOn) noteColorUsed(ui.color);
        if (kind !== 'line' && ui.fillColor) noteColorUsed(ui.fillColor);
      } else if (r !== 'nothing') reportEdit(ctx, r);
      ctx.requestOverlay();
    },
    cancel(): void {
      session?.discard();
      session = null;
      start = null;
    },
    overlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
      if (session) return drawMirrorLines(g, ctx);
      hoverFootprint(g, ctx, 1, null);
    },
  };
}

// ---------------------------------------------------------------- pen, polygon and star on a pixel layer

/**
 * Paints outlines (in document units) as clean pixels: the fill colour inside closed ones, the stroke colour round
 * the edge. With no stroke the fill covers the edge too, like the pixel rectangle. Curves are cut into short lines.
 */
export function paintPixelPaths(session: PixelSession, paths: SubPath[], colors: { fill: string | null; stroke: string | null }): void {
  const fill = colors.fill ? parseHex(colors.fill) : null;
  const stroke = colors.stroke ? parseHex(colors.stroke) : null;
  const fi = fill ? session.lock(solidInk(fill)) : null;
  const si = stroke ? session.lock(solidInk(stroke)) : null;
  const edge = si ?? fi;
  if (!edge) return;
  const ps = session.pixelSize;
  for (const sp of paths) {
    const flat = flattenSubPath(sp);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i] / ps, y: flat[i + 1] / ps });
    plotPolygon(pts, sp.closed, (x, y) => session.paint(x, y, edge), fi && sp.closed ? (x, y) => session.paint(x, y, fi) : undefined);
  }
}

/** Puts a finished vector shape onto the pixel layer as pixels, one undo step. Used by the pen. */
export function commitPixelPath(shape: PathShape, label: string, ctx: ToolContext): void {
  const layer = activePixelLayer();
  if (!layer) return;
  const { doc, ui } = store().get();
  const session = new PixelSession(doc, layer, ui.frame, { adds: true });
  paintPixelPaths(session, shape.paths, { fill: shape.fill, stroke: shape.stroke?.color ?? null });
  const r = session.commit(label);
  if (r === 'ok') {
    if (shape.fill) noteColorUsed(shape.fill);
    if (shape.stroke) noteColorUsed(shape.stroke.color);
  } else if (r !== 'nothing') reportEdit(ctx, r);
}

/** The handlers the polygon and star use on a pixel layer: `build` makes the vector shape for a drag. */
export function makePixelPathShape(label: string, build: (a: { x: number; y: number }, e: ToolPointer) => PathShape | null) {
  let session: PixelSession | null = null;
  let start: { x: number; y: number } | null = null;
  const draw = (e: ToolPointer) => {
    if (!session || !start) return;
    session.reset();
    const shape = build(start, e);
    if (shape) paintPixelPaths(session, shape.paths, { fill: shape.fill, stroke: shape.stroke?.color ?? null });
    session.flush();
  };
  return {
    active: () => !!session,
    down(e: ToolPointer, ctx: ToolContext, layer: PixelLayer): void {
      const { doc, ui } = store().get();
      if (!ui.fillColor && !ui.strokeOn) return ctx.hint('Fill and stroke are both set to none, so the shape would be invisible. Pick a colour for one of them.');
      session = new PixelSession(doc, layer, ui.frame, { adds: true });
      start = { x: e.x, y: e.y };
      draw(e);
    },
    move(e: ToolPointer): void {
      draw(e);
    },
    up(e: ToolPointer, ctx: ToolContext): void {
      draw(e);
      const s = session;
      session = null;
      start = null;
      if (!s) return;
      const r = s.commit(`Draw ${label.toLowerCase()}`);
      if (r === 'ok') {
        const ui = store().get().ui;
        if (ui.strokeOn) noteColorUsed(ui.color);
        if (ui.fillColor) noteColorUsed(ui.fillColor);
      } else if (r !== 'nothing') reportEdit(ctx, r);
      ctx.requestOverlay();
    },
    cancel(): void {
      session?.discard();
      session = null;
      start = null;
    },
    overlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
      if (session) return drawMirrorLines(g, ctx);
      hoverFootprint(g, ctx, 1, null);
    },
  };
}
