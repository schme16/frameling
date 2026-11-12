// Letters as small pieces with a matrix each, for formats that can't draw text the canvas way (Lottie). A letter is its
// traced outline, made once per letter, font and size.
import { mul, type Mat } from '../core/symbols';
import type { SubPath, TextShape } from '../core/format';
import { glyphLooks, isAnimatedText, cssFont } from './model';
import { isPosedText, textLayout, textMatrix } from './draw';
import { textOutlines } from './convert';

const glyphCache = new Map<string, SubPath[]>();

/** Can letters be traced here (the app and real browsers can; plain Node tests can't). */
export function canTraceText(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

/** One letter's outline with its left edge and baseline at 0,0. */
export function glyphOutline(s: TextShape, ch: string): SubPath[] {
  const key = `${cssFont(s, s.size)}|${ch}`;
  let p = glyphCache.get(key);
  if (!p) {
    const one: TextShape = { ...s, text: ch, align: 'left', letterSpacing: 0, animators: undefined, opacity: 1, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } };
    p = textOutlines(one);
    if (glyphCache.size > 2000) glyphCache.clear();
    glyphCache.set(key, p);
  }
  return p;
}

export interface GlyphSprite {
  ch: string;
  paths: SubPath[];
  /** Letter space to stage. */
  m: Mat;
  /** 0 when hidden on this frame. */
  alpha: number;
}

/** Every letter of a text shape (spaces left out) as it is on its posed frame. */
export function glyphSprites(s: TextShape): GlyphSprite[] {
  const layout = textLayout(s);
  const tm = textMatrix(s);
  const animated = isAnimatedText(s);
  const looks = animated ? glyphLooks(s, layout, isPosedText(s) ? s.posedFrame : 0) : null;
  const out: GlyphSprite[] = [];
  layout.glyphs.forEach((gl, i) => {
    if (gl.letter < 0) return;
    let m: Mat = mul(tm, [1, 0, 0, 1, gl.x, gl.y]);
    let alpha = s.opacity;
    if (looks) {
      const { look, cx, cy } = looks[i];
      const r = (look.rotation * Math.PI) / 180;
      const c = Math.cos(r) * look.scale;
      const sn = Math.sin(r) * look.scale;
      m = mul(tm, mul([c, sn, -sn, c, cx + look.dx, cy + look.dy], [1, 0, 0, 1, gl.x - cx, gl.y - cy]));
      alpha = s.opacity * look.opacity;
      if (alpha <= 0.001 || look.scale === 0) alpha = 0;
    }
    out.push({ ch: gl.ch, paths: glyphOutline(s, gl.ch), m, alpha: Math.min(1, alpha) });
  });
  return out;
}
