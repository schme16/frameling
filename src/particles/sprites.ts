// Particles as small pieces with a matrix each, for formats that can't draw them the canvas way (Lottie, SVG with
// symbol sprites). A particle is its sprite at a set size.
import { mul, type Mat, type PosedInstance } from '../core/symbols';
import type { ParticlesShape } from '../core/format';
import { isPosedParticles, posedParticles } from './draw';
import type { Particle } from './model';

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
