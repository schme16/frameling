// The "start something new" choices. Pixel presets give the pixel grid and the size of one pixel; the document
// itself is grid x pixel size, since the document is measured in screen-sized units.
import { newDoc } from '../core/doc';
import type { Doc } from '../core/format';

export interface Preset {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  width: number;
  height: number;
  fps: number;
  /** Pixel art: the size of one art pixel in document units. */
  pixelSize?: number;
  /** Pixel art: the art grid, for the card's label. */
  grid?: { width: number; height: number };
}

export const PRESETS: Preset[] = [
  { id: 'doodle', title: 'Doodle', blurb: 'A roomy wide page for sketching and cartoons.', icon: 'brush', width: 1280, height: 720, fps: 12 },
  { id: 'square', title: 'Square', blurb: 'Good for icons, stickers and posts.', icon: 'rect', width: 1080, height: 1080, fps: 12 },
  { id: 'game-sprite', title: 'Game sprite', blurb: 'Pixel art on a 64 by 64 grid, for characters and tiles.', icon: 'pixel', width: 64 * 8, height: 64 * 8, fps: 12, pixelSize: 8, grid: { width: 64, height: 64 } },
  { id: 'tiny-sprite', title: 'Tiny sprite', blurb: 'Pixel art on a 32 by 32 grid. Chunky and charming.', icon: 'heart', width: 32 * 16, height: 32 * 16, fps: 12, pixelSize: 16, grid: { width: 32, height: 32 } },
];

export interface CustomSpec {
  name: string;
  /** Pixels for vector art, or the grid size for pixel art. */
  width: number;
  height: number;
  fps: number;
  pixel: boolean;
  pixelSize: number;
}

export const clampInt = (n: number, lo: number, hi: number, fallback: number): number => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback);

/** Builds the document for a preset. */
export function docFromPreset(p: Preset, name = 'Untitled'): Doc {
  return newDoc({ name, width: p.width, height: p.height, fps: p.fps, ...(p.pixelSize ? { pixel: { pixelSize: p.pixelSize } } : {}) });
}

/** Builds the document for the Custom card, keeping every number sensible. */
export function docFromCustom(c: CustomSpec): Doc {
  const fps = clampInt(c.fps, 1, 60, 12);
  const name = c.name.trim() || 'Untitled';
  if (c.pixel) {
    const pixelSize = clampInt(c.pixelSize, 1, 64, 8);
    const w = clampInt(c.width, 1, 512, 64);
    const h = clampInt(c.height, 1, 512, 64);
    return newDoc({ name, width: w * pixelSize, height: h * pixelSize, fps, pixel: { pixelSize } });
  }
  return newDoc({ name, width: clampInt(c.width, 1, 8192, 1280), height: clampInt(c.height, 1, 8192, 720), fps });
}

/** True when nothing is drawn yet: no shapes and no coloured pixels in any drawing. Blank starters show as sizes. */
export function isBlankDoc(doc: Doc): boolean {
  for (const d of Object.values(doc.drawings)) {
    if (d.kind === 'vector' ? d.shapes.length > 0 : d.kind === 'tilemap' ? d.cells.some((c) => c !== 0) : d.kind === 'camera' ? false : d.pixels.some((v, i) => i % 4 === 3 && v !== 0)) return false;
  }
  return true;
}

/** A starter's size the way the cards say it: "1280 x 720", or "32 x 32 pixels" for pixel art. */
export function sizeLabel(doc: Doc): string {
  const px = doc.layers.find((l) => l.kind === 'pixel');
  if (px && px.kind === 'pixel' && doc.layers.every((l) => l.kind === 'pixel')) return `${Math.ceil(doc.width / px.pixelSize)} x ${Math.ceil(doc.height / px.pixelSize)} pixels`;
  return `${doc.width} x ${doc.height}`;
}
