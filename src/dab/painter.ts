// The Pixel brush's drawing, apart from the tool that holds it: the plain Brush (B) on a pixel layer draws the same way
// when the brush in hand is not a plain hard one (see pencil.ts). One place, so the two never differ.
import { parseHex } from '../canvas/colors';
import { getHover } from '../canvas/controller';
import { currentChoice } from '../core/choices';
import type { Tool, ToolContext, ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { drawMirrorLines } from '../pixel/tools';
import { SOFT_EDGE_CHOICE } from '../soft/choices';
import { edgeFor, type EdgeMode } from '../soft/maths';
import { flowFactor, sizeFactor } from '../tablet/dynamics';
import type { PenTool } from '../tablet/settings';
import { drivesFrom } from './dynamics';
import { senseOf, SpeedMeter } from './sense';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { PixelSession } from '../tools/pixelSession';
import { noteColorUsed } from '../tools/recent';
import { getToolSettings } from '../tools/settings';
import { reportEdit } from '../tools/util';
import { viewSizeFactor } from '../tools/view-size';
import { getDry } from '../dry/settings';
import { SIZE_RANGE } from './maths';
import { getDab } from './settings';
import { sessionStroke, type DabStroke } from './stroke';
import { PIXEL_BRUSH_TOOL } from './live';
import { drawDabCursor } from './cursor';

/** The width to paint with, in art pixels, for the pointer (pen pressure and tilt change it when the pen page says so). */
// The dab engine never lays a dab wider than a brush may be; a plain hard brush can be wider and is the pencil's to draw (see settings.ts).
const widthFor = (e: ToolPointer, pen: PenTool): number => Math.min(SIZE_RANGE.max, Math.max(1, getDab().size * sizeFor(e, pen) * viewSizeFactor()));
// A brush that sends the pen to its size (or flow) itself does not get the Pen page's pressure on top, so it never counts twice.
const sizeFor = (e: ToolPointer, pen: PenTool): number => (drivesFrom(getDab().dynamics, 'size', ['pressure', 'tilt']) ? 1 : sizeFactor(pen, e));
const flowFor = (e: ToolPointer, pen: PenTool): number => Math.min(1, getDab().flow * (drivesFrom(getDab().dynamics, 'flow', ['pressure', 'tilt']) ? 1 : flowFactor(pen as never, e)));

/**
 * How the edge is made on a layer right now. An aliased brush is always crisp. An anti-aliased one is smooth, unless the
 * layer's palette is locked (then it dithers), or Pixel perfect is on and the remembered answer says keep it crisp.
 */
export function dabEdge(aliased: boolean, layer: { paletteLock?: boolean }): { mode: EdgeMode; why: 'aliased' | 'locked' | 'perfect' | null } {
  if (aliased) return { mode: 'crisp', why: 'aliased' };
  return edgeFor({ locked: !!layer.paletteLock, pixelPerfect: getToolSettings().pixelPerfect, crispAnswer: currentChoice<'crisp' | 'smooth'>(SOFT_EDGE_CHOICE) });
}

/**
 * The handlers that draw with the pixel brush as set (the Pixel brush tool and the plain Brush on a pixel layer share them).
 * `pen` is the tool whose Pen settings (pressure, tilt) apply: the one the stabilizer is on. `mirrorLines` false when the
 * caller's tool already has the mirror lines drawn over its own overlay (the plain Brush does, see pixel/index.ts).
 */
export function dabPainter(pen: PenTool = PIXEL_BRUSH_TOOL, mirrorLines = true): Required<Pick<Tool, 'down' | 'move' | 'up' | 'cancel' | 'leave' | 'overlay'>> {
  let stroke: DabStroke | null = null;
  let session: PixelSession | null = null;
  let colour = '';
  let meter = new SpeedMeter();
  const finish = () => {
    const s = session;
    session = null;
    stroke = null;
    return s;
  };
  const go = (e: ToolPointer, ps: number) => {
    if (!session || !stroke) return;
    stroke.moveTo({ x: e.x / ps, y: e.y / ps }, widthFor(e, pen), flowFor(e, pen), senseOf(e, meter.push(e.x / ps, e.y / ps, e.time)));
    session.flush();
  };

  return {
    down(e, ctx) {
      const { layer, problem } = activeLayer();
      if (problem) return ctx.hint(EDIT_HINTS[problem]);
      if (!layer || layer.kind !== 'pixel') return ctx.hint('The pixel brush paints pixels, so it needs a pixel layer. Pick one in the timeline first.');
      const { doc, ui } = store().get();
      const rgba = parseHex(ui.color);
      if (!rgba) return ctx.hint("That colour isn't something I can paint with. Pick one from the Colours panel.");
      colour = ui.color;
      const brush = getDab();
      session = new PixelSession(doc, layer, ui.frame, { adds: true });
      meter = new SpeedMeter();
      // The back colour is the Fill colour (Photoshop's background): brushes that mix colour go toward it.
      const back = (ui.fillColor && parseHex(ui.fillColor)) || null;
      stroke = sessionStroke(session, doc, layer, { brush, color: rgba, back, edge: dabEdge(brush.aliased, layer).mode, sheet: getDry().paper });
      go(e, layer.pixelSize);
    },
    move(e) {
      if (session) go(e, session.pixelSize);
    },
    up(e, ctx) {
      if (session) {
        go(e, session.pixelSize);
        stroke?.finish();
        session.flush();
      }
      const s = finish();
      if (!s) return;
      const r = s.commit('Draw with the pixel brush');
      if (r === 'ok') {
        if (colour) noteColorUsed(colour);
      } else if (r !== 'nothing') reportEdit(ctx, r);
      ctx.requestOverlay();
    },
    cancel(ctx: ToolContext) {
      finish()?.discard();
      ctx.requestOverlay();
    },
    leave() {
      finish()?.discard();
    },
    overlay(g, ctx) {
      if (mirrorLines) drawMirrorLines(g, ctx);
      if (session) return;
      const h = getHover();
      const { layer } = activeLayer();
      if (!h || !layer || layer.kind !== 'pixel') return;
      drawDabCursor(g, ctx, h.x, h.y, layer.pixelSize, getDab(), Math.min(SIZE_RANGE.max, Math.max(1, getDab().size * viewSizeFactor())));
    },
  };
}
