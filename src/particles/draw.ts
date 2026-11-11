// Draws particle emitters for the single renderer, and poses them (works out the particles) for a frame.
import type { Doc, Drawing, ParticlesShape } from '../core/format';
import type { PosedInstance } from '../core/symbols';
import { particlesAt, type Particle } from './model';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** An emitter posed at a moment: the particles alive then, and its symbol's pictures if it uses one. Runtime only. */
export interface PosedParticles extends ParticlesShape {
  posedTime: number;
  posedFps?: number;
  /** One posed copy of the symbol per frame of its own animation (particles play it from their birth). */
  posedSprites?: PosedInstance[];
  /** The symbol's size, for scaling it to the particle size. */
  posedSpriteSize?: number;
  /** Filled in on first draw. */
  posedList?: Particle[];
}

export function isPosedParticles(s: ParticlesShape): s is PosedParticles {
  return 'posedTime' in s;
}

/** The particles of a posed emitter, worked out once. */
export function posedParticles(s: ParticlesShape): Particle[] {
  if (!isPosedParticles(s)) return particlesAt(s, 0);
  if (!s.posedList) s.posedList = particlesAt(s, s.posedTime);
  return s.posedList;
}

/** A rough box of what a set of drawings covers (point extents; good enough to size a sprite). */
export function drawingsSize(ds: Drawing[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const pt = (x: number, y: number, r = 0) => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const d of ds) {
    if (d.kind === 'pixel') pt(0, 0), pt(d.width, d.height);
    else if (d.kind === 'vector')
      for (const s of d.shapes) {
        if (s.type === 'stroke') for (const p of s.points) pt(p.x, p.y, s.brush.size / 2);
        else if (s.type === 'fill' || s.type === 'path') for (const sp of s.paths) for (const p of sp.points) pt(p.x, p.y);
        else if (s.type === 'text' || s.type === 'particles') pt(s.transform.x, s.transform.y, 20);
        else if (s.type === 'instance') pt(s.transform.x, s.transform.y, 20);
      }
  }
  return Number.isFinite(x0) ? Math.max(1, x1 - x0, y1 - y0) : 1;
}

// Soft puffs are a cached white blob, tinted per colour (smoke, dust).
const softCache = new Map<string, OffscreenCanvas>();
function softSprite(color: string): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const key = color.slice(0, 7);
  let c = softCache.get(key);
  if (!c) {
    c = new OffscreenCanvas(64, 64);
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, key);
    grad.addColorStop(0.45, key + 'aa');
    grad.addColorStop(1, key + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    if (softCache.size > 256) softCache.clear();
    softCache.set(key, c);
  }
  return c;
}

function star(g: Ctx2D, r: number, points: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Draws one particle's sprite at the origin (the caller has moved there). */
export function drawSprite(g: Ctx2D, s: ParticlesShape, p: Particle): void {
  const r = p.size / 2;
  switch (s.sprite) {
    case 'square':
      g.fillRect(-r, -r, p.size, p.size);
      break;
    case 'star':
      star(g, r, 5, 0.45);
      break;
    case 'spark':
      star(g, r, 4, 0.22);
      break;
    case 'confetti': {
      // A paper bit seen from the side as it flips.
      const flip = Math.cos((p.rotation * Math.PI) / 90);
      g.fillRect(-r, (-r * 0.5) * flip, p.size, p.size * 0.5 * flip || 0.01);
      break;
    }
    case 'flake': {
      g.lineWidth = Math.max(0.6, p.size / 9);
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
      }
      g.stroke();
      break;
    }
    case 'soft': {
      const c = softSprite(p.color);
      if (c) g.drawImage(c, -r, -r, p.size, p.size);
      else {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    default:
      g.beginPath();
      g.arc(0, 0, Math.max(0.01, r), 0, Math.PI * 2);
      g.fill();
  }
}

/** Draws a posed emitter. `drawInstance` comes from the renderer (to draw symbol sprites without an import loop). */
export function drawParticles(g: Ctx2D, s: ParticlesShape, drawInstance: (g: Ctx2D, i: PosedInstance) => void): void {
  if (s.opacity <= 0) return;
  const list = posedParticles(s);
  if (!list.length) return;
  const posed = isPosedParticles(s) ? s : null;
  const sprites = s.sprite === 'symbol' ? posed?.posedSprites : undefined;
  const fps = posed?.posedFps ?? 24;
  g.save();
  for (const p of list) {
    const a = p.alpha * s.opacity;
    if (a <= 0.003 || p.size <= 0.01) continue;
    g.globalAlpha = Math.min(1, a);
    if (s.sprite === 'streak') {
      // Streaks follow the way the particle moves; their length is how far it goes in a twentieth of a second.
      const len = Math.max(p.size * 2, Math.hypot(p.vx, p.vy) * 0.05);
      const ang = Math.atan2(p.vy, p.vx);
      g.strokeStyle = p.color;
      g.lineWidth = p.size;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
      g.stroke();
      continue;
    }
    g.save();
    g.translate(p.x, p.y);
    if (p.rotation) g.rotate((p.rotation * Math.PI) / 180);
    if (sprites && sprites.length) {
      const k = p.size / Math.max(1, posed!.posedSpriteSize ?? 1);
      g.scale(k, k);
      drawInstance(g, sprites[Math.floor(p.age * fps) % sprites.length]);
    } else if (s.sprite !== 'symbol') {
      g.fillStyle = p.color;
      g.strokeStyle = p.color;
      drawSprite(g, s, p);
    } else {
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  g.restore();
  g.globalAlpha = 1;
}

/** Pose an emitter: when, and the symbol's pictures. `poseSymbol` gives the symbol at each of its frames. */
export function poseParticles(doc: Doc, s: ParticlesShape, local: number, poseSymbol: (frame: number) => PosedInstance | null, symbolLength: number): PosedParticles {
  const out: PosedParticles = { ...s, posedTime: Math.max(0, local) / Math.max(1, doc.fps), posedFps: doc.fps };
  if (s.sprite === 'symbol' && s.symbolId) {
    const n = Math.max(1, Math.min(240, symbolLength));
    const sprites: PosedInstance[] = [];
    for (let f = 0; f < n; f++) {
      const p = poseSymbol(f);
      if (p) sprites.push(p);
    }
    out.posedSprites = sprites;
    out.posedSpriteSize = sprites.length ? drawingsSize(sprites[0].posed.layers.map((l) => l.drawing)) : 1;
  }
  return out;
}
