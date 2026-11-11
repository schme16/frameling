/**
 * Gradient [F]: sets where a shape's gradient starts and ends, right on the canvas. Drag across a shape to lay its
 * gradient along the drag; drag the round ends to adjust it. On a radial gradient the start is the middle and the end
 * sets the size. Shift keeps the direction to 45 degree steps. A shape without a gradient takes the one in the colour
 * box in front (pick Linear or Radial in the Colours panel).
 */
import type { FillShape, Gradient, Id, PathShape, Shape } from '../core/format';
import { placeGradient } from '../core/gradient';
import { registerHelp, registerTool, type Tool, type ToolContext } from '../core/registry';
import { store } from '../core/store';
import { topShapeAt } from '../canvas/geometry';
import { pathsBounds } from '../geometry/hit';
import type { P } from '../geometry/pen';
import { activeDrawing, editActiveDrawing } from './edit';
import { canEdit } from './util';
import { constrain45 } from './pen';
import { drawPoint, GRAB_PX, ink } from './point-handles';
import { wellGradient } from './gradient-wells';
import { GradientToolOptions } from './options/GradientToolOptions';

type Which = 'fill' | 'stroke';
type Painted = FillShape | PathShape;

/** The gradient a shape has on one side, if any. */
export function gradientOf(s: Shape, which: Which): Gradient | undefined {
  if (s.type === 'fill') return which === 'fill' ? s.gradient : undefined;
  if (s.type === 'path') return which === 'fill' ? s.fillGradient : s.strokeGradient;
  return undefined;
}

/** Which side the tool works on: the box in front, falling back to whichever side has a gradient. */
function sideFor(s: Shape): Which {
  const front = store().get().ui.activeWell;
  if (gradientOf(s, front)) return front;
  const other: Which = front === 'fill' ? 'stroke' : 'fill';
  return gradientOf(s, other) ? other : front;
}

let targetId: Id | null = null;
let drag: { mode: 'from' | 'to' | 'new'; start: P; key: string; which: Which } | null = null;
let n = 0;

function target(): Painted | null {
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return null;
  const byId = targetId ? d.shapes.find((s) => s.id === targetId) : undefined;
  if (byId && (byId.type === 'fill' || byId.type === 'path')) return byId;
  const sel = new Set(store().get().ui.selection);
  return (d.shapes.find((s) => sel.has(s.id) && (s.type === 'fill' || s.type === 'path') && (gradientOf(s, 'fill') || gradientOf(s, 'stroke'))) as Painted | undefined) ?? null;
}

function write(id: Id, which: Which, g: Gradient, key: string): void {
  editActiveDrawing(
    'Change gradient direction',
    'vector',
    (d) => {
      const s = d.shapes.find((x) => x.id === id);
      if (!s) return;
      if (s.type === 'fill') s.gradient = g;
      else if (s.type === 'path') {
        if (which === 'fill') s.fillGradient = g;
        else s.strokeGradient = g;
      }
    },
    { coalesce: key },
  );
}

