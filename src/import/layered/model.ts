// What a layered file (Photoshop, OpenRaster) comes to once it is read: a tree of picture layers and groups, bottom
// first, plus plain sentences about what it could not carry. The readers (psd.ts, ora.ts) make this; build.ts turns it
// into Frameling layers.
import type { BlendMode } from '../../core/format';

export interface RasterNode {
  type: 'layer';
  name: string;
  hidden: boolean;
  locked?: boolean;
  /** 0 to 1. */
  opacity: number;
  blend: BlendMode;
  /** Only shows where the layer below has picture. */
  clip: boolean;
  /** Where the pixels sit on the canvas (may hang over the edge; may be negative). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** RGBA, straight alpha, width x height. Empty (length 0) for a layer with nothing on it. */
  pixels: Uint8ClampedArray;
}

export interface GroupNode {
  type: 'group';
  name: string;
  hidden: boolean;
  opacity: number;
  blend: BlendMode;
  /** Bottom first. */
  children: LayerNode[];
}

/**
 * A text layer that came in as words, not a picture. Everything a Frameling text shape holds: one font, size, colour,
 * spacing and alignment for the whole text, placed by where its first baseline starts.
 */
export interface TextNode {
  type: 'text';
  name: string;
  hidden: boolean;
  opacity: number;
  blend: BlendMode;
  clip: boolean;
  locked?: boolean;
  /** The words, with `\n` between lines. */
  text: string;
  /** The family to draw in (set to the nearest font here when the file's font is not on this computer). */
  font: string;
  weight: number;
  italic: boolean;
  /** Document pixels. */
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** A multiple of the size. */
  lineHeight: number;
  /** Document pixels between letters. */
  letterSpacing: number;
  /** Where the first baseline starts (for centred or right text, the middle or the right end), in document pixels. */
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
  /** Across stretch relative to the height (1 = none). */
  scaleX: number;
  /** The font as the file named it, e.g. "CenturyGothic-Bold" (the family above is the nearest one here when that font is not). */
  fontFile: string;
  /** Paragraph text: the width of the box it wraps in, document pixels (the lines are broken to fit when the font is settled). */
  wrap?: number;
}

export type LayerNode = RasterNode | GroupNode | TextNode;

export interface LayeredFile {
  format: 'psd' | 'ora';
  width: number;
  height: number;
  /** Bottom first. */
  nodes: LayerNode[];
  /** Things the file had that did not come across, as sentences. */
  left: string[];
  /** Good to know, not a loss. */
  info: string[];
}

/** A file that can't be read, with the reason in plain words. */
export class LayeredProblem extends Error {}

export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_PIXELS = 120_000_000;

/** Counts of things left out by name, turned into sentences at the end so each appears once. */
export class Leftovers {
  private map = new Map<string, { label: (n: number, names: string[]) => string; n: number; names: string[] }>();
  add(key: string, label: (n: number, names: string[]) => string, name?: string): void {
    const e = this.map.get(key) ?? { label, n: 0, names: [] };
    e.n++;
    if (name && e.names.length < 3) e.names.push(name);
    this.map.set(key, e);
  }
  sentences(): string[] {
    return [...this.map.values()].map((e) => e.label(e.n, e.names));
  }
  get size(): number {
    return this.map.size;
  }
}

export const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;

/** Names for a sentence: "Title" or "Title, Hero and 2 more". */
export function namesOf(names: string[], n: number): string {
  const quoted = names.map((x) => `"${x}"`);
  return n > names.length ? `${quoted.join(', ')} and ${n - names.length} more` : quoted.join(', ');
}
