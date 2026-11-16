/**
 * Pixel text, worked out with no canvas: which font pixels a piece of text is made of, where each letter sits, and
 * where the caret and the selection go. Everything is in whole art pixels (cells), so the result lands on the grid and
 * never needs smoothing. Pure, so tests run without a browser.
 */
import { CLASSIC, TINY } from './fontData';

export type PixelFontId = 'classic' | 'tiny';
export type PixelAlign = 'left' | 'center' | 'right';

export interface PixelFontInfo {
  id: PixelFontId;
  name: string;
  /** Plain words for the picker. */
  blurb: string;
  /** Rows a capital letter takes. */
  cap: number;
  /** Rows tails (g, j, p, q, y) hang below the baseline. */
  below: number;
  /** Rows from one line to the next, before the line spacing setting. */
  pitch: number;
  /** Empty columns between letters. */
  gap: number;
  /** Small letters are drawn as capitals. */
  capsOnly: boolean;
  table: Record<string, string>;
}

export const PIXEL_FONTS: PixelFontInfo[] = [
  { id: 'classic', name: 'Classic', blurb: '5 by 7, with capitals and small letters', cap: 7, below: 2, pitch: 10, gap: 1, capsOnly: false, table: CLASSIC },
  { id: 'tiny', name: 'Tiny', blurb: '3 by 5, capitals only, for the smallest labels', cap: 5, below: 1, pitch: 7, gap: 1, capsOnly: true, table: TINY },
];

export function pixelFont(id: PixelFontId | string): PixelFontInfo {
  return PIXEL_FONTS.find((f) => f.id === id) ?? PIXEL_FONTS[0];
}

export interface PixelTextStyle {
  font: PixelFontId;
  /** Art pixels per font pixel (whole numbers: 1 is the font as drawn, 2 is double). */
  scale: number;
  /** Every font pixel gets one more beside it. */
  bold: boolean;
  /** Extra empty columns between letters, in font pixels. */
  spacing: number;
  /** Extra (or fewer, when negative) rows between lines, in font pixels. */
  lineGap: number;
  align: PixelAlign;
}

export const DEFAULT_PIXEL_TEXT: PixelTextStyle = { font: 'classic', scale: 1, bold: false, spacing: 0, lineGap: 0, align: 'left' };

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const MAX_SPACING = 6;
export const MIN_LINE_GAP = -2;
export const MAX_LINE_GAP = 10;

const whole = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** A style with every field in range (anything else from a saved or odd value falls back to the default). */
export function cleanStyle(s: Partial<Record<keyof PixelTextStyle, unknown>> | null | undefined): PixelTextStyle {
  const d = DEFAULT_PIXEL_TEXT;
  const x = s ?? {};
  return {
    font: PIXEL_FONTS.some((f) => f.id === x.font) ? (x.font as PixelFontId) : d.font,
    scale: whole(x.scale, MIN_SCALE, MAX_SCALE, d.scale),
    bold: typeof x.bold === 'boolean' ? x.bold : d.bold,
    spacing: whole(x.spacing, 0, MAX_SPACING, d.spacing),
    lineGap: whole(x.lineGap, MIN_LINE_GAP, MAX_LINE_GAP, d.lineGap),
    align: x.align === 'center' || x.align === 'right' || x.align === 'left' ? x.align : d.align,
  };
}

// ---------------------------------------------------------------- glyphs

export interface Glyph {
  /** Columns. */
  w: number;
  /** Rows down from the top of a capital. */
  top: number;
  /** One number per row, bit `c` set when column `c` is a pixel. */
  rows: number[];
}

const cache = new Map<string, Glyph | null>();