export const gradientTool: Tool = {
  id: 'gradient',
  label: 'Gradient',
  icon: 'gradient',
  key: 'f',
  layers: ['vector'],
  order: 72,
  help: 'tool-gradient',
  cursor: 'crosshair',
  options: GradientToolOptions,
  down(e, ctx: ToolContext) {
    if (!canEdit(ctx, 'vector', 'The gradient tool')) return;
    const key = `gradient-tool-${++n}`;
    const t = target();
    const tol = GRAB_PX / ctx.zoom;
    if (t) {
      const which = sideFor(t);
      const g = gradientOf(t, which);
      if (g && Math.hypot(e.x - g.to.x, e.y - g.to.y) <= tol) return void (drag = { mode: 'to', start: e, key, which });
      if (g && Math.hypot(e.x - g.from.x, e.y - g.from.y) <= tol) return void (drag = { mode: 'from', start: e, key, which });
    }
    const d = activeDrawing();
    const under = d && d.kind === 'vector' ? topShapeAt(d.shapes, e.x, e.y, 4 / ctx.zoom) : undefined;
    if (!under || (under.type !== 'fill' && under.type !== 'path')) {
      targetId = null;
      if (under) ctx.hint('The gradient tool works on shapes, pen lines and paint.');
      ctx.requestOverlay();
      return;
    }
    targetId = under.id;
    store().setUi({ selection: [under.id] });
    const which = sideFor(under);
    if (!gradientOf(under, which)) {
      const style = wellGradient(which);
      const b = pathsBounds(under.paths);
      if (!style || !b) {
        ctx.hint(`This shape's ${which} is a plain colour. Pick Linear or Radial in the Colours panel to give it a gradient.`);
        ctx.requestOverlay();
        return;
      }
      write(under.id, which, placeGradient(style, b), key);
    }
    drag = { mode: 'new', start: { x: e.x, y: e.y }, key, which };
    ctx.requestOverlay();
  },
  move(e, ctx) {
    const t = target();
    if (!drag || !t) return;
    const g = gradientOf(t, drag.which);
    if (!g) return;
    let next: Gradient;
    if (drag.mode === 'new') {
      // A tiny drag is just a click on the shape: leave the gradient as it was.
      if (Math.hypot(e.x - drag.start.x, e.y - drag.start.y) * ctx.zoom < 4) return;
      next = { ...g, from: { ...drag.start }, to: e.shift ? constrain45(drag.start, e) : { x: e.x, y: e.y } };
    } else if (drag.mode === 'to') next = { ...g, to: e.shift ? constrain45(g.from, e) : { x: e.x, y: e.y } };
    else {
      // Moving the start carries the end along on a radial gradient (it's the middle); on a linear one only the start moves.
      const dx = e.x - g.from.x;
      const dy = e.y - g.from.y;
      next = g.kind === 'radial' ? { ...g, from: { x: e.x, y: e.y }, to: { x: g.to.x + dx, y: g.to.y + dy } } : { ...g, from: e.shift ? constrain45(g.to, e) : { x: e.x, y: e.y } };
    }
    write(t.id, drag.which, next, drag.key);
    ctx.requestOverlay();
  },
  up(_e, ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  cancel(ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  leave() {
    targetId = null;
    drag = null;
  },
  overlay(gx, ctx) {
    const t = target();
    if (!t) return;
    const g = gradientOf(t, drag?.which ?? sideFor(t));
    if (!g) return;
    const z = ctx.zoom;
    gx.save();
    gx.lineWidth = 3 / z;
    gx.strokeStyle = 'rgb(255 255 255 / 0.8)';
    const line = () => {
      gx.beginPath();
      if (g.kind === 'radial') gx.arc(g.from.x, g.from.y, Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y), 0, Math.PI * 2);
      gx.moveTo(g.from.x, g.from.y);
      gx.lineTo(g.to.x, g.to.y);
    };
    line();
    gx.stroke();
    gx.lineWidth = 1.25 / z;
    gx.strokeStyle = ink();
    line();
    gx.stroke();
    gx.restore();
    // The start is a square, the end a filled square, so the direction reads at a glance.
    drawPoint(gx, g.from, z, { big: true });
    drawPoint(gx, g.to, z, { on: true, big: true });
  },
};

registerTool(gradientTool);

registerHelp({
  id: 'tool-gradient',
  title: 'Gradients',
  section: 'Drawing',
  order: 5,
  media: 'gradients.png',
  summary: 'Colours that blend into each other, along a line (linear) or out from the middle (radial), for fills and outlines.',
  keywords: ['gradient', 'blend', 'fade', 'linear', 'radial', 'ramp', 'shading', 'gradient tool'],
  body: `A gradient is two or more colours blending smoothly into each other.

## Giving a shape a gradient

1. In the **Colours** panel, click the fill or stroke box, then pick **Linear** (colours blend along a straight line) or **Radial** (colours blend out from the middle in a circle).
2. A bar shows the colours. Click a marker under it and pick its colour above, with the picker or a swatch.
3. Draw a shape, or select shapes first with the Select tool (**V**) to change them.

The paint bucket pours the fill box's gradient too.

## Changing the colours

- **Click the bar** to add a colour there.
- **Drag a marker** along the bar to move it. Drag it down off the bar to take it away (a gradient keeps at least two).
- **Reverse** turns the colours round.
- **Direction** turns a linear gradient.

## Setting the direction on the canvas

Pick the **Gradient** tool (**F**), then drag across a shape: the gradient runs from where you press to where you let go. Drag the two square ends to fine-tune it. On a radial gradient the first square is the middle and the second sets how far it reaches. Hold **Shift** to keep to 45 degree steps.

Gradients come along when you export to SVG, PDF and Lottie, and of course in videos, GIFs and sprite sheets.`,
});
