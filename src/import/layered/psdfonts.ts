// Fonts for Photoshop text: a PostScript name ("Montserrat-SemiBoldItalic") as a family, weight and slant, and the nearest font
// that is here when the file's own is not on this computer. Pure: whether a font is here is passed in, so tests run without
// a computer's font folders.
import { cssFont, SHIPPED_FONTS, type Measure } from '../../text/model';
import type { LayeredFile, TextNode } from './model';
import { namesOf, plural } from './model';

export interface PsdFont {
  /** "Century Gothic" */
  family: string;
  /** 100 to 900. */
  weight: number;
  italic: boolean;
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/hairline|thin/i, 100],
  [/extra\s*light|ultra\s*light/i, 200],
  [/light/i, 300],
  [/semi\s*bold|demi\s*bold|demi/i, 600],
  [/extra\s*bold|ultra\s*bold|heavy/i, 800],
  [/black/i, 900],
  [/bold/i, 700],
  [/medium/i, 500],
  [/regular|roman|book|normal/i, 400],
];

const strip = (t: string) => t.replace(/(PSMT|MT|PS)$/, '');
const spaced = (t: string) =>
  t
    .replace(/_/g, ' ')
    // a few names carry a capital in the middle of one word ("DejaVu"), which the camel-case split must not break
    .replace(/DejaVu/g, 'Dejavu')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([0-9])([A-Z][a-z])/g, '$1 $2')
    .replace(/Dejavu/g, 'DejaVu')
    .replace(/\s+/g, ' ')
    .trim();

/** Best effort: a PostScript name like `Montserrat-SemiBoldItalic` as a family, weight and slant. */
export function psFont(postscript: string, fauxBold = false, fauxItalic = false): PsdFont {
  const name = postscript.trim();
  const dash = name.indexOf('-');
  const family = spaced(strip(dash > 0 ? name.slice(0, dash) : name)) || 'Sans-serif';
  const style = strip(dash > 0 ? name.slice(dash + 1) : '');
  let weight = 400;
  for (const [re, w] of WEIGHT_WORDS) {
    if (re.test(style)) {
      weight = w;
      break;
    }
  }
  const italic = /italic|oblique|\bit$/i.test(style) || fauxItalic;
  if (fauxBold && weight < 600) weight = 700;
  return { family, weight, italic };
}

// ---------------------------------------------------------------- the nearest font here

export type FontKind = 'sans' | 'serif' | 'mono' | 'friendly';

const MONO = /mono|courier|consolas|menlo|monaco|typewriter|\bcode\b|terminal|fixed/i;
const SERIF = /times|georgia|garamond|palatino|bookman|baskerville|didot|caslon|minion|cambria|constantia|playfair|merriweather|lora\b|slab|rockwell|bodoni|century\s*(schoolbook|old)|cochin|hoefler|sabon|serif|roman/i;
const FRIENDLY = /comic|marker|chalk|hand|script|brush|rounded|fredoka|baloo|quicksand|varela|nunito|pacifico|bubble|kids|cartoon|papyrus|segoe\s*print|casual/i;

/** What a font is like, from its name: the nearest one is the same kind. */
export function fontKind(name: string): FontKind {
  if (MONO.test(name)) return 'mono';
  if (FRIENDLY.test(name)) return 'friendly';
  if (/sans/i.test(name)) return 'sans';
  if (SERIF.test(name)) return 'serif';
  return 'sans';
}

/** Fonts to try, best first, for each kind. The two Frameling ships are last, so they always answer. */
const CANDIDATES: Record<FontKind, string[]> = {
  serif: ['Georgia', 'Times New Roman', 'Liberation Serif', 'Noto Serif', 'DejaVu Serif', 'Cambria', 'Palatino Linotype', 'Garamond'],
  mono: ['Courier New', 'Liberation Mono', 'DejaVu Sans Mono', 'Consolas', 'Menlo', 'Monaco'],
  friendly: ['Nunito'],
  sans: ['Inter'],
};

/** The nearest font that is here: same kind, the shipped ones when nothing else is there. `here` says whether a family is. */
export function nearestFont(name: string, here: (family: string) => boolean): string {
  const kind = fontKind(name);
  for (const f of CANDIDATES[kind]) if (here(f)) return f;
  return kind === 'friendly' ? 'Nunito' : 'Inter';
}

// ---------------------------------------------------------------- settling a whole file

export interface FontEnv {
  /** Is a family on this computer (or one Frameling ships)? */
  has: (family: string) => boolean;
  /** Widths for breaking paragraph text into lines. */
  measure: Measure;
}

/**
 * Once the fonts here are known: text in a font that is not here takes the nearest one (and the file says so), and paragraph
 * text is broken into lines at the width of its box, since a Frameling text shape has no box to wrap in.
 */
export function settleText(file: LayeredFile, env: FontEnv): void {
  const shipped = new Set(SHIPPED_FONTS.map((f) => f.name.toLowerCase()));
  const here = (family: string) => shipped.has(family.toLowerCase()) || env.has(family);
  const missing = new Map<string, { label: string; use: string; names: string[]; n: number }>();
  let wrapped = 0;
  const visit = (nodes: LayeredFile['nodes']) => {
    for (const n of nodes) {
      if (n.type === 'group') visit(n.children);
      else if (n.type === 'text') {
        if (!here(n.font)) {
          const use = nearestFont(n.fontFile || n.font, here);
          // one sentence per family, however many weights of it the file uses
          const e = missing.get(n.font.toLowerCase()) ?? { label: n.font, use, names: [], n: 0 };
          e.n++;
          if (e.names.length < 3) e.names.push(n.name);
          missing.set(n.font.toLowerCase(), e);
          n.font = use;
        }
        if (n.wrap) {
          const lines = breakParagraph(n, env.measure);
          if (lines !== n.text) wrapped++;
          n.text = lines;
        }
      }
    }
  };
  visit(file.nodes);
  for (const e of missing.values()) {
    file.left.push(
      `The font "${e.label}" is not on this computer, so ${plural(e.n, 'text layer')} (${namesOf(e.names, e.n)}) ${e.n === 1 ? 'uses' : 'use'} ${e.use} instead. Install the font, then choose it in the text options to get the look back.`,
    );
  }
  if (wrapped) file.info.push(`${plural(wrapped, 'text layer')} had a box the words wrapped in. Frameling text has no box, so the lines were broken where the box broke them. Edit them as lines.`);
}

/** The text of a paragraph layer with a line break wherever the box would have wrapped it. */
export function breakParagraph(n: Pick<TextNode, 'text' | 'font' | 'weight' | 'italic' | 'size' | 'letterSpacing' | 'wrap'>, measure: Measure): string {
  const font = cssFont({ font: n.font, weight: n.weight, italic: n.italic }, n.size);
  const width = (t: string) => measure(t, font) + Math.max(0, [...t].length - 1) * n.letterSpacing;
  const limit = n.wrap ?? Infinity;
  const out: string[] = [];
  for (const para of n.text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && width(next) > limit) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out.join('\n');
}