/** Reads one `top|row/row` entry. Returns null for a table entry that is not well formed. */
export function parseGlyph(spec: string): Glyph | null {
  const bar = spec.indexOf('|');
  if (bar < 1) return null;
  const top = Number(spec.slice(0, bar));
  const rows = spec.slice(bar + 1).split('/');
  const w = rows[0].length;
  if (!Number.isInteger(top) || top < 0 || w < 1 || rows.some((r) => r.length !== w || /[^#.]/.test(r))) return null;
  return { w, top, rows: rows.map((r) => [...r].reduce((n, c, i) => (c === '#' ? n | (1 << i) : n), 0)) };
}

const SIMPLER: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '−': '-', '…': '.', ' ': ' ', '\t': ' ', ß: 's', æ: 'e', Æ: 'E', ø: 'o', Ø: 'O', đ: 'd', ł: 'l', Ł: 'L' };

/** The character a letter is drawn as: itself, or its plain cousin (e for é, a quote mark for a curly one). */
export function drawnAs(font: PixelFontInfo, ch: string): string {
  if (font.table[ch]) return ch;
  const simple = SIMPLER[ch] ?? ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (font.table[simple]) return simple;
  if (font.capsOnly && font.table[simple.toUpperCase()]) return simple.toUpperCase();
  return '?';
}

export function glyphFor(font: PixelFontInfo, ch: string): Glyph {
  const key = `${font.id}${drawnAs(font, ch)}`;
  let g = cache.get(key);
  if (g === undefined) {
    g = parseGlyph(font.table[drawnAs(font, ch)] ?? '');
    cache.set(key, g);
  }
  return g ?? { w: 1, top: 0, rows: [1] };
}

/** True when the font has a picture for this letter (otherwise it draws a question mark in its place). */
export function hasGlyph(font: PixelFontInfo, ch: string): boolean {
  return drawnAs(font, ch) !== '?' || ch === '?';
}

// ---------------------------------------------------------------- layout

/** A run of pixels on one row, in cells from the anchor. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelChar {
  /** Where the letter is in the text (UTF-16 index, as a text box counts). */
  index: number;
  /** Left edge in cells from the anchor, and how far the caret moves past it. */
  x: number;
  adv: number;
}

export interface PixelLine {
  /** First and one past the last character of the line in the text. */
  start: number;
  end: number;
  /** Top of the line in cells from the anchor. */
  y: number;
  /** Where the line starts and how wide the drawn letters are, in cells from the anchor. */
  x: number;
  w: number;
  chars: PixelChar[];
}

export interface PixelLayout {
  /** The pixels, as runs. */
  rects: PixelRect[];
  lines: PixelLine[];
  /** The block the text fills, in cells from the anchor. */
  box: PixelRect;
  /** Height of one caret, in cells. */
  caretH: number;
  /** Rows between lines, in cells. */
  pitch: number;
  scale: number;
}

/** Lays text out. Cells are measured from the anchor (the cell that was clicked): the text starts there, is centred on it or ends at it. */
export function layoutPixelText(text: string, style: PixelTextStyle): PixelLayout {
  const st = cleanStyle(style);
  const font = pixelFont(st.font);
  const sc = st.scale;
  const pitchF = Math.max(1, font.pitch + st.lineGap);
  const stepGap = font.gap + st.spacing;
  const raw = text.replace(/\r\n?/g, '\n').split('\n');

  // First pass: letters per line, in font pixels from the line's own left edge.
  interface Pass {
    start: number;
    end: number;
    chars: { index: number; ch: string; x: number; adv: number }[];
    drawn: number;
    full: number;
  }
  const passes: Pass[] = [];
  let at = 0;
  for (const line of raw) {
    const chars: Pass['chars'] = [];
    let x = 0;
    let i = 0;
    for (const ch of line) {
      const g = glyphFor(font, ch);
      const adv = g.w + (st.bold ? 1 : 0) + stepGap;
      chars.push({ index: at + i, ch, x, adv });
      x += adv;
      i += ch.length;
    }
    passes.push({ start: at, end: at + line.length, chars, drawn: Math.max(0, x - stepGap), full: x });
    at += line.length + 1;
  }
  const blockF = Math.max(0, ...passes.map((p) => p.drawn));
  const shiftF = st.align === 'center' ? Math.floor(blockF / 2) : st.align === 'right' ? blockF : 0;

  const rects: PixelRect[] = [];
  const lines: PixelLine[] = [];
  passes.forEach((p, li) => {
    const offF = (st.align === 'center' ? Math.floor((blockF - p.drawn) / 2) : st.align === 'right' ? blockF - p.drawn : 0) - shiftF;
    const topF = li * pitchF;
    for (const c of p.chars) {
      const g = glyphFor(font, c.ch);
      g.rows.forEach((bits, r) => {
        const b = st.bold ? bits | (bits << 1) : bits;
        for (let col = 0; col < g.w + 1; ) {
          if (!(b & (1 << col))) {
            col++;
            continue;
          }
          let end = col;
          while (b & (1 << (end + 1))) end++;
          rects.push({ x: (offF + c.x + col) * sc, y: (topF + g.top + r) * sc, w: (end - col + 1) * sc, h: sc });
          col = end + 1;
        }
      });
    }
    lines.push({
      start: p.start,
      end: p.end,
      y: topF * sc,
      x: offF * sc,
      w: p.drawn * sc,
      // A line's caret positions run past the last letter by its full step.
      chars: p.chars.map((c) => ({ index: c.index, x: (offF + c.x) * sc, adv: c.adv * sc })),
    });
  });
  const hF = (passes.length - 1) * pitchF + font.cap + font.below;
  return { rects, lines, box: { x: shiftF ? -shiftF * sc : 0, y: 0, w: blockF * sc, h: hF * sc }, caretH: (font.cap + font.below) * sc, pitch: pitchF * sc, scale: sc };
}

/** Every cell the text paints, as x and y pairs measured from the anchor (for tests and for painting). */
export function textCells(l: PixelLayout): [number, number][] {
  const out: [number, number][] = [];
  for (const r of l.rects) for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) out.push([r.x + x, r.y + y]);
  return out;
}

