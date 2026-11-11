// Reading text and particle shapes back from a file, checked: missing or wrong values take sensible defaults.
import type { ParticleSprite, ParticlesShape, TextAnimator, TextShape, Transform2D } from '../core/format';
import { isEasing } from '../core/ease';
import { TEXT_ANIMS } from '../text/model';
import { PARTICLE_PRESETS, SPRITES } from '../particles/model';

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: unknown, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, num(v, d)));
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);

function readTransform(t: unknown): Transform2D {
  const o = isObj(t) ? t : {};
  return { x: num(o.x, 0), y: num(o.y, 0), scaleX: num(o.scaleX, 1), scaleY: num(o.scaleY, 1), rotation: num(o.rotation, 0), skew: num(o.skew, 0) };
}

function readAnimator(a: any): TextAnimator | null {
  if (!isObj(a) || typeof a.id !== 'string' || !TEXT_ANIMS.some((x) => x.kind === a.kind)) return null;
  const out: TextAnimator = {
    id: a.id,
    kind: a.kind,
    by: a.by === 'word' || a.by === 'line' ? a.by : 'letter',
    start: Math.round(clamp(a.start, 0, -100000, 100000)),
    duration: Math.max(1, Math.round(clamp(a.duration, 10, 1, 100000))),
    stagger: clamp(a.stagger, 2, 0, 10000),
    amount: clamp(a.amount, 0, -100000, 100000),
  };
  if (a.direction === 'out') out.direction = 'out';
  if (a.order === 'backward' || a.order === 'middle' || a.order === 'random') out.order = a.order;
  if (typeof a.angle === 'number' && Number.isFinite(a.angle)) out.angle = a.angle;
  if (isEasing(a.ease)) out.ease = a.ease;
  if (typeof a.seed === 'number' && Number.isFinite(a.seed)) out.seed = a.seed;
  if (a.on === false) out.on = false;
  return out;
}

export function readTextShape(s: any): TextShape | null {
  if (!isObj(s) || typeof s.id !== 'string' || typeof s.text !== 'string') return null;
  const animators = Array.isArray(s.animators) ? s.animators.map(readAnimator).filter((a: TextAnimator | null): a is TextAnimator => !!a) : [];
  return {
    id: s.id,
    ...(typeof s.group === 'string' ? { group: s.group } : {}),
    type: 'text',
    text: s.text.slice(0, 20000),
    font: typeof s.font === 'string' && s.font.trim() ? s.font.slice(0, 120) : 'Nunito',
    size: clamp(s.size, 48, 0.5, 5000),
    weight: Math.round(clamp(s.weight, 400, 100, 900)),
    ...(s.italic === true ? { italic: true } : {}),
    color: color(s.color, '#000000'),
    align: s.align === 'center' || s.align === 'right' ? s.align : 'left',
    lineHeight: clamp(s.lineHeight, 1.2, 0.3, 10),
    letterSpacing: clamp(s.letterSpacing, 0, -500, 5000),
    opacity: clamp(s.opacity, 1, 0, 1),
    transform: readTransform(s.transform),
    ...(animators.length ? { animators } : {}),
  };
}

export function readParticlesShape(s: any): ParticlesShape | null {
  if (!isObj(s) || typeof s.id !== 'string') return null;
  const d = (PARTICLE_PRESETS.find((p) => p.id === s.preset) ?? PARTICLE_PRESETS[0]).values;
  const sprite: ParticleSprite = SPRITES.some((x) => x.value === s.sprite) ? s.sprite : d.sprite;
  return {
    id: s.id,
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
