// A Photoshop type layer as a Frameling text node: the words, font, size, colour, spacing, line height and alignment, placed
// where the first baseline was. A Frameling text shape has one style for all its words and no box, so what the type layer
// holds beyond that is reported, not lost quietly. Pure.
import type { BlendMode } from '../../core/format';
import type { TextNode } from './model';
import { psFont } from './psdfonts';
import type { PsdTextRun, PsdType } from './psdtype';

/** Where the first baseline sits below the top of a paragraph box, as a multiple of the size (Photoshop's cap-height setting). */
export const BASELINE_IN_BOX = 0.71;

/** What a type layer had that a text shape can't hold, to be counted. */
export interface TextLoss {
  /** Words in different fonts, sizes or colours: the longest style is used for all of them. */
  mixed: boolean;
  underline: boolean;
  strike: boolean;
  smallCaps: boolean;
  /** Justified (both edges straight): came in left aligned. */
  justify: boolean;
  /** All capitals: the words were typed out in capitals. */
  caps: boolean;
}

/** Why a type layer has to stay a picture: warped, vertical, on a path. Null when it can come in as text. */
export function pictureReason(t: PsdType): 'warped' | 'vertical' | 'path' | null {
  if (t.warped) return 'warped';
  if (t.vertical) return 'vertical';
  if (t.onPath) return 'path';
  return null;
}

const styleKey = (r: PsdTextRun) => [r.font, r.size, r.color, r.tracking, r.leading, r.fauxBold, r.fauxItalic, r.underline, r.strike, r.caps].join('|');

/** The run with the most letters (spaces and line breaks do not count): what the whole text takes its style from. */
export function dominantRun(runs: PsdTextRun[]): PsdTextRun {
  let best = runs[0];
  let bestN = -1;
  for (const r of runs) {
    const n = r.text.replace(/\s/g, '').length;
    if (n > bestN) {
      best = r;
      bestN = n;
    }
  }
  return best;
}

export interface TextBase {
  name: string;
  hidden: boolean;
  opacity: number;
  blend: BlendMode;
  clip: boolean;
}

const round = (v: number, d = 100) => Math.round(v * d) / d;

export function textNodeFrom(t: PsdType, base: TextBase): { node: TextNode; loss: TextLoss } {
  const [xx, xy, yx, yy, tx, ty] = t.transform;
  const sx = Math.hypot(xx, xy) || 1;
  const sy = Math.hypot(yx, yy) || 1;
  const dom = dominantRun(t.runs);
  const f = psFont(dom.font || 'Sans-serif', dom.fauxBold, dom.fauxItalic);
  const size = Math.max(1, round(dom.size * sy, 10));

  const real = t.runs.filter((r) => r.text.replace(/\s/g, ''));
  const loss: TextLoss = {
    mixed: new Set(real.map(styleKey)).size > 1,
    underline: real.some((r) => r.underline),
    strike: real.some((r) => r.strike),
    smallCaps: real.some((r) => r.caps === 1),
    justify: t.align === 'justify',
    caps: dom.caps === 2,
  };

  // Where the first baseline starts. Point text sits on its anchor; paragraph text hangs from the top of its box.
  const align: TextNode['align'] = t.align === 'center' || t.align === 'right' ? t.align : 'left';
  let ax = 0;
  let ay = 0;
  let wrap: number | undefined;
  if (t.paragraph && t.box) {
    const [l, top, r] = t.box;
    ax = align === 'center' ? (l + r) / 2 : align === 'right' ? r : l;
    ay = top + dom.size * BASELINE_IN_BOX;
    // the lines are laid out before the across stretch, so the box is as wide as it is in the layer's own height scale
    wrap = round((r - l) * sy, 10);
  }
  const x = tx + xx * ax + yx * ay;
  const y = ty + xy * ax + yy * ay;

  const lineHeight = dom.leading !== null ? dom.leading / dom.size : t.autoLeading;
  const text = loss.caps ? t.text.toUpperCase() : t.text;
  const rotation = (Math.atan2(xy, xx) * 180) / Math.PI;
  const node: TextNode = {
    type: 'text',
    name: base.name,
    hidden: base.hidden,
    opacity: base.opacity,
    blend: base.blend,
    clip: base.clip,
    text,
    font: f.family,
    weight: f.weight,
    italic: f.italic,
    size,
    color: dom.color,
    align,
    lineHeight: round(lineHeight),
    letterSpacing: round((dom.tracking / 1000) * size),
    x: round(x),
    y: round(y),
    rotation: Math.abs(rotation) > 0.01 ? round(rotation) : 0,
    scaleX: round(sx / sy, 1000),
    fontFile: dom.font,
    ...(wrap ? { wrap } : {}),
  };
  return { node, loss };
}