/** The line a text index is on, and its place along it (the caret before the letter at that index). */
function lineOf(l: PixelLayout, index: number): PixelLine {
  for (const ln of l.lines) if (index >= ln.start && index <= ln.end) return ln;
  return l.lines[l.lines.length - 1];
}

/** Where the caret sits for a text index: a thin bar the height of a line, in cells from the anchor. */
export function caretRect(l: PixelLayout, index: number): PixelRect {
  const ln = lineOf(l, index);
  const c = ln.chars.find((k) => k.index >= index);
  const x = c ? c.x : ln.chars.length ? ln.chars[ln.chars.length - 1].x + ln.chars[ln.chars.length - 1].adv : ln.x;
  return { x, y: ln.y, w: Math.max(1, l.scale), h: l.caretH };
}

/** The boxes a selection from `a` to `b` covers, one per line it touches. */
export function selectionRects(l: PixelLayout, a: number, b: number): PixelRect[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) return [];
  const out: PixelRect[] = [];
  for (const ln of l.lines) {
    const from = Math.max(lo, ln.start);
    const to = Math.min(hi, ln.end);
    const crossesBreak = hi > ln.end && lo <= ln.end;
    if (to <= from && !crossesBreak) continue;
    const x0 = caretRect(l, from).x;
    const x1 = to > from ? caretRect(l, to).x : x0;
    // A selected line break shows as a little extra width at the end of its line.
    out.push({ x: x0, y: ln.y, w: Math.max(l.scale, x1 - x0 + (crossesBreak ? l.scale * 2 : 0)), h: l.caretH });
  }
  return out;
}

/** The text index nearest a point (in cells from the anchor): the line by its height, then the gap between letters by its left or right half. */
export function indexAt(l: PixelLayout, x: number, y: number): number {
  const n = l.lines.length;
  const li = Math.min(n - 1, Math.max(0, Math.floor(y / Math.max(1, l.pitch))));
  const ln = l.lines[li];
  for (const c of ln.chars) if (x < c.x + (c.adv - 0) / 2) return c.index;
  return ln.end;
}

/** True when the point is inside the block the text fills (with a cell or two of give, so a click near the edge still counts). */
export function insideText(l: PixelLayout, x: number, y: number, slack = 1): boolean {
  const b = l.box;
  return x >= b.x - slack && x < b.x + Math.max(b.w, l.scale) + slack && y >= b.y - slack && y < b.y + b.h + slack;
}
