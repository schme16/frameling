// Draws text shapes with the canvas, for the single renderer. Layouts are cached by everything that changes them.
import type { TextShape } from '../core/format';
import { transformMatrix, type Mat } from '../core/symbols';
import { cssFont, estimateMeasure, glyphLooks, isAnimatedText, layoutText, type Measure, type TextLayout } from './model';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let measureCtx: Ctx2D | null | undefined;
const widthCache = new Map<string, number>();

/** Measures with a real canvas when there is one (the app), or estimates (tests). */
export const canvasMeasure: Measure = (text, font) => {
  if (!text) return 0;
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4).getContext('2d') : (document.createElement('canvas').getContext('2d') as Ctx2D | null);
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return estimateMeasure(text, font);
  const key = `${font}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    measureCtx.font = font;
    w = measureCtx.measureText(text).width;
    if (widthCache.size > 5000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
};

/** Forget measured widths (a font finished loading, so text measured with the fallback is wrong now). */
export function forgetTextMeasures(): void {
  widthCache.clear();
  layoutCache.clear();
}

const layoutCache = new Map<string, TextLayout>();

/** The layout of a text shape, cached by what it depends on (not the shape object, since posed copies differ). */
export function textLayout(s: TextShape): TextLayout {
  const key = `${s.text}\u0000${s.font}|${s.size}|${s.weight}|${s.italic ? 1 : 0}|${s.align}|${s.lineHeight ?? ''}|${s.letterSpacing ?? 0}`;
  let l = layoutCache.get(key);
  if (!l) {
    l = layoutText(s, canvasMeasure);
    if (layoutCache.size > 400) layoutCache.delete(layoutCache.keys().next().value!);
    layoutCache.set(key, l);
  }
  return l;
}

export function textMatrix(s: TextShape): Mat {
  return transformMatrix(s.transform, { x: 0, y: 0 });
}

/** A text shape posed at a frame (frames since its key began). Runtime only. */
export interface PosedText extends TextShape {
  posedFrame: number;
}

export function isPosedText(s: TextShape): s is PosedText {
  return 'posedFrame' in s;
}

/** Draws a text shape. Animated text needs its frame (`posedFrame`, from poseAt); without one it shows frame 0. */
export function drawText(g: Ctx2D, s: TextShape): void {
  if (!s.text || s.opacity <= 0) return;
  const layout = textLayout(s);
  const m = textMatrix(s);
  g.save();
  g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  g.font = cssFont(s, s.size);
  g.fillStyle = s.color;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  if (!isAnimatedText(s)) {
    g.globalAlpha = s.opacity;
    const spacing = s.letterSpacing ?? 0;
    if (spacing === 0) {
      for (const l of layout.lines) if (l.text) g.fillText(l.text, l.x, l.y);
    } else {
      for (const gl of layout.glyphs) if (gl.letter >= 0) g.fillText(gl.ch, gl.x, gl.y);
    }
  } else {
    const frame = isPosedText(s) ? s.posedFrame : 0;
    const looks = glyphLooks(s, layout, frame);
    layout.glyphs.forEach((gl, i) => {
      if (gl.letter < 0) return;
      const { look, cx, cy } = looks[i];
      const a = s.opacity * look.opacity;
      if (a <= 0.001 || look.scale === 0) return;
      g.globalAlpha = Math.min(1, a);
      if (look.dx === 0 && look.dy === 0 && look.scale === 1 && look.rotation === 0) {
        g.fillText(gl.ch, gl.x, gl.y);
        return;
      }
      g.save();
      g.translate(cx + look.dx, cy + look.dy);
      if (look.rotation) g.rotate((look.rotation * Math.PI) / 180);
      if (look.scale !== 1) g.scale(look.scale, look.scale);
      g.fillText(gl.ch, gl.x - cx, gl.y - cy);
      g.restore();
    });
  }
  g.restore();
  g.globalAlpha = 1;
}

/** The text's box on the stage. */
export function textBounds(s: TextShape): { x: number; y: number; w: number; h: number } {
  const b = textLayout(s).box;
  const m = textMatrix(s);
  const pts = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Is a stage point on the text's box? */
export function hitText(s: TextShape, x: number, y: number, tol: number): boolean {
  const m = textMatrix(s);
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return false;
  const dx = x - m[4];
  const dy = y - m[5];
  const lx = (m[3] * dx - m[2] * dy) / det;
  const ly = (-m[1] * dx + m[0] * dy) / det;
  const b = textLayout(s).box;
  const k = Math.max(1e-6, Math.min(Math.abs(s.transform.scaleX), Math.abs(s.transform.scaleY)));
  const t = tol / k;
  return lx >= b.x - t && lx <= b.x + b.w + t && ly >= b.y - t && ly <= b.y + b.h + t;
}
