/**
 * Particles: presets and the maths. Pure, no canvas.
 *
 * Nothing is simulated step by step. Every particle's birth time and random traits come from the seed and its number,
 * and where it is at any moment comes from a closed formula (speed, gravity, wind and drag), so frame 200 costs the
 * same as frame 1, scrubbing backwards is free, and every export matches the canvas exactly.
 */
import type { Color, ParticleSprite, ParticlesShape, Transform2D } from '../core/format';

export interface Particle {
  /** Stage position. */
  x: number;
  y: number;
  /** Velocity, stage pixels per second (streaks point along it). */
  vx: number;
  vy: number;
  /** Diameter, stage pixels. */
  size: number;
  /** Degrees. */
  rotation: number;
  color: Color;
  /** 0 to 1. */
  alpha: number;
  /** Seconds since it was born. */
  age: number;
  /** Stays the same for a particle through its life (for symbol frames and colour picks). */
  key: number;
}

export const DEFAULT_MAX = 2000;
/** Never more than this alive at once, whatever the settings say. */
export const HARD_MAX = 20000;

// ---------------------------------------------------------------- randomness

/** A stable 0..1 number for (seed, particle, trait). Same inputs, same number, on every computer. */
export function rand(seed: number, n: number, trait: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n | 0, 0xc2b2ae35) ^ Math.imul(trait + 1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- colours

function parseHex(c: string): [number, number, number, number] {
  const h = c.replace('#', '');
  const full = h.length === 3 || h.length === 4 ? [...h].map((x) => x + x).join('') : h;
  const v = (i: number) => parseInt(full.slice(i, i + 2), 16);
  const r = v(0);
  const g = v(2);
  const b = v(4);
  const a = full.length >= 8 ? v(6) / 255 : 1;
  return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0, Number.isFinite(a) ? a : 1];
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

/** Mixes two hex colours, t = 0 is `a`. Alpha in `a` or `b` comes out in the result's alpha. */
export function mixHex(a: Color, b: Color, t: number): Color {
  if (a === b || t <= 0) return a;
  if (t >= 1) return b;
  const x = parseHex(a);
  const y = parseHex(b);
  const al = x[3] + (y[3] - x[3]) * t;
  return `#${hex2(x[0] + (y[0] - x[0]) * t)}${hex2(x[1] + (y[1] - x[1]) * t)}${hex2(x[2] + (y[2] - x[2]) * t)}${al < 1 ? hex2(al * 255) : ''}`;
}

// ---------------------------------------------------------------- the emitter

/** The emitter's matrix (its space, centred on 0,0, to the stage). */
export function emitterMatrix(t: Transform2D): [number, number, number, number, number, number] {
  const r = (t.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const k = Math.tan((t.skew * Math.PI) / 180);
  return [c * t.scaleX, s * t.scaleX, (c * k - s) * t.scaleY, (s * k + c) * t.scaleY, t.x, t.y];
}

const vary = (v: number, variance: number, r: number) => v * (1 + Math.max(0, Math.min(1, variance)) * (2 * r - 1));

/** The longest any particle lives, seconds. */
export function maxLife(s: ParticlesShape): number {
  return Math.max(0.01, s.life * (1 + Math.max(0, Math.min(1, s.variance))));
}

/** Displacement and velocity after `a` seconds, starting at `v0`, with constant pull `acc` and drag `k` (per second). */
function motion(v0: number, acc: number, k: number, a: number): [number, number] {
  if (k <= 1e-6) return [v0 * a + 0.5 * acc * a * a, v0 + acc * a];
  const e = Math.exp(-k * a);
  const f = (1 - e) / k;
  return [v0 * f + (acc / k) * (a - f), v0 * e + (acc / k) * (1 - e)];
}

/**
 * Every particle alive `time` seconds after the emitter started. Particle n is born at n / rate (the burst ones at 0),
 * so which ones are alive is a small range of numbers, never a walk from the beginning.
 */
export function particlesAt(s: ParticlesShape, time: number): Particle[] {
  const out: Particle[] = [];
  if (!(time >= 0) || s.opacity <= 0) return out;
  const L = maxLife(s);
  const T = s.prewarm ? time + L : time;
  const cap = Math.max(1, Math.min(HARD_MAX, Math.round(s.max ?? DEFAULT_MAX)));
  const m = emitterMatrix(s.transform);
  const avgScale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const add = (n: number, born: number) => {
    const age = T - born;
    if (age < 0) return;
    const life = Math.max(0.02, vary(s.life, s.variance, rand(s.seed, n, 0)));
    if (age >= life) return;
    const u = age / life;
    // Where it starts, in emitter space, then on the stage.
    let lx = 0;
    let ly = 0;
    if (s.emitter === 'line') lx = (rand(s.seed, n, 1) - 0.5) * s.width;
    else if (s.emitter === 'area') {
      lx = (rand(s.seed, n, 1) - 0.5) * s.width;
      ly = (rand(s.seed, n, 2) - 0.5) * s.height;
    }
    const sx = m[0] * lx + m[2] * ly + m[4];
    const sy = m[1] * lx + m[3] * ly + m[5];
    // Which way it goes turns with the emitter.
    const ang = ((s.direction + s.spread * (2 * rand(s.seed, n, 3) - 1)) * Math.PI) / 180;
    let dx = m[0] * Math.cos(ang) + m[2] * Math.sin(ang);
    let dy = m[1] * Math.cos(ang) + m[3] * Math.sin(ang);
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = Math.max(0, vary(s.speed, s.variance, rand(s.seed, n, 4)));
    const k = Math.max(0, s.drag);
    const [px, vx] = motion(dx * speed, s.wind, k, age);
    const [py, vy] = motion(dy * speed, s.gravity, k, age);
    let x = sx + px;
    let y = sy + py;
    if (s.wobble) {
      const ph = rand(s.seed, n, 5) * Math.PI * 2;
      x += s.wobble * Math.sin(age * 2.1 + ph);
      y += s.wobble * 0.6 * Math.cos(age * 1.7 + ph * 1.3);
    }
    const sizeK = Math.max(0, 1 + Math.max(0, Math.min(1, s.variance)) * (rand(s.seed, n, 6) - 0.5));
    const size = Math.max(0, (s.sizeStart + (s.sizeEnd - s.sizeStart) * u) * sizeK * avgScale);
    const spin = vary(s.spin, s.variance, rand(s.seed, n, 7)) * (rand(s.seed, n, 9) < 0.5 && s.sprite === 'confetti' ? -1 : 1);
    const rotation = rand(s.seed, n, 8) * 360 + spin * age;
    // A quick fade in over the first few hundredths of its life, so particles never pop on.
    const fadeIn = Math.min(1, u / 0.04);
    const alpha = Math.max(0, Math.min(1, (s.opacityStart + (s.opacityEnd - s.opacityStart) * u) * fadeIn));
    out.push({ x, y, vx, vy, size, rotation, color: mixHex(s.colorStart, s.colorEnd, s.colorBy === 'random' ? rand(s.seed, n, 10) : u), alpha, age, key: n });
  };

  for (let b = 0; b < Math.min(HARD_MAX, Math.max(0, Math.round(s.burst))); b++) add(-1 - b, 0);
  if (s.rate > 0) {
    const stopAt = s.emitFor > 0 ? s.emitFor : Infinity;
    const first = Math.ceil((T - L) * s.rate);
    const last = Math.floor(Math.min(T, stopAt - 1e-9) * s.rate);
    // Only the newest ones when there are more than the cap.
    const from = Math.max(first, last - cap * 2, 0);
    for (let n = from; n <= last; n++) add(n, n / s.rate);
  }
  if (out.length > cap) out.splice(0, out.length - cap);
  return out;
}

// ---------------------------------------------------------------- presets

export interface ParticlePreset {
  id: string;
  label: string;
  /** One line, plain words. */
  description: string;
  icon: string;
  /** Everything but where it sits. */
  values: Omit<ParticlesShape, 'id' | 'type' | 'transform' | 'seed' | 'group'>;
}

const base = {
  emitter: 'point' as const,
  width: 0,
  height: 0,
  rate: 20,
  burst: 0,
  emitFor: 0,
  life: 1.5,
  variance: 0.4,
  speed: 80,
  direction: -90,
  spread: 30,
  gravity: 0,
  wind: 0,
  drag: 0,
  sizeStart: 8,
  sizeEnd: 2,
  colorStart: '#ffffff',
  colorEnd: '#ffffff',
  opacityStart: 1,
  opacityEnd: 0,
  spin: 0,
  sprite: 'dot' as ParticleSprite,
  opacity: 1,
};

export const PARTICLE_PRESETS: ParticlePreset[] = [
  {
    id: 'sparkle',
    label: 'Sparkle burst',
    description: 'A pop of twinkly stars that flies out and fades. Great for magic, a ding, or a level up.',
    icon: 'pt-burst',
    values: { ...base, preset: 'sparkle', rate: 0, burst: 36, life: 0.9, variance: 0.5, speed: 260, spread: 180, drag: 3, sizeStart: 16, sizeEnd: 2, colorStart: '#fff6a8', colorEnd: '#ff9ad5', spin: 180, sprite: 'spark' },
  },
  {
    id: 'smoke',
    label: 'Smoke',
    description: 'Soft puffs that rise, spread and fade. Chimneys, campfires, steam.',
    icon: 'pt-smoke',
    values: { ...base, preset: 'smoke', emitter: 'line', width: 24, rate: 14, life: 3, variance: 0.4, speed: 50, spread: 14, wind: 10, drag: 0.4, wobble: 6, sizeStart: 22, sizeEnd: 90, colorStart: '#9a9aa6', colorEnd: '#d9d9e0', opacityStart: 0.55, opacityEnd: 0, spin: 20, sprite: 'soft', prewarm: true },
  },
  {
    id: 'rain',
    label: 'Rain',
    description: 'Streaks falling from the top of the stage. Turn the wind up for a storm.',
    icon: 'pt-rain',
    values: { ...base, preset: 'rain', emitter: 'line', width: 800, rate: 160, life: 1.2, variance: 0.2, speed: 700, direction: 90, spread: 3, wind: 30, sizeStart: 2, sizeEnd: 2, colorStart: '#9fc7ff', colorEnd: '#9fc7ff', opacityStart: 0.7, opacityEnd: 0.7, sprite: 'streak', prewarm: true },
  },
  {
    id: 'snow',
    label: 'Snow',
    description: 'Flakes drifting down and swaying, already falling when it starts.',
    icon: 'pt-snow',
    values: { ...base, preset: 'snow', emitter: 'line', width: 800, rate: 26, life: 8, variance: 0.5, speed: 60, direction: 90, spread: 10, wind: 4, wobble: 14, sizeStart: 9, sizeEnd: 9, colorStart: '#ffffff', colorEnd: '#eaf4ff', opacityStart: 0.95, opacityEnd: 0.95, spin: 40, sprite: 'flake', prewarm: true },
  },
  {
    id: 'confetti',
    label: 'Confetti',
    description: 'A cheerful burst of paper bits that flutter down. Parties and wins.',
    icon: 'pt-confetti',
    values: { ...base, preset: 'confetti', rate: 0, burst: 90, life: 3, variance: 0.5, speed: 520, spread: 40, gravity: 420, drag: 1.6, wobble: 8, sizeStart: 12, sizeEnd: 12, colorStart: '#ff5d8f', colorEnd: '#3ec7ff', colorBy: 'random', opacityStart: 1, opacityEnd: 1, spin: 540, sprite: 'confetti' },
  },
  {
    id: 'dust',
    label: 'Dust',
    description: 'A few tiny specks floating in the air. Quiet, sunny rooms and old attics.',
    icon: 'pt-dust',
    values: { ...base, preset: 'dust', emitter: 'area', width: 600, height: 400, rate: 6, life: 6, variance: 0.6, speed: 6, spread: 180, wobble: 10, sizeStart: 3, sizeEnd: 3, colorStart: '#fff1c9', colorEnd: '#fff1c9', opacityStart: 0.8, opacityEnd: 0, sprite: 'soft', prewarm: true },
  },
];

export function presetById(id: string | undefined): ParticlePreset | undefined {
  return PARTICLE_PRESETS.find((p) => p.id === id);
}

/** A new emitter from a preset, centred at (x, y). Wide presets (rain, snow, dust) fit the stage width. */
export function newParticles(id: string, presetId: string, at: { x: number; y: number }, stage?: { width: number; height: number }, seed = 1): ParticlesShape {
  const p = presetById(presetId) ?? PARTICLE_PRESETS[0];
  const v = { ...p.values };
  if (stage && (p.id === 'rain' || p.id === 'snow')) v.width = Math.round(stage.width * 1.2);
  if (stage && p.id === 'dust') {
    v.width = stage.width;
    v.height = stage.height;
  }
  return { id, type: 'particles', transform: { x: at.x, y: at.y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, seed, ...v };
}

export interface SpriteInfo {
  value: ParticleSprite;
  label: string;
}

export const SPRITES: SpriteInfo[] = [
  { value: 'dot', label: 'Dot' },
  { value: 'soft', label: 'Soft puff' },
  { value: 'square', label: 'Square' },
  { value: 'star', label: 'Star' },
  { value: 'spark', label: 'Twinkle' },
  { value: 'streak', label: 'Streak' },
  { value: 'confetti', label: 'Paper bit' },
  { value: 'flake', label: 'Snowflake' },
  { value: 'symbol', label: 'A symbol' },
];

/** The emitter's own box on the stage, for selecting and moving it (never smaller than `min`). */
export function emitterBox(s: ParticlesShape, min = 24): { x: number; y: number; w: number; h: number } {
  const m = emitterMatrix(s.transform);
  const hw = Math.max(min, s.emitter === 'point' ? 0 : s.width) / 2;
  const hh = Math.max(min, s.emitter === 'area' ? s.height : 0) / 2;
  const pts = [
    [-hw, -hh],
    [hw, -hh],
    [-hw, hh],
    [hw, hh],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
