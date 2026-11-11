// Text and particles as small pieces with a matrix each, for formats that can't draw them the canvas way (Lottie).
// A letter is its traced outline (made once per letter, font and size); a particle is its sprite at a set size.
import type { Mat } from '../core/symbols';
import { mul } from '../core/symbols';
import type { ParticlesShape, SubPath, TextShape } from '../core/format';
import type { PosedInstance } from '../core/symbols';
import { glyphLooks, isAnimatedText, cssFont } from '../text/model';
import { isPosedText, textLayout, textMatrix } from '../text/draw';
import { textOutlines } from '../text/convert';
import { isPosedParticles, posedParticles } from '../particles/draw';
import type { Particle } from '../particles/model';

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

/** The size particle sprites are drawn at before scaling, so rounded points stay accurate. */
export const SPRITE_UNIT = 10;

export interface ParticleSprite {
  key: number;
  p: Particle;
  /** Sprite space (SPRITE_UNIT across, centred on 0,0) to stage. Streaks don't use it. */
  m: Mat;
  alpha: number;
  /** Symbol sprites: the posed symbol copy to show (its matrix already in `m`). */
  sprite?: PosedInstance;
  /** Which frame of its symbol that is. */
  inner?: number;
}

/** The particles of a posed emitter, each with its matrix, in drawing order. */
export function particleSprites(s: ParticlesShape): ParticleSprite[] {
  const list = posedParticles(s);
  const posed = isPosedParticles(s) ? s : null;
  const sprites = s.sprite === 'symbol' ? posed?.posedSprites : undefined;
  const fps = posed?.posedFps ?? 24;
  return list.map((p) => {
    let alpha = Math.min(1, p.alpha * s.opacity);
    if (alpha <= 0.003 || p.size <= 0.01) alpha = 0;
    const r = (p.rotation * Math.PI) / 180;
    const base: Mat = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), p.x, p.y];
    if (sprites && sprites.length) {
      const k = p.size / Math.max(1, posed!.posedSpriteSize ?? 1);
      const inner = Math.floor(p.age * fps) % sprites.length;
      const sp = sprites[inner];
      return { key: p.key, p, alpha, m: mul(mul(base, [k, 0, 0, k, 0, 0]), sp.posed.matrix), sprite: sp, inner };
    }
    let k = p.size / SPRITE_UNIT;
    let ky = k;
    if (s.sprite === 'confetti') ky = k * (Math.cos((p.rotation * Math.PI) / 90) || 0.001);
    if (k === 0) k = 1e-4;
    return { key: p.key, p, alpha, m: mul(base, [k, 0, 0, ky, 0, 0]) };
  });
}
