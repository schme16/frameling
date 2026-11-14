/**
 * The Gradient tool [F] on a pixel layer. Drag across the picture: the colours run from where you press to where you
 * let go (or, on a radial gradient, from the middle out to the edge), stepping through your palette with a dither so
 * the steps melt into each other. It paints inside the selection when there is one, otherwise the whole canvas, and
 * keeps to the palette on a palette-locked layer. Paint is the colour at the start and Back the colour at the end.
 * The look is in gradient.ts; the vector side of this tool is src/tools/gradient-tool.ts, which hands pixel layers here.
 */
import { registerChoice, currentChoice } from '../core/choices';
import { registerCommands, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { parseHex } from '../canvas/colors';
import { hint } from '../canvas/controller';
import { angleSteps } from '../canvas/guides';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { constrain45 } from '../tools/pen';
import { PixelSession } from '../tools/pixelSession';
import { drawPoint, ink as handleInk } from '../tools/point-handles';
import { reportEdit } from '../tools/util';
import { maskBounds } from '../select/mask';
import { pixelSelection } from '../select/pixel-state';
import { GRADIENT_DITHERS, type GradientDither } from './dither';
import { gradientInk, GRADIENT_COLOURS, type GradientColours, type GradientShape, type GradientSpec } from './gradient';
import { docPalette } from './palette';
import { getPixelSettings, setPixelSettings } from './settings';
import { choiceWord } from '../words/choices';

export type GradientWhere = 'all' | 'painted';

registerChoice<GradientWhere>({
  id: 'pixelGradient.where',
  title: choiceWord('choice.pixelGradient.where.title'),
  question: choiceWord('choice.pixelGradient.where.question'),
  category: 'Drawing',
  default: 'all',
  // A preference with its own switch in the Gradient tool's options, so it never stops to ask.
  silent: true,
  help: 'pixel-gradient',
  options: [
    { value: 'all', label: choiceWord('choice.pixelGradient.where.all.label'), detail: choiceWord('choice.pixelGradient.where.all.detail') },
    { value: 'painted', label: choiceWord('choice.pixelGradient.where.painted.label'), detail: choiceWord('choice.pixelGradient.where.painted.detail') },
  ],
});

/** Shorter than this on screen is a click, not a drag. */
const MIN_DRAG_PX = 4;
/** Above this many pixels the picture is only updated when you let go, so a drag on a huge canvas stays smooth. */
const LIVE_LIMIT = 600 * 600;

interface Drag {
  session: PixelSession | null;
  start: { x: number; y: number };
  end: { x: number; y: number };
  moved: boolean;
}

let drag: Drag | null = null;

const rgba = (hex: string | null | undefined) => (hex ? parseHex(hex) : null);

/** The colours the gradient runs between (Paint, then Back), or a friendly reason there are not two. */
export function gradientColoursNow(): { from: NonNullable<ReturnType<typeof rgba>>; to: NonNullable<ReturnType<typeof rgba>> } | string {
  const { ui } = store().get();
  const from = rgba(ui.color);
  if (!from) return "That colour isn't something I can paint with. Pick one from the Colours panel.";
  const to = rgba(ui.fillColor);
  if (!to) return 'A gradient runs from Paint to Back, and Back is set to none. Pick a Back colour first.';
  return { from, to };
}

/** What a drag from `start` to `end` (document pixels) would paint. */
export function gradientSpec(pixelSize: number, start: { x: number; y: number }, end: { x: number; y: number }, from: GradientSpec['from'], to: GradientSpec['to']): GradientSpec {
  const s = getPixelSettings();
  const doc = store().get().doc;
  return {
    shape: s.gradientShape,
    line: { x0: start.x / pixelSize, y0: start.y / pixelSize, x1: end.x / pixelSize, y1: end.y / pixelSize },
    from,
    to,
    colours: s.gradientColours,
    dither: s.gradientDither,
    palette: docPalette(doc).colors,
    paintedOnly: currentChoice<GradientWhere>('pixelGradient.where') === 'painted',
  };
}

/** Paints a gradient into a session, over the selection's box when there is a selection, else the whole grid. */
function paintGradient(session: PixelSession, spec: GradientSpec): void {
  const sel = pixelSelection();
  const box = sel && sel.width === session.width && sel.height === session.height ? maskBounds(sel) : null;
  const x0 = box ? box.x0 : 0;
  const y0 = box ? box.y0 : 0;
  const x1 = box ? box.x1 : session.width - 1;
  const y1 = box ? box.y1 : session.height - 1;
  const ink = session.lock(gradientInk(spec));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) session.paint(x, y, ink);
}

function endFor(e: ToolPointer, d: Drag): { x: number; y: number } {
  return e.shift && angleSteps() ? constrain45(d.start, e) : { x: e.x, y: e.y };
}

function preview(d: Drag, pixelSize: number, ctx: ToolContext): void {
  const c = gradientColoursNow();
  if (typeof c === 'string' || !d.session) return;
  d.session.reset();
  paintGradient(d.session, gradientSpec(pixelSize, d.start, d.end, c.from, c.to));
  d.session.flush();
  ctx.requestOverlay();
}

