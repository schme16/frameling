// How particles go into the export formats that do not draw them the canvas way. It registers with the particles kind
// (see kind.ts) and is loaded the first time an export needs it.
import type { ParticlesShape, SubPath } from '../core/format';
import type { PosedInstance } from '../core/symbols';
import { instanceToSvg } from '../export/svg';
import { Content, drawInstance, grouped, num, parseColor, type PdfFrameContext } from '../export/pdf';
import type { Item, LookItem, LottieKit, ShapeLook, SymbolSprite } from '../export/lottie';
import type { ShapeExport } from '../export/shapeExport';
import { n2, sharedSprite, softPuff, svgColor } from '../export/svg-extra';
import { posedParticles } from './draw';
import type { Particle } from './model';
import { particleSprites, SPRITE_UNIT, type ParticleSprite } from './sprites';

// ---- SVG

/** A particle as an SVG element (symbol sprites go through symbolParticlesToSvg). */
export function particleToSvg(s: ParticlesShape, p: Particle): string {
  const c = svgColor(p.color);
  const a = p.alpha * s.opacity * c.alpha;
  if (a <= 0.003 || p.size <= 0.01) return '';
  const r = p.size / 2;
  const op = a < 1 ? ` opacity="${n2(a)}"` : '';
  const at = `translate(${n2(p.x)} ${n2(p.y)}) rotate(${n2(p.rotation)})`;
  switch (s.sprite) {
    case 'streak': {
      const len = Math.max(p.size * 2, Math.hypot(p.vx, p.vy) * 0.05);
      const ang = Math.atan2(p.vy, p.vx);
      return `<line x1="${n2(p.x)}" y1="${n2(p.y)}" x2="${n2(p.x - Math.cos(ang) * len)}" y2="${n2(p.y - Math.sin(ang) * len)}" stroke="${c.fill}" stroke-width="${n2(p.size)}" stroke-linecap="round"${op}/>`;
    }
    case 'square':
      return `<rect x="${n2(-r)}" y="${n2(-r)}" width="${n2(p.size)}" height="${n2(p.size)}" fill="${c.fill}" transform="${at}"${op}/>`;
    case 'confetti': {
      const flip = Math.cos((p.rotation * Math.PI) / 90);
      return `<rect x="${n2(-r)}" y="${n2(-r * 0.5)}" width="${n2(p.size)}" height="${n2(p.size * 0.5)}" fill="${c.fill}" transform="${at} scale(1 ${n2(flip)})"${op}/>`;
    }
    case 'star':
    case 'spark': {
      const points = s.sprite === 'star' ? 5 : 4;
      const inner = s.sprite === 'star' ? 0.45 : 0.22;
      const pts: string[] = [];
      for (let i = 0; i < points * 2; i++) {
        const ang = (i * Math.PI) / points - Math.PI / 2;
        const rr = i % 2 ? r * inner : r;
        pts.push(`${n2(Math.cos(ang) * rr)},${n2(Math.sin(ang) * rr)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${c.fill}" transform="${at}"${op}/>`;
    }
    case 'flake': {
      const d: string[] = [];
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI) / 3;
        d.push(`M${n2(Math.cos(ang) * r)} ${n2(Math.sin(ang) * r)}L${n2(-Math.cos(ang) * r)} ${n2(-Math.sin(ang) * r)}`);
      }
      return `<path d="${d.join('')}" stroke="${c.fill}" stroke-width="${n2(Math.max(0.6, p.size / 9))}" stroke-linecap="round" fill="none" transform="${at}"${op}/>`;
    }
    case 'soft':
      return softPuff(c.fill, p.x, p.y, r, op);
    default:
      return `<circle cx="${n2(p.x)}" cy="${n2(p.y)}" r="${n2(r)}" fill="${c.fill}"${op}/>`;
  }
}

/** Particles drawing a symbol: the symbol's own drawing, moved, turned and sized per particle. */
function symbolParticlesToSvg(s: ParticlesShape): string {
  const parts: string[] = [];
  for (const sp of particleSprites(s)) {
    if (!sp.sprite || sp.alpha <= 0) continue;
    const body = instanceToSvg({ ...sp.sprite, opacity: 1, posed: { ...sp.sprite.posed, matrix: [1, 0, 0, 1, 0, 0] } });
    if (!body) continue;
    const tf = ` transform="matrix(${sp.m.map((v) => String(Math.round(v * 10000) / 10000)).join(' ')})"${sp.alpha < 1 ? ` opacity="${n2(sp.alpha)}"` : ''}`;
    const id = sharedSprite(body);
    parts.push(id ? `<use href="#${id}"${tf}/>` : `<g${tf}>${body}</g>`);
  }
  return parts.length ? `<g>${parts.join('')}</g>` : '';
}

