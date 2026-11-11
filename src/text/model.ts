/**
 * Text shapes: fonts, layout and text animators. Pure: measuring is passed in, so tests run without a canvas.
 *
 * Animators split text into pieces (letters, words or lines) and give each piece an offset, turn, size and opacity
 * at a frame. The ordering, seeded shuffle and window maths come from Interactives' text modifiers (textmod.ts),
 * cut down to frame-based presets.
 */
import type { Easing, TextAnimKind, TextAnimator, TextShape, TextUnit, Transform2D } from '../core/format';
import { ease } from '../core/ease';

// ---------------------------------------------------------------- fonts

export interface FontInfo {
  /** What's saved in the file and shown in the picker. */
  name: string;
  /** The CSS family list the canvas uses. */
  css: string;
  /** Ships with Frameling, so it looks the same on every computer. */
  shipped: boolean;
}

export const SHIPPED_FONTS: FontInfo[] = [
  { name: 'Nunito', css: "'Nunito Variable', 'Nunito', sans-serif", shipped: true },
  { name: 'Inter', css: "'Inter Variable', 'Inter', sans-serif", shipped: true },
];

/** The CSS family list for a font name (system fonts are quoted, with a plain fallback). */
export function fontFamilyCss(name: string): string {
  const shipped = SHIPPED_FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (shipped) return shipped.css;
  const clean = name.replace(/["'\\;{}]/g, '').trim() || 'sans-serif';
  return `"${clean}", sans-serif`;
}

/** The canvas `font` string for a text shape at a size. */
export function cssFont(s: Pick<TextShape, 'font' | 'weight' | 'italic'>, size: number): string {
  return `${s.italic ? 'italic ' : ''}${Math.round(clamp(s.weight, 100, 900))} ${Math.max(0.1, size)}px ${fontFamilyCss(s.font)}`;
}

// ---------------------------------------------------------------- layout

/** Width of a run of text in the given font (canvas measureText, or an estimate in tests). */
export type Measure = (text: string, font: string) => number;

/** A rough measure for when there is no canvas: an average letter is about half the size wide. */
export const estimateMeasure: Measure = (text, font) => {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  const size = m ? Number(m[1]) : 16;
  let w = 0;
  for (const ch of text) w += ch === ' ' ? size * 0.28 : /[mwMW]/.test(ch) ? size * 0.8 : /[il.,'!|]/.test(ch) ? size * 0.28 : size * 0.55;
  return w;
};

export interface Glyph {
  /** The character(s); one grapheme. */
  ch: string;
  /** Left edge and baseline in text space. */
  x: number;
  y: number;
  w: number;
  line: number;
  /** Word index across the whole text (-1 for spaces). */
  word: number;
  /** Letter index across the whole text, spaces skipped (-1 for spaces). */
  letter: number;
}

export interface TextLayout {
  glyphs: Glyph[];
  lines: { y: number; x: number; w: number; text: string }[];
  letters: number;
  words: number;
  /** The box the text covers in its own space (before the transform). */
  box: { x: number; y: number; w: number; h: number };
  ascent: number;
  descent: number;
}

const graphemes = (s: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
  return [...s];
};

export function lineHeightOf(s: Pick<TextShape, 'size' | 'lineHeight'>): number {
  return s.size * (s.lineHeight ?? 1.2);
}

/** Lays the text out: every glyph's place, line by line. The first baseline is y = 0. */
export function layoutText(s: TextShape, measure: Measure = estimateMeasure): TextLayout {
  const font = cssFont(s, s.size);
  const spacing = s.letterSpacing ?? 0;
  const lh = lineHeightOf(s);
  const glyphs: Glyph[] = [];
  const lines: TextLayout['lines'] = [];
  let letter = 0;
  let word = 0;
  const raw = s.text.split('\n');
  raw.forEach((text, li) => {
    const gs = graphemes(text);
    // Prefix widths keep kerning: each glyph starts where the text before it ends.
    const xs: number[] = [];
    let prefix = '';
    for (let i = 0; i < gs.length; i++) {
      xs.push(measure(prefix, font) + i * spacing);
      prefix += gs[i];
    }
    const w = gs.length ? measure(prefix, font) + (gs.length - 1) * spacing : 0;
    const x0 = s.align === 'center' ? -w / 2 : s.align === 'right' ? -w : 0;
    const y = li * lh;
    let inWord = false;
    for (let i = 0; i < gs.length; i++) {
      const ch = gs[i];
      const space = /^\s+$/.test(ch);
      if (space) inWord = false;
      else if (!inWord) {
        inWord = true;
        word++;
      }
      const next = i + 1 < gs.length ? xs[i + 1] : w + spacing;
      glyphs.push({ ch, x: x0 + xs[i], y, w: Math.max(0, next - xs[i] - spacing), line: li, word: space ? -1 : word - 1, letter: space ? -1 : letter++ });
    }
    lines.push({ y, x: x0, w, text });
    inWord = false;
  });
  const ascent = s.size * 0.8;
  const descent = s.size * 0.25;
  let minX = 0;
  let maxX = 0;
  for (const l of lines) {
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x + l.w);
  }
  if (maxX - minX < s.size * 0.3) maxX = minX + s.size * 0.3;
  const h = (lines.length - 1) * lh + ascent + descent;
  return { glyphs, lines, letters: letter, words: word, box: { x: minX, y: -ascent, w: maxX - minX, h }, ascent, descent };
}

// ---------------------------------------------------------------- animators

export interface AnimInfo {
  kind: TextAnimKind;
  /** Plain words. */
  label: string;
  /** What other apps call it. */
  term: string;
  description: string;
  /** What `amount` means, or null when it isn't used. */
  amount: { label: string; min: number; max: number; step: number; unit: string; default: number } | null;
  /** Whether it has an in and an out. */
  directional: boolean;
  defaults: Partial<TextAnimator>;
}

export const TEXT_ANIMS: AnimInfo[] = [
  { kind: 'fade', label: 'Fade', term: 'Opacity', description: 'Each piece fades in (or out).', amount: null, directional: true, defaults: { by: 'letter', duration: 8, stagger: 2 } },
  { kind: 'slide', label: 'Slide', term: 'Position', description: 'Each piece slides into place from a little way off.', amount: { label: 'Distance', min: 0, max: 400, step: 1, unit: 'px', default: 40 }, directional: true, defaults: { by: 'word', duration: 10, stagger: 3, angle: 90, ease: 'backOut' } },
  { kind: 'scale', label: 'Grow', term: 'Scale', description: 'Each piece grows from small (or shrinks away).', amount: { label: 'Starting size', min: 0, max: 400, step: 5, unit: '%', default: 0 }, directional: true, defaults: { by: 'letter', duration: 10, stagger: 2, ease: 'backOut' } },
  { kind: 'rotate', label: 'Spin', term: 'Rotation', description: 'Each piece turns into place.', amount: { label: 'Turn', min: -720, max: 720, step: 5, unit: '°', default: -90 }, directional: true, defaults: { by: 'letter', duration: 12, stagger: 2, ease: 'easeOut' } },
  { kind: 'typewriter', label: 'Typewriter', term: 'Type on', description: 'Letters appear one at a time, as if typed.', amount: null, directional: true, defaults: { by: 'letter', duration: 1, stagger: 2 } },
  { kind: 'wave', label: 'Wave', term: 'Wave', description: 'Pieces bob up and down in a wave, round and round.', amount: { label: 'Height', min: 0, max: 200, step: 1, unit: 'px', default: 10 }, directional: false, defaults: { by: 'letter', duration: 24, stagger: 2 } },
];

export function animInfo(kind: TextAnimKind): AnimInfo {
  return TEXT_ANIMS.find((a) => a.kind === kind) ?? TEXT_ANIMS[0];
}

export const TEXT_UNITS: { value: TextUnit; label: string }[] = [
  { value: 'letter', label: 'Letters' },
  { value: 'word', label: 'Words' },
  { value: 'line', label: 'Lines' },
];

export function newAnimator(kind: TextAnimKind, id: string): TextAnimator {
  const info = animInfo(kind);
  return {
    id,
    kind,
    by: 'letter',
    start: 0,
    duration: 10,
    stagger: 2,
    amount: info.amount?.default ?? 0,
    ...info.defaults,
  };
}

/** A seeded random number maker (mulberry32, as in Interactives). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A repeatable shuffle of 0..n-1 for a seed: `perm[i]` is the turn piece `i` takes. */
export function permutation(n: number, seed: number): number[] {
  const rnd = mulberry32(Math.floor(seed) || 0);
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

/** Which turn each of `n` pieces takes. */
export function pieceOrder(n: number, order: TextAnimator['order'], seed = 0): number[] {
  if (order === 'backward') return Array.from({ length: n }, (_, i) => n - 1 - i);
  if (order === 'random') return permutation(n, seed);
  if (order === 'middle') {
    // Out from the middle: the centre pieces first, the ends last.
    const mid = (n - 1) / 2;
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    const out = new Array<number>(n);
    idx.forEach((piece, rank) => (out[piece] = Math.floor((rank + 1) / 2)));
    return out;
  }
  return Array.from({ length: n }, (_, i) => i);
}

/** How a piece is changed at a frame. Offsets in text space, turn in degrees. */
export interface PieceLook {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export const PLAIN: PieceLook = { dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 };

export function activeAnimators(s: TextShape): TextAnimator[] {
  return (s.animators ?? []).filter((a) => a.on !== false);
}

/** Whether the text changes from frame to frame. */
export function isAnimatedText(s: TextShape): boolean {
  return activeAnimators(s).length > 0;
}

/** How far through its own animation a piece is at `frame` (0 to 1, eased). */
function progress(a: TextAnimator, turn: number, frame: number): number {
  const t0 = a.start + turn * Math.max(0, a.stagger);
  const d = Math.max(1, a.duration);
  const raw = Math.max(0, Math.min(1, (frame - t0) / d));
  return ease((a.ease ?? 'easeOut') as Easing, raw);
}

/** Adds one animator's change to a piece's look. */
export function applyAnimator(look: PieceLook, a: TextAnimator, turn: number, frame: number): PieceLook {
  const out = { ...look };
  if (a.kind === 'wave') {
    const t = frame - a.start - turn * a.stagger;
    if (frame < a.start) return out;
    out.dy -= a.amount * Math.sin((2 * Math.PI * t) / Math.max(1, a.duration));
    return out;
  }
  const outward = a.direction === 'out';
  if (a.kind === 'typewriter') {
    const shown = frame >= a.start + turn * Math.max(0, a.stagger);
    if (shown === outward) out.opacity = 0;
    return out;
  }
  const e = progress(a, turn, frame);
  // How much of the change shows: all of it before an 'in' starts, none once it's done; the other way for 'out'.
  const w = outward ? e : 1 - e;
  if (a.kind === 'fade') out.opacity *= Math.max(0, Math.min(1, 1 - w));
  else if (a.kind === 'slide') {
    const ang = ((a.angle ?? 90) * Math.PI) / 180;
    out.dx += Math.cos(ang) * a.amount * w;
    out.dy += Math.sin(ang) * a.amount * w;
  } else if (a.kind === 'scale') out.scale *= 1 + (a.amount / 100 - 1) * w;
  else if (a.kind === 'rotate') out.rotation += a.amount * w;
  return out;
}

/** The pieces an animator works on, as a list of glyph indices each. Spaces belong to no piece. */
export function piecesOf(layout: TextLayout, by: TextUnit): number[][] {
  const out: number[][] = [];
  const add = (k: number, gi: number) => {
    while (out.length <= k) out.push([]);
    out[k].push(gi);
  };
  layout.glyphs.forEach((g, gi) => {
    if (g.letter < 0) return;
    add(by === 'letter' ? g.letter : by === 'word' ? g.word : g.line, gi);
  });
  return out.filter((p) => p.length);
}

/**
 * Every glyph's look at `frame` (frames since the key began), plus the centre each piece turns and scales about.
 * Glyphs in a word or line move as one.
 */
export function glyphLooks(s: TextShape, layout: TextLayout, frame: number): { look: PieceLook; cx: number; cy: number }[] {
  const out = layout.glyphs.map((g) => ({ look: { ...PLAIN }, cx: g.x + g.w / 2, cy: g.y - layout.ascent * 0.35 }));
  for (const a of activeAnimators(s)) {
    const pieces = piecesOf(layout, a.by);
    const order = pieceOrder(pieces.length, a.order, a.seed ?? 0);
    pieces.forEach((p, k) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const gi of p) {
        const g = layout.glyphs[gi];
        x0 = Math.min(x0, g.x);
        x1 = Math.max(x1, g.x + g.w);
      }
      const cy = layout.glyphs[p[0]].y - layout.ascent * 0.35;
      for (const gi of p) {
        out[gi].look = applyAnimator(out[gi].look, a, order[k], frame);
        if (a.by !== 'letter') {
          out[gi].cx = (x0 + x1) / 2;
          out[gi].cy = cy;
        }
      }
    });
  }
  return out;
}

/** The frame the last piece finishes on, for "how long is this" hints (waves never finish: Infinity). */
export function animatorEnd(s: TextShape, layout: TextLayout): number {
  let end = 0;
  for (const a of activeAnimators(s)) {
    if (a.kind === 'wave') return Infinity;
    const n = piecesOf(layout, a.by).length;
    end = Math.max(end, a.start + Math.max(0, n - 1) * a.stagger + (a.kind === 'typewriter' ? 1 : a.duration));
  }
  return end;
}

// ---------------------------------------------------------------- new text

export function newTextShape(id: string, at: { x: number; y: number }, patch: Partial<TextShape> = {}): TextShape {
  const t: Transform2D = { x: at.x, y: at.y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 };
  return { id, type: 'text', text: '', font: 'Nunito', size: 48, weight: 700, color: '#2b2d42', align: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: t, ...patch };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}
