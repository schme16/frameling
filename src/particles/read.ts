// Reading an emitter back from a file, checked: missing or wrong values take sensible defaults.
import type { ParticleSprite, ParticlesShape } from '../core/format';
import { clamp, color, isObj, num, readOrigin, readTransform } from '../io/shapes-extra';
import { PARTICLE_PRESETS, SPRITES } from './model';

export function readParticlesShape(s: any): ParticlesShape | null {
  if (!isObj(s) || typeof s.id !== 'string') return null;
  const d = (PARTICLE_PRESETS.find((p) => p.id === s.preset) ?? PARTICLE_PRESETS[0]).values;
  const sprite: ParticleSprite = SPRITES.some((x) => x.value === s.sprite) ? s.sprite : d.sprite;
  return {
    id: s.id,
    ...readOrigin(s),
    ...(typeof s.group === 'string' ? { group: s.group } : {}),
    type: 'particles',
    transform: readTransform(s.transform),
    emitter: s.emitter === 'line' || s.emitter === 'area' ? s.emitter : 'point',
    width: clamp(s.width, d.width, 0, 100000),
    height: clamp(s.height, d.height, 0, 100000),
    rate: clamp(s.rate, d.rate, 0, 5000),
    burst: Math.round(clamp(s.burst, d.burst, 0, 20000)),
    emitFor: clamp(s.emitFor, 0, 0, 100000),
    ...(s.prewarm === true ? { prewarm: true } : {}),
    life: clamp(s.life, d.life, 0.02, 600),
    variance: clamp(s.variance, d.variance, 0, 1),
    speed: clamp(s.speed, d.speed, 0, 100000),
    direction: num(s.direction, d.direction),
    spread: clamp(s.spread, d.spread, 0, 180),
    gravity: clamp(s.gravity, d.gravity, -100000, 100000),
    wind: clamp(s.wind, d.wind, -100000, 100000),
    drag: clamp(s.drag, d.drag, 0, 50),
    ...(typeof s.wobble === 'number' && Number.isFinite(s.wobble) && s.wobble > 0 ? { wobble: Math.min(10000, s.wobble) } : {}),
    sizeStart: clamp(s.sizeStart, d.sizeStart, 0, 10000),
    sizeEnd: clamp(s.sizeEnd, d.sizeEnd, 0, 10000),
    colorStart: color(s.colorStart, d.colorStart),
    colorEnd: color(s.colorEnd, d.colorEnd),
    ...(s.colorBy === 'random' ? { colorBy: 'random' as const } : {}),
    opacityStart: clamp(s.opacityStart, d.opacityStart, 0, 1),
    opacityEnd: clamp(s.opacityEnd, d.opacityEnd, 0, 1),
    spin: clamp(s.spin, d.spin, -100000, 100000),
    sprite,
    ...(typeof s.symbolId === 'string' ? { symbolId: s.symbolId } : {}),
    seed: Math.round(num(s.seed, 1)),
    ...(typeof s.max === 'number' && Number.isFinite(s.max) ? { max: Math.max(1, Math.min(20000, Math.round(s.max))) } : {}),
    opacity: clamp(s.opacity, 1, 0, 1),
    ...(typeof s.preset === 'string' ? { preset: s.preset.slice(0, 40) } : {}),
  };
}