export function particlesToSvg(s: ParticlesShape): string {
  if (s.opacity <= 0) return '';
  if (s.sprite === 'symbol' && (s as { posedSprites?: unknown[] }).posedSprites?.length) return symbolParticlesToSvg(s);
  const parts = posedParticles(s).map((p) => particleToSvg(s, p)).filter(Boolean);
  return parts.length ? `<g>${parts.join('')}</g>` : '';
}


// ---- PDF and Illustrator

function particleShape(cx: Content, s: ParticlesShape, p: Particle): void {
  const r = p.size / 2;
  const rot = (p.rotation * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const at = `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(p.x)} ${num(p.y)} cm`;
  switch (s.sprite) {
    case 'streak': {
      const len = Math.max(p.size * 2, Math.hypot(p.vx, p.vy) * 0.05);
      const ang = Math.atan2(p.vy, p.vx);
      cx.push(`${num(p.size)} w 1 J ${num(p.x)} ${num(p.y)} m ${num(p.x - Math.cos(ang) * len)} ${num(p.y - Math.sin(ang) * len)} l S`);
      return;
    }
    case 'square':
      cx.push(`q ${at} ${num(-r)} ${num(-r)} ${num(p.size)} ${num(p.size)} re f Q`);
      return;
    case 'confetti': {
      const flip = Math.cos((p.rotation * Math.PI) / 90) || 0.01;
      cx.push(`q ${at} 1 0 0 ${num(flip)} 0 0 cm ${num(-r)} ${num(-r * 0.5)} ${num(p.size)} ${num(p.size * 0.5)} re f Q`);
      return;
    }
    case 'star':
    case 'spark': {
      const points = s.sprite === 'star' ? 5 : 4;
      const inner = s.sprite === 'star' ? 0.45 : 0.22;
      cx.push(`q ${at}`);
      for (let i = 0; i < points * 2; i++) {
        const a = (i * Math.PI) / points - Math.PI / 2;
        const rr = i % 2 ? r * inner : r;
        cx.push(`${num(Math.cos(a) * rr)} ${num(Math.sin(a) * rr)} ${i ? 'l' : 'm'}`);
      }
      cx.push('h f Q');
      return;
    }
    case 'flake': {
      cx.push(`q ${at} ${num(Math.max(0.6, p.size / 9))} w 1 J`);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        cx.push(`${num(Math.cos(a) * r)} ${num(Math.sin(a) * r)} m ${num(-Math.cos(a) * r)} ${num(-Math.sin(a) * r)} l`);
      }
      cx.push('S Q');
      return;
    }
    case 'soft':
      cx.circle(p.x, p.y, r * 0.7);
      cx.push('f');
      return;
    default:
      cx.circle(p.x, p.y, r);
      cx.push('f');
  }
}

function drawParticles(cx: Content, ctx: PdfFrameContext, s: ParticlesShape): void {
  if (s.opacity <= 0) return;
  const posed = s as ParticlesShape & { posedSprites?: PosedInstance[]; posedSpriteSize?: number; posedFps?: number };
  for (const p of posedParticles(s)) {
    const a = p.alpha * s.opacity * (s.sprite === 'soft' ? 0.6 : 1);
    if (a <= 0.003 || p.size <= 0.01) continue;
    if (s.sprite === 'symbol' && posed.posedSprites?.length) {
      const k = p.size / Math.max(1, posed.posedSpriteSize ?? 1);
      const rot = (p.rotation * Math.PI) / 180;
      const sprite = posed.posedSprites[Math.floor(p.age * (posed.posedFps ?? 24)) % posed.posedSprites.length];
      grouped(cx, ctx, a, undefined, (c) => {
        c.push(`q ${num(Math.cos(rot) * k)} ${num(Math.sin(rot) * k)} ${num(-Math.sin(rot) * k)} ${num(Math.cos(rot) * k)} ${num(p.x)} ${num(p.y)} cm`);
        drawInstance(c, ctx, sprite);
        c.push('Q');
      });
      continue;
    }
    cx.push('q');
    const c = parseColor(p.color);
    const alpha = a * c.a;
    cx.push(`${num(c.r)} ${num(c.g)} ${num(c.b)} rg ${num(c.r)} ${num(c.g)} ${num(c.b)} RG`);
    if (alpha < 0.999) cx.push(`/${ctx.writer.state(alpha, alpha)} gs`);
    particleShape(cx, s, p);
    cx.push('Q');
  }
}

// ---- Lottie

