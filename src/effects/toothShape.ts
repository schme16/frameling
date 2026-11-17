/**
 * Paper tooth on one brush line. The line stays its points; when it is drawn, the dabs the pen laid along it meet the
 * paper (see dry/tooth.ts), and the picture that comes out is kept, so a held drawing, a scrub or a pan costs nothing
 * after the first draw. The picture is only as big as the line, not the whole canvas, so a drawing with hundreds of
 * chalk and charcoal lines stays quick. Everything the paper does is worked in canvas pixels with the page's own offset
 * kept, so the paper sits still against the page whatever the zoom or pan.
 */
import type { StrokeShape } from '../core/format';
import { parseHex } from '../canvas/colors';
import { strokeDabs, toothParams, toothStroke, type ToothPicture, type View, type WidthLaw } from '../dry/tooth';
import { trimActive, trimStrokePoints } from '../geometry/trim';
import { ctx2, makeCanvas, type Canvas2, type Ctx } from './apply';
import { EffectCache, paintThroughEffects } from './composite';
import { mayBuild } from '../core/slice';

type Values = Record<string, number | string>;
type Fx = { kind: string; v: Values };

/** A line's width law and the points that show (a trim hides some, and where it cuts the end is a round tip, not a taper). */
export function lineFor(s: StrokeShape): { points: StrokeShape['points']; law: WidthLaw } | null {
  const b = s.brush;
  let points = s.points;
  let taperStart = b.taperStart;
  let taperEnd = b.taperEnd;
  if (trimActive(s.trim)) {
    const cut = trimStrokePoints(s.points, s.trim);
    if (!cut) return null;
    points = cut.points;
    if (cut.cutStart) taperStart = 0;
    if (cut.cutEnd) taperEnd = 0;
  }
  const simulate = !s.realPressure && s.points.every((p) => p.p === 0.5);
  return { points, law: { size: b.size, thinning: b.thinning, streamline: b.streamline, simulate, taperStart, taperEnd } };
}

/** The picture of a line's pigment on a canvas, in the canvas's own pixels. Null when nothing shows. */
export function toothPicture(s: StrokeShape, v: Values, m: View, clip?: { w: number; h: number }): ToothPicture | null {
  const line = lineFor(s);
  if (!line) return null;
  const p = toothParams(v);
  const rgb = parseHex(s.color) ?? [0, 0, 0, 255];
  const dabs = strokeDabs(line.points, line.law, p.press, m);
  return toothStroke(dabs, p, [rgb[0], rgb[1], rgb[2]], s.opacity * (rgb[3] / 255), m, clip);
}

function toCanvas(pic: ToothPicture): Canvas2 {
  const c = makeCanvas(pic.w, pic.h);
  const img = ctx2(c).createImageData(pic.w, pic.h);
  img.data.set(pic.data);
  ctx2(c).putImageData(img, 0, 0);
  return c;
}

// Finished pictures by line, with where each sits (an integer offset on the canvas), so panning reuses them.
const cache = new EffectCache(48_000_000);
const spots = new WeakMap<object, { x: number; y: number; none: boolean }>();

/** Pictures built and reused, for tests. */
export function toothStats(): { built: number; reused: number } {
  return { built: cache.builds, reused: cache.hits };
}

/** Pictures forgotten, so the next draw works them out again (tests and measuring). */
export function clearToothCache(): void {
  cache.clear();
}

const BIG = 6_000_000;

/** A box round the line's points, padded by the brush size, in document pixels. A guess (it ignores a trim), good enough to say whether the line is huge or off the canvas. */
function boxOf(s: StrokeShape): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of s.points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const pad = s.brush.size + 2;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

const boxArea = (s: StrokeShape, k: number): number => {
  const b = boxOf(s);
  return (b.x1 - b.x0) * k * ((b.y1 - b.y0) * k);
};

/** True when the line is wholly off the canvas, so nothing needs working out for it (a zoomed in view only pays for what shows). */
function offCanvas(s: StrokeShape, m: View, w: number, h: number): boolean {
  const b = boxOf(s);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
    const cx = x * m.a + y * m.c + m.e;
    const cy = x * m.b + y * m.d + m.f;
    x0 = Math.min(x0, cx);
    y0 = Math.min(y0, cy);
    x1 = Math.max(x1, cx);
    y1 = Math.max(y1, cy);
  }
  return x1 < 0 || y1 < 0 || x0 > w || y0 > h;
}

/**
 * Draws a brush line whose first effect is paper tooth. `rest` are the line's other effects (a shadow, say), which then run
 * on the toothed picture. With none, the picture is the line's own small box and is kept; with some it is drawn on a
 * canvas-sized layer for them to work on.
 */
export function drawToothStroke(g: Ctx, s: StrokeShape, v: Values, rest: Fx[], stage: { w: number; h: number } | undefined, sig: string): void {
  const raw = g.getTransform();
  const m: View = typeof raw.a === 'number' ? { a: raw.a, b: raw.b, c: raw.c, d: raw.d, e: raw.e, f: raw.f } : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const target = g.canvas as { width: number; height: number };
  const w = Math.max(1, target.width);
  const h = Math.max(1, target.height);
  if (!rest.length && offCanvas(s, m, w, h)) return;
  if (rest.length) {
    paintThroughEffects(g, rest as never, stage, s, `tooth|${JSON.stringify(v)}|${sig}`, (lg) => {
      const pic = toothPicture(s, v, m, { w, h });
      if (!pic) return;
      lg.save();
      lg.setTransform(1, 0, 0, 1, 0, 0);
      lg.drawImage(toCanvas(pic), pic.x, pic.y);
      lg.restore();
    });
    return;
  }
  const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  // A huge zoom would make a huge picture: then only what shows is drawn, and it is kept per view.
  const big = boxArea(s, k) > BIG;
  // Moving the page a whole number of canvas pixels moves the picture and changes nothing in it, so only the part of the
  // offset under a pixel is part of the picture. The paper stays where it is on the page.
  const ix = big ? 0 : Math.round(m.e);
  const iy = big ? 0 : Math.round(m.f);
  const local: View = { ...m, e: m.e - ix, f: m.f - iy };
  const key = `${local.a},${local.b},${local.c},${local.d},${local.e.toFixed(2)},${local.f.toFixed(2)}|${big ? `${w}x${h}` : ''}|${JSON.stringify(v)}|${sig}`;
  let pic = cache.get(s, key);
  if (!pic) {
    // A sliced redraw (src/core/slice.ts) that has spent its time leaves this line for the next one.
    if (!mayBuild()) return;
    // Big: the part of the canvas that shows. Otherwise the whole line, however far off the canvas it runs, so panning to it reuses this.
    const made = toothPicture(s, v, local, big ? { w, h } : undefined);
    if (!made) {
      pic = makeCanvas(1, 1);
      spots.set(pic, { x: 0, y: 0, none: true });
    } else {
      pic = toCanvas(made);
      spots.set(pic, { x: made.x, y: made.y, none: false });
    }
    cache.set(s, key, pic);
  }
  const at = spots.get(pic);
  if (!at || at.none) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(pic as CanvasImageSource, at.x + ix, at.y + iy);
  g.restore();
}
