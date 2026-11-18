// One brush on both kinds of layer. A brush made for vectors is worked out as a pixel brush (`toPixel`), and one made for
// pixels as a vector brush (`toVector`), as near as each side can draw it. Both are pure and best effort, and neither
// changes the brush it was given: the half you made stays exactly as it was, and the other half is worked out when a layer
// of that kind needs it, so going there and back loses nothing. What a side cannot draw is listed (`keptOnVectors`,
// `keptOnPixels`) so the panel can say so, with the controls greyed and the reason beside them.
import { DEFAULT_BRUSH } from '../core/doc';
import type { BrushSettings, BrushTip } from '../core/format';
import { cleanDab, DEFAULT_DAB, type DabBrush } from '../dab/maths';
import type { DynRoute } from '../dab/dynamics';
import type { PixelSpec } from '../dab/spec';
import { mediumInfo, type DryId } from '../dry/maths';
import { isPaper } from '../dry/paper';
import { COMB, likeVector, stampPicture } from './pixelStarters';
import type { PixelStamp } from './stamps';

/** One thing a side cannot draw of a brush that came from the other. `id` is the `data-control` id of the control that is greyed for it. */
export interface Kept {
  id: string;
  /** The control's name, as it is on the side that has it. */
  label: string;
  /** What it was set to, in a few plain words. */
  value: string;
  /** Why it is greyed, in a line. */
  why: string;
  /** The look would change a lot without it (bristles, a watercolour edge, dual tip, wet paint...). */
  big?: boolean;
  /** Said in the line but with no greyed row of its own (the side has no control of this kind to grey). */
  noRow?: boolean;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Which dry tips are charcoal (the rest are chalk), as the brushes that come with Frameling have them. */
const CHARCOAL: readonly DryId[] = ['vine-charcoal', 'compressed-charcoal', 'crayon', 'sketch-pencil'];

// ---------------------------------------------------------------- vector to pixel

/** A vector brush as a pixel brush, as close as the pixel brush draws it. */
export function toPixel(b: BrushSettings): PixelSpec {
  const t = b.tip;
  // A stick on paper is the pixel side's own dry medium.
  if (t && (t.kind === 'chalk' || t.kind === 'charcoal') && t.dry) {
    const m = mediumInfo(t.dry);
    return { kind: 'dry', medium: t.dry, ...(t.paper && isPaper(t.paper) ? { paper: t.paper } : {}), size: Math.round(clamp(b.size, 1, 300)), hardness: m.hardness, press: clamp(b.thinning > 0 ? Math.max(m.press, 0.4 + b.thinning * 0.6) : m.press, 0.05, 1) };
  }
  const taper = b.taperStart > 0 || b.taperEnd > 0 ? { start: b.taperStart, end: b.taperEnd } : undefined;
  const lighter = b.thinning < 0;
  const base: Partial<DabBrush> = likeVector(b.size, Math.max(0, b.thinning), taper);
  // A line that thins as you press harder: the same route the other way round.
  if (lighter) base.dynamics = [route('pressure', 'size', r2(-b.thinning), true), route('pressure', 'flow', 0)];
  const dab: Partial<DabBrush> = { ...base, ...tipDab(t, base.size ?? b.size) };
  return { kind: 'dab', dab: cleanDab({ ...DEFAULT_DAB, ...dab }) };
}

const route = (from: DynRoute['from'], to: DynRoute['to'], amount: number, invert = false): DynRoute => ({ from, to, amount, invert });

/** What the tip adds to the plain dab. */
function tipDab(t: BrushTip | undefined, size: number): Partial<DabBrush> {
  if (!t) return {};
  if (t.kind === 'chalk' || t.kind === 'charcoal') return { spacing: 0.12, flow: 0.5, grain: { paper: 'rough', depth: clamp(t.amount ?? 0.5, 0, 1), scale: clamp(Math.round(t.grain ?? 1), 1, 8), moving: false } };
  if (t.kind === 'watercolour') return { hardness: 0.5, flow: 0.4, opacity: 0.9 };
  if (t.kind === 'stamp') {
    const shape = t.shape ?? 'dot';
    const custom = shape === 'custom' ? (t.custom ?? []) : [];
    return {
      tip: 'picture',
      picture: stampPicture(shape, 32, custom),
      size,
      spacing: clamp(t.spacing ?? 1, 0.01, 4),
      sizeJitter: clamp((t.jitter ?? 0) * 0.7, 0, 1),
      scatter: clamp(t.scatter ?? 0, 0, 2),
      follow: t.angle === 'follow',
      angleJitter: t.angle === 'random' ? 1 : clamp(t.turn ?? 0, 0, 1),
    };
  }
  if (t.kind === 'nib') return { tip: 'square', roundness: clamp(t.roundness ?? 0.3, 0.05, 1), angle: Math.round(((t.nibAngle ?? 0) % 360 + 360) % 360), follow: t.angle === 'follow', spacing: 0.05 };
  if (t.kind === 'bristle') return { tip: 'picture', picture: COMB, spacing: 0.1, follow: true };
  return {};
}

/** What a pixel layer cannot draw of a vector brush. */
export function keptOnPixels(b: BrushSettings): Kept[] {
  const t = b.tip;
  const out: Kept[] = [];
  if (!t) return out;
  const why = (what: string) => `Pixels do not draw ${what}`;
  if (t.kind === 'watercolour') out.push({ id: 'wash-edge', label: 'Edge', value: pct(t.amount ?? 0.5), why: why('the darker rim of a wash'), big: true });
  if (t.kind === 'bristle') {
    out.push({ id: 'bristle-count', label: 'Bristles', value: String(t.count ?? 12), why: why('separate bristles'), big: true });
    out.push({ id: 'bristle-stiffness', label: 'Stiffness', value: pct(t.stiffness ?? 0.6), why: why('separate bristles'), big: true });
    out.push({ id: 'bristle-dry-gaps', label: 'Dry gaps', value: pct(t.amount ?? 0), why: why('separate bristles'), big: true });
    out.push({ id: 'bristle-thickness', label: 'Bristle thickness', value: String(r2(t.body ?? 0)), why: why('separate bristles'), big: true });
    out.push({ id: 'bristle-streaks', label: 'Light and dark streaks', value: pct(t.tone ?? 0), why: why('separate bristles'), big: true });
  }
  if (t.kind === 'along') out.push({ id: 'along-fit', label: 'On a long line', value: t.fit === 'repeat' ? 'Repeat' : 'Stretch', why: why('a drawing bent along the line'), big: true });
  if (t.kind === 'edged') out.push({ id: 'edged-parts', label: 'Parts of an edged brush', value: 'Sides and corners', why: why('a drawing for the sides and corners'), big: true });
  if (t.kind === 'stamp' && (t.gapVary ?? 0) > 0) out.push({ id: 'gap-variety', label: 'Gap variety', value: pct(t.gapVary ?? 0), why: why('gaps that bunch and spread') });
  if ((t.matte ?? 0) > 0) out.push({ id: 'matte', label: 'Matte finish', value: pct(t.matte ?? 0), why: why('a matte finish') });
  return out;
}

// ---------------------------------------------------------------- pixel to vector

/** The width of a pixel brush's size route as a share of the line, the other way round from `likeVector`. */
function thinningOf(d: DabBrush): { thinning: number; size: number } {
  const size = d.size;
  const a = d.dynamics.find((x) => x.to === 'size' && x.from === 'pressure');
  if (!a || a.amount <= 0) return { thinning: 0, size };
  const amount = clamp(a.amount, 0, 1);
  if (a.invert) return { thinning: -r2(clamp(amount, 0, 1)), size };
  // amount = 2t / (1 + t), so t = amount / (2 - amount), and the line is its width at full pressure over 1 + t.
  const t = amount / (2 - amount);
  return { thinning: r2(clamp(t, 0, 1)), size: Math.max(1, r2(size / (1 + t))) };
}

const SQUARE = [[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]];
const DOT_GRID = 24;

/** A picture as closed outlines, 1 unit across and centred on 0, one rectangle for each run of filled cells in a row. Null for a picture with too many runs to be a stamp. */
export function pictureOutlines(p: PixelStamp, maxRuns = 160): number[][] | null {
  const biggest = p.cells.reduce((m, c) => (c > m ? c : m), 0);
  if (!biggest) return null;
  const soft = !!p.soft;
  const filled = (v: number): boolean => (soft ? v * 2 >= biggest : v > 0);
  // A big picture is looked at in blocks, so a 256 square soft tip is a grid of at most DOT_GRID across.
  const step = Math.max(1, Math.ceil(Math.max(p.w, p.h) / DOT_GRID));
  const cw = Math.ceil(p.w / step);
  const ch = Math.ceil(p.h / step);
  const on = (cx: number, cy: number): boolean => {
    let hit = 0;
    let all = 0;
    for (let y = cy * step; y < Math.min(p.h, (cy + 1) * step); y++) {
      for (let x = cx * step; x < Math.min(p.w, (cx + 1) * step); x++) {
        all++;
        if (filled(p.cells[y * p.w + x] ?? 0)) hit++;
      }
    }
    return all > 0 && hit * 2 >= all;
  };
  const side = Math.max(cw, ch);
  const out: number[][] = [];
  for (let y = 0; y < ch; y++) {
    let x = 0;
    while (x < cw) {
      if (!on(x, y)) {
        x++;
        continue;
      }
      const from = x;
      while (x < cw && on(x, y)) x++;
      const x0 = from / side - cw / side / 2;
      const x1 = x / side - cw / side / 2;
      const y0 = y / side - ch / side / 2;
      const y1 = (y + 1) / side - ch / side / 2;
      out.push([x0, y0, x1, y0, x1, y1, x0, y1]);
      if (out.length > maxRuns) return null;
    }
  }
  return out.length ? out : null;
}

/** A pixel brush as a vector brush, as close as a vector line draws it. */
export function toVector(s: PixelSpec): BrushSettings {
  if (s.kind === 'dry') {
    const kind = CHARCOAL.includes(s.medium) ? 'charcoal' : 'chalk';
    const tip: BrushTip = { kind, amount: kind === 'charcoal' ? 0.4 : 0.35, grain: 1, dry: s.medium, ...(s.paper ? { paper: s.paper } : {}) };
    return { ...DEFAULT_BRUSH, size: s.size, thinning: r2(clamp(s.press * 0.5, 0, 1)), smoothing: 0.4, streamline: 0.4, tip };
  }
  if (s.kind === 'soft') return { ...DEFAULT_BRUSH, size: s.size, thinning: 0, smoothing: 0.5, streamline: 0.5 };
  const d = s.dab;
  const { thinning, size } = thinningOf(d);
  const taperStart = d.taper && d.taper.start > 0 ? Math.round(d.taper.start * d.size) : 0;
  const taperEnd = d.taper && d.taper.end > 0 ? Math.round(d.taper.end * d.size) : 0;
  const b: BrushSettings = { ...DEFAULT_BRUSH, size, thinning, taperStart, taperEnd, smoothing: 0.6, streamline: 0.6 };
  const tip = vectorTip(d);
  return tip ? { ...b, tip } : b;
}

function vectorTip(d: DabBrush): BrushTip | undefined {
  const upright = !d.follow;
  if (d.tip === 'picture' && d.picture) {
    const rings = pictureOutlines(d.picture);
    return {
      kind: 'stamp',
      shape: rings ? 'custom' : 'dot',
      ...(rings ? { custom: rings } : {}),
      spacing: clamp(d.spacing, 0.2, 4),
      jitter: clamp(d.sizeJitter / 0.7, 0, 1),
      angle: d.angleJitter >= 0.8 ? 'random' : d.follow ? 'follow' : 'upright',
      scatter: clamp(d.scatter, 0, 2),
      turn: d.angleJitter < 0.8 ? clamp(d.angleJitter, 0, 1) : 0,
    };
  }
  // Dabs far apart, or flung about the line, are stamps.
  if (d.spacing >= 1.05 || d.scatter > 0 || d.sizeJitter >= 0.2) {
    const square = d.tip === 'square';
    return {
      kind: 'stamp',
      shape: square ? 'custom' : 'dot',
      ...(square ? { custom: SQUARE } : {}),
      spacing: clamp(d.spacing, 0.2, 4),
      jitter: clamp(d.sizeJitter / 0.7, 0, 1),
      angle: d.angleJitter >= 0.8 ? 'random' : d.follow ? 'follow' : 'upright',
      scatter: clamp(d.scatter, 0, 2),
    };
  }
  if (d.grain && !d.grain.picture) {
    const kind = 'chalk';
    return { kind, amount: clamp(d.grain.depth * 0.6, 0.05, 1), grain: clamp(d.grain.scale, 0.5, 3), dry: 'chalk', ...(d.grain.paper ? { paper: d.grain.paper } : {}) };
  }
  if (d.roundness < 0.95) return { kind: 'nib', roundness: d.roundness, nibAngle: d.angle, angle: upright ? 'upright' : 'follow' };
  return undefined;
}

const SOURCE_WORDS: Record<DynRoute['from'], string> = { pressure: 'pressure', tilt: 'tilt', twist: 'twist', speed: 'speed', direction: 'direction', fade: 'the length of the line', random: 'chance' };

/** What a vector line cannot draw of a pixel brush. */
export function keptOnVectors(s: PixelSpec): Kept[] {
  const out: Kept[] = [];
  const why = (what: string) => `Vectors do not draw ${what}`;
  if (s.kind === 'soft') {
    if (s.tool === 'smudge') out.push({ id: 'tool-smudge', label: 'Smudge', value: 'On', why: why('smudging what is under the line'), big: true });
    if (s.tool === 'soft-eraser') out.push({ id: 'tool-erase', label: 'Erases', value: 'On', why: why('erasing as a brush'), big: true });
    if (s.tool === 'airbrush') out.push({ id: 'builds-up', label: 'Builds up while you hold still', value: 'On', why: why('paint that builds up in one spot') });
    if (s.tool === 'highlighter') out.push({ id: 'blend', label: 'How the paint joins what is there', value: 'Multiply', why: why('blending with what is under it'), big: true });
    if (s.hardness < 1) out.push({ id: 'hardness', label: 'Hardness', value: pct(s.hardness), why: why('a soft edge') });
    if (s.flow < 1) out.push({ id: 'flow', label: 'Flow', value: pct(s.flow), why: why('flow') });
    return out;
  }
  if (s.kind === 'dry') {
    if (s.hardness < 0.5) out.push({ id: 'hardness', label: 'Hardness', value: pct(s.hardness), why: why('a soft edge') });
    return out;
  }
  const d = s.dab;
  if (d.wet > 0) out.push({ id: 'wet-paint', label: 'Wet paint', value: pct(d.wet), why: 'Wet paint picks up the pixels under the stroke, so it needs a pixel layer', big: true });
  if (d.dual) out.push({ id: 'dual-tip', label: 'Dual tip', value: d.dual.cut ? 'Cuts holes' : 'On', why: why('a second tip'), big: true });
  if (d.blend !== 'normal') out.push({ id: 'blend', label: 'How the paint joins what is there', value: d.blend, why: why('blending with what is under it'), big: true });
  if (d.hardness < 1 && d.tip !== 'picture') out.push({ id: 'hardness', label: 'Hardness', value: pct(d.hardness), why: why('a soft edge') });
  if (d.flow < 1) out.push({ id: 'flow', label: 'Flow', value: pct(d.flow), why: why('flow') });
  if (d.opacity < 1) out.push({ id: 'opacity', label: 'Opacity', value: pct(d.opacity), why: why('opacity on a stroke') });
  if (d.grain?.picture) out.push({ id: 'paper-picture', label: 'A picture as the paper', value: 'On', why: why('a picture as the paper') });
  const ids: Record<string, [string, string]> = {
    flow: ['flow-follows', 'Flow follows'],
    opacity: ['opacity-follows', 'Opacity follows'],
    angle: ['angle-follows', 'Angle follows'],
    scatter: ['scatter-follows', 'Scatter follows'],
    mix: ['mix-follows', 'Colour mixes toward the fill colour'],
    hue: ['hue-wobble', 'Hue wobble'],
    lightness: ['lightness-wobble', 'Lightness wobble'],
    saturation: ['saturation-wobble', 'Colourfulness wobble'],
  };
  const seen = new Set<string>();
  for (const x of d.dynamics) {
    if (x.amount <= 0) continue;
    if (x.to === 'size') {
      if (x.from === 'pressure') continue;
      if (!seen.has('size-follows-extra')) out.push({ id: 'size-follows-extra', label: `Size follows ${SOURCE_WORDS[x.from]}`, value: pct(x.amount), why: why('size that follows more than pressure'), noRow: true });
      seen.add('size-follows-extra');
      continue;
    }
    // Pressure on flow with nothing behind it is only the pen page's own pressure, which a vector line leaves alone.
    const [id, label] = ids[x.to] ?? [`${x.to}-follows`, `${x.to} follows`];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: `${label} ${SOURCE_WORDS[x.from]}`, value: pct(x.amount), why: why(`${label.toLowerCase()} ${SOURCE_WORDS[x.from]}`), big: x.to === 'hue' || x.to === 'mix' });
  }
  if (d.taper && d.taper.opacity > 0) out.push({ id: 'taper-faint', label: 'How faint the tip gets', value: pct(d.taper.opacity), why: why('a tip that fades out') });
  return out;
}

// ---------------------------------------------------------------- saying it

/**
 * One plain line for what a kind of layer cannot draw: "Dual tip is kept, but vectors don't draw it". `onVectors` is true
 * when the layer is a vector layer. Empty when nothing is lost.
 */
export function keptLine(kept: readonly Kept[], onVectors: boolean): string {
  if (!kept.length) return '';
  const names = [...new Set(kept.map((k) => k.label))].map((n) => n.replace(/ (pressure|tilt|twist|speed|direction|chance|the length of the line)$/, ''));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const many = names.length > 1;
  return `${list} ${many ? 'are' : 'is'} kept, but ${onVectors ? 'vectors' : 'pixels'} don't draw ${many ? 'them' : 'it'}`;
}

/** True when drawing the other half would look quite different (so it is worth asking once). */
export const bigLoss = (kept: readonly Kept[]): boolean => kept.some((k) => k.big);