/** One particle as a sprite look (symbol sprites are handled as precomp layers instead). */
function particleLook(kit: LottieKit, s: ParticlesShape, sp: ParticleSprite): ShapeLook {
  const c = kit.tinted(sp.p.color, kit.tints);
  const R = SPRITE_UNIT / 2;
  const fillOf = { rgb: c.rgb, o: kit.r3(c.alpha * 100) };
  const p = sp.p;
  switch (s.sprite) {
    case 'streak': {
      const len = Math.max(p.size * 2, Math.hypot(p.vx, p.vy) * 0.05);
      const ang = Math.atan2(p.vy, p.vx);
      // Drawn along its own axis and moved by the group, so only the length changes the path and the position keys thin out.
      const line: SubPath = { closed: false, points: [{ x: 0, y: 0 }, { x: -len, y: 0 }] };
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      return { paths: [kit.lottiePath(line)], fill: null, stroke: { rgb: c.rgb, o: kit.r3(c.alpha * 100), w: kit.r3(p.size), lc: 2, lj: 2 }, tr: kit.trOf([cos, sin, -sin, cos, p.x, p.y], sp.alpha) };
    }
    case 'flake': {
      const lines: SubPath[] = [0, 1, 2].map((i) => {
        const a = (i * Math.PI) / 3;
        return { closed: false, points: [{ x: Math.cos(a) * R, y: Math.sin(a) * R }, { x: -Math.cos(a) * R, y: -Math.sin(a) * R }] };
      });
      const k = Math.max(1e-4, p.size / SPRITE_UNIT);
      return { paths: lines.map(kit.lottiePath), fill: null, stroke: { rgb: c.rgb, o: kit.r3(c.alpha * 100), w: kit.r3(Math.max(0.6, p.size / 9) / k), lc: 2, lj: 2 }, tr: kit.trOf(sp.m, sp.alpha) };
    }
    case 'soft':
      return { paths: [kit.lottiePath(kit.circleSub(R))], fill: null, stroke: null, soft: { rgb: c.rgb }, tr: kit.trOf(sp.m, sp.alpha) };
    case 'square':
      return { paths: [kit.lottiePath(kit.rectSub(-R, -R, SPRITE_UNIT, SPRITE_UNIT))], fill: fillOf, stroke: null, tr: kit.trOf(sp.m, sp.alpha) };
    case 'confetti':
      return { paths: [kit.lottiePath(kit.rectSub(-R, -R * 0.5, SPRITE_UNIT, SPRITE_UNIT * 0.5))], fill: fillOf, stroke: null, tr: kit.trOf(sp.m, sp.alpha) };
    case 'star':
    case 'spark':
      return { paths: [kit.lottiePath(kit.starSub(R, s.sprite === 'star' ? 5 : 4, s.sprite === 'star' ? 0.45 : 0.22))], fill: fillOf, stroke: null, tr: kit.trOf(sp.m, sp.alpha) };
    default:
      return { paths: [kit.lottiePath(kit.circleSub(R))], fill: fillOf, stroke: null, tr: kit.trOf(sp.m, sp.alpha) };
  }
}

/** A slot per particle that is alive on any of the frames, faded out where it is not (the same number of items on every frame). */
function particlesToLottie(kit: LottieKit, frames: ParticlesShape[]): Item[][] {
  const per = frames.map((s) => particleSprites(s));
  const keys: number[] = [];
  const seen = new Set<number>();
  for (const list of per)
    for (const sp of list)
      if (!seen.has(sp.key)) {
        seen.add(sp.key);
        keys.push(sp.key);
      }
  const byKey = per.map((list) => new Map(list.map((sp) => [sp.key, sp])));
  const slots: Item[][] = [];
  for (const key of keys) {
    const col = byKey.map((m, f): LookItem | SymbolSprite | null => {
      const sp = m.get(key);
      if (!sp) return null;
      const s = frames[f];
      if (sp.sprite) return { type: 'psym', symbolId: s.symbolId!, m: sp.m, alpha: sp.alpha, inner: sp.inner ?? 0 };
      return { type: 'look', look: particleLook(kit, s, sp) };
    });
    const first = col.find((x) => x);
    const full = first?.type === 'psym' ? kit.fillGaps(col as (SymbolSprite | null)[], kit.hideSym) : kit.fillGaps(col as (LookItem | null)[], kit.hideLook);
    if (full) slots.push(full);
  }
  return frames.map((_, f) => slots.map((c) => c[f]));
}

export const particlesExport: ShapeExport<ParticlesShape> = { svg: particlesToSvg, pdf: drawParticles, lottie: particlesToLottie };