export const pixelGradient = {
  down(e: ToolPointer, ctx: ToolContext): void {
    const { layer, problem } = activeLayer();
    if (problem) return ctx.hint(EDIT_HINTS[problem]);
    if (!layer || layer.kind !== 'pixel') return;
    const c = gradientColoursNow();
    if (typeof c === 'string') return ctx.hint(c);
    const { doc, ui } = store().get();
    const big = Math.ceil(doc.width / layer.pixelSize) * Math.ceil(doc.height / layer.pixelSize) > LIVE_LIMIT;
    drag = { session: big ? null : new PixelSession(doc, layer, ui.frame, { mirror: false, adds: true }), start: { x: e.x, y: e.y }, end: { x: e.x, y: e.y }, moved: false };
  },
  move(e: ToolPointer, ctx: ToolContext): void {
    const d = drag;
    if (!d) return;
    const layer = activeLayer().layer;
    if (!layer || layer.kind !== 'pixel') return;
    if (!d.moved && Math.hypot(e.x - d.start.x, e.y - d.start.y) * ctx.zoom < MIN_DRAG_PX) return;
    d.moved = true;
    d.end = endFor(e, d);
    preview(d, layer.pixelSize, ctx);
  },
  up(e: ToolPointer, ctx: ToolContext): void {
    const d = drag;
    drag = null;
    if (!d) return;
    const { layer } = activeLayer();
    if (!layer || layer.kind !== 'pixel') return void d.session?.discard();
    if (!d.moved && Math.hypot(e.x - d.start.x, e.y - d.start.y) * ctx.zoom < MIN_DRAG_PX) {
      d.session?.discard();
      ctx.hint('Drag across the picture to set where the gradient starts and ends.');
      ctx.requestOverlay();
      return;
    }
    d.end = endFor(e, d);
    const c = gradientColoursNow();
    d.session?.discard();
    if (typeof c === 'string') return ctx.hint(c);
    const { doc, ui } = store().get();
    const session = new PixelSession(doc, layer, ui.frame, { mirror: false, adds: true });
    paintGradient(session, gradientSpec(layer.pixelSize, d.start, d.end, c.from, c.to));
    const r = session.commit('Gradient');
    if (r === 'nothing') ctx.hint('Nothing changed. The gradient had nowhere to go: try without "Only painted pixels", or select somewhere first.');
    else if (r !== 'ok') reportEdit(ctx, r);
    ctx.requestOverlay();
  },
  cancel(ctx: ToolContext): void {
    drag?.session?.discard();
    drag = null;
    ctx.requestOverlay();
  },
  leave(): void {
    drag?.session?.discard();
    drag = null;
  },
  overlay(g: CanvasRenderingContext2D, ctx: ToolContext): void {
    const d = drag;
    if (!d || !d.moved) return;
    const z = ctx.zoom;
    const shape: GradientShape = getPixelSettings().gradientShape;
    const line = () => {
      g.beginPath();
      if (shape === 'radial') g.arc(d.start.x, d.start.y, Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y), 0, Math.PI * 2);
      g.moveTo(d.start.x, d.start.y);
      g.lineTo(d.end.x, d.end.y);
    };
    g.save();
    g.lineWidth = 3 / z;
    g.strokeStyle = 'rgb(255 255 255 / 0.8)';
    line();
    g.stroke();
    g.lineWidth = 1.25 / z;
    g.strokeStyle = handleInk();
    line();
    g.stroke();
    g.restore();
    drawPoint(g, d.start, z, { big: true });
    drawPoint(g, d.end, z, { on: true, big: true });
  },
};

// ---------------------------------------------------------------- commands

function cycle<T extends string>(list: readonly T[], now: T): T {
  return list[(list.indexOf(now) + 1) % list.length];
}

registerCommands([
  {
    id: 'pixel.gradientDither',
    label: 'Gradient: next dither style (classic, smooth, chunky, grainy, bands)',
    category: 'Draw',
    description: 'Changes how the Gradient tool dithers its steps on a pixel layer.',
    help: 'pixel-gradient',
    keywords: ['gradient', 'dither', 'bayer', 'pattern', 'pixel'],
    run: () => {
      const next = cycle(GRADIENT_DITHERS.map((d) => d.id) as GradientDither[], getPixelSettings().gradientDither);
      setPixelSettings({ gradientDither: next });
      hint(`Gradient dither: ${GRADIENT_DITHERS.find((d) => d.id === next)?.label}.`);
    },
  },
  {
    id: 'pixel.gradientColours',
    label: 'Gradient: next colour mode (palette steps, two colours, smooth)',
    category: 'Draw',
    description: 'Changes whether a pixel gradient steps through your palette, uses just its two colours, or blends smoothly.',
    help: 'pixel-gradient',
    keywords: ['gradient', 'palette', 'steps', 'ramp', 'blend', 'pixel'],
    run: () => {
      const next = cycle(GRADIENT_COLOURS.map((d) => d.id) as GradientColours[], getPixelSettings().gradientColours);
      setPixelSettings({ gradientColours: next });
      hint(`Gradient colours: ${GRADIENT_COLOURS.find((d) => d.id === next)?.label}.`);
    },
  },
  {
    id: 'pixel.gradientRadial',
    label: 'Gradient: switch between linear and radial',
    category: 'Draw',
    description: 'A linear gradient runs along the line you drag. A radial one spreads out from where you press.',
    help: 'pixel-gradient',
    keywords: ['gradient', 'radial', 'linear', 'circle', 'pixel'],
    checked: () => getPixelSettings().gradientShape === 'radial',
    run: () => setPixelSettings({ gradientShape: getPixelSettings().gradientShape === 'radial' ? 'linear' : 'radial' }),
  },
]);
