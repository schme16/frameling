// How text goes into the export formats that do not draw it the canvas way. It registers with the text kind (see kind.ts)
// and is loaded the first time an export needs it.
import type { TextShape } from '../core/format';
import type { LookItem, LottieKit } from '../export/lottie';
import type { ShapeExport } from '../export/shapeExport';
import { esc, n2, svgColor } from '../export/svg-extra';
import { textOutlines } from './convert';
import { isPosedText, textLayout, textMatrix } from './draw';
import { fontFamilyCss, glyphLooks, isAnimatedText } from './model';
import { canTraceText, glyphSprites } from './sprites';

/** Text stays text in SVG, so it can be edited afterwards. */
export function textToSvg(s: TextShape): string {
  if (!s.text || s.opacity <= 0) return '';
  const l = textLayout(s);
  const m = textMatrix(s);
  const c = svgColor(s.color);
  const fam = esc(fontFamilyCss(s.font).replace(/"/g, "'"));
  const attrs = `font-family="${fam}" font-size="${n2(s.size)}" font-weight="${Math.round(s.weight)}"${s.italic ? ' font-style="italic"' : ''} fill="${c.fill}"`;
  const parts: string[] = [];
  if (!isAnimatedText(s)) {
    const ls = s.letterSpacing ? ` letter-spacing="${n2(s.letterSpacing)}"` : '';
    for (const line of l.lines) if (line.text) parts.push(`<text x="${n2(line.x)}" y="${n2(line.y)}"${ls} xml:space="preserve">${esc(line.text)}</text>`);
  } else {
    const looks = glyphLooks(s, l, isPosedText(s) ? s.posedFrame : 0);
    l.glyphs.forEach((gl, i) => {
      if (gl.letter < 0) return;
      const { look, cx, cy } = looks[i];
      if (look.opacity <= 0.001 || look.scale === 0) return;
      const tf = look.dx || look.dy || look.rotation || look.scale !== 1 ? ` transform="translate(${n2(cx + look.dx)} ${n2(cy + look.dy)}) rotate(${n2(look.rotation)}) scale(${n2(look.scale)}) translate(${n2(-cx)} ${n2(-cy)})"` : '';
      parts.push(`<text x="${n2(gl.x)}" y="${n2(gl.y)}"${look.opacity < 1 ? ` opacity="${n2(look.opacity)}"` : ''}${tf}>${esc(gl.ch)}</text>`);
    });
  }
  if (!parts.length) return '';
  const op = s.opacity * c.alpha;
  return `<g transform="matrix(${m.map(n2).join(' ')})" ${attrs}${op < 1 ? ` opacity="${n2(op)}"` : ''}>${parts.join('')}</g>`;
}

/** Every letter becomes a small outline with its own motion, the same number on each frame (a letter that is hidden on a frame fades out there). */
function textToLottie(kit: LottieKit, frames: TextShape[]): ReturnType<NonNullable<ShapeExport<TextShape>['lottie']>> {
  if (!canTraceText()) {
    kit.note('Text was left out (it needs the app to trace the letters).');
    return frames.map(() => []);
  }
  const per = frames.map((t) => glyphSprites(t));
  const most = Math.max(...per.map((g) => g.length));
  const items: LookItem[][] = [];
  for (let g = 0; g < most; g++) {
    const col = per.map((gs, f): LookItem | null => {
      const gl = gs[g];
      if (!gl) return null;
      const t = frames[f];
      const c = kit.tinted(t.color, kit.tints);
      return { type: 'look', look: { paths: gl.paths.map(kit.lottiePath), fill: { rgb: c.rgb, o: kit.r3(c.alpha * 100) }, stroke: null, tr: kit.trOf(gl.m, gl.alpha) } };
    });
    const full = kit.fillGaps(col, kit.hideLook);
    if (full) items.push(full);
  }
  return frames.map((_, f) => items.map((c) => c[f]));
}

export const textExport: ShapeExport<TextShape> = {
  svg: textToSvg,
  // Letters become outlines, filled in the text's colour.
  pdf(cx, _ctx, s) {
    const paths = textOutlines(s);
    if (!paths.length) return;
    cx.push('q');
    if (cx.fillColor(s.color, s.opacity)) {
      cx.subPaths(paths);
      cx.push('f*');
    }
    cx.push('Q');
  },
  lottie: textToLottie,
};
