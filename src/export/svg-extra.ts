// SVG for text and particle shapes (svg.ts handles the rest). Text stays text, so it can be edited afterwards.
import type { ParticlesShape, TextShape } from '../core/format';
import { posedParticles } from '../particles/draw';
import type { Particle } from '../particles/model';
import { fontFamilyCss, glyphLooks, isAnimatedText } from '../text/model';
import { isPosedText, textLayout, textMatrix } from '../text/draw';
import { instanceToSvg } from './svg';
import { particleSprites } from './sprites';

// Symbol sprites are written once each and placed with <use> while a writer collects them (see withSprites).
let spriteIds: Map<string, string> | null = null;
// Soft puff gradients, one per colour, written once into the same definitions.
let softIds: Map<string, string> | null = null;

/** Runs `make` with symbol particle sprites shared through <use>; their definitions come back with the result. */
export function withSprites<T>(make: () => T): { value: T; defs: string[] } {
  const outer = spriteIds;
  const outerSoft = softIds;
  spriteIds = new Map();
  softIds = new Map();
  try {
    const value = make();
    return { value, defs: [...softIds.values(), ...[...spriteIds].map(([body, id]) => `<g id="${id}">${body}</g>`)] };
  } finally {
    spriteIds = outer;
    softIds = outerSoft;
  }
}

/** The app's soft puff as a gradient: full colour in the middle, two thirds at 45%, nothing at the edge (particles/draw.ts). */
function softPuff(fill: string, x: number, y: number, r: number, opacity: string): string {
  const id = `soft-${fill.replace(/[^0-9a-z]/gi, '')}`;
  const def = `<radialGradient id="${id}"><stop offset="0" stop-color="${fill}"/><stop offset="0.45" stop-color="${fill}" stop-opacity="0.667"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></radialGradient>`;
  // Without a collector (see withSprites) the gradient travels with the particle.
  if (softIds) softIds.set(id, def);
  return `${softIds ? '' : def}<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="url(#${id})"${opacity}/>`;
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function color(c: string): { fill: string; alpha: number } {
  if (/^#[0-9a-f]{8}$/i.test(c)) return { fill: c.slice(0, 7), alpha: parseInt(c.slice(7), 16) / 255 };
  return { fill: c, alpha: 1 };
}

export function textToSvg(s: TextShape): string {
  if (!s.text || s.opacity <= 0) return '';
  const l = textLayout(s);
  const m = textMatrix(s);
  const c = color(s.color);
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

/** A particle as an SVG element (symbol sprites go through symbolParticlesToSvg). */
export function particleToSvg(s: ParticlesShape, p: Particle): string {
  const c = color(p.color);
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
    if (spriteIds) {
      let id = spriteIds.get(body);
      if (!id) {
        id = `sprite${spriteIds.size}`;
        spriteIds.set(body, id);
      }
      parts.push(`<use href="#${id}"${tf}/>`);
    } else parts.push(`<g${tf}>${body}</g>`);
  }
  return parts.length ? `<g>${parts.join('')}</g>` : '';
}

export function particlesToSvg(s: ParticlesShape): string {
  if (s.opacity <= 0) return '';
  if (s.sprite === 'symbol' && (s as { posedSprites?: unknown[] }).posedSprites?.length) return symbolParticlesToSvg(s);
  const parts = posedParticles(s).map((p) => particleToSvg(s, p)).filter(Boolean);
  return parts.length ? `<g>${parts.join('')}</g>` : '';
}
