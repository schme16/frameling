// The "start something new" choices. Pixel presets give the pixel grid and the size of one pixel; the document
// itself is grid x pixel size, since the document is measured in screen-sized units.
import { newDoc } from '../core/doc';
import type { Doc } from '../core/format';
import { cleanDpi, DEFAULT_DPI } from '../core/units';
import { START_FRAMES } from '../pixel/units';

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
  /** Frames to start with (missing = the usual). Pixel presets are one picture: one frame. */
  length?: number;
  /** Pixel art: the art grid, for the card's label. */
  grid?: { width: number; height: number };
}

export const PRESETS: Preset[] = [
  { id: 'doodle', title: 'Doodle', blurb: 'A roomy wide page for sketching and cartoons.', icon: 'brush', width: 1280, height: 720, fps: 12 },
  { id: 'square', title: 'Square', blurb: 'Good for icons, stickers and posts.', icon: 'rect', width: 1080, height: 1080, fps: 12 },
  { id: 'game-sprite', title: 'Game sprite', blurb: 'Pixel art on a 64 by 64 grid, for characters and tiles.', icon: 'pixel', width: 64 * 8, height: 64 * 8, fps: 12, pixelSize: 8, length: START_FRAMES.picture, grid: { width: 64, height: 64 } },
  { id: 'tiny-sprite', title: 'Tiny sprite', blurb: 'Pixel art on a 32 by 32 grid. Chunky and charming.', icon: 'heart', width: 32 * 16, height: 32 * 16, fps: 12, pixelSize: 16, length: START_FRAMES.picture, grid: { width: 32, height: 32 } },
];

export interface CustomSpec {
  name: string;
  /** Pixels for vector art, or the grid size for pixel art. */
  width: number;
  height: number;
  fps: number;
  pixel: boolean;
  pixelSize: number;
  /** Dots per inch, for sizes in mm, cm, in or pt (missing = 96). Not used for pixel art. */
  dpi?: number;
  /**
   * Whether the drawing starts as an animation. On: the usual frames, played at `fps`. Off: one picture, and `fps` is
   * ignored (the form hides it). Missing = the way Custom worked before the tickbox: vector drawings animate, pixel ones
   * are one picture. The form always sets it.
   */
  animate?: boolean;
  /** The size you had in the other mode (vector or pixel art), kept so ticking Pixel art and unticking it puts your numbers back. */
  away?: { width: number; height: number };
}

export const clampInt = (n: number, lo: number, hi: number, fallback: number): number => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback);

/** What the form shows the first time, before anything has been typed. */
export const FIRST_SIZE = { vector: { width: 800, height: 600 }, pixel: { width: 64, height: 64 } } as const;
export const DEFAULT_FPS = 12;
export const NAME_START = 'Untitled';

export const DEFAULT_CUSTOM: CustomSpec = { name: NAME_START, ...FIRST_SIZE.vector, fps: DEFAULT_FPS, pixel: false, pixelSize: 8, animate: false };

/**
 * Ticks or unticks Pixel art. Each mode keeps its own size: the one you leave is set aside and the other comes back, so a
 * tick and an untick leaves you exactly where you started. The first time in a mode it gets that mode's usual size.
 */
export function setPixelMode(spec: CustomSpec, pixel: boolean): CustomSpec {
  if (spec.pixel === pixel) return spec;
  const back = spec.away ?? (pixel ? FIRST_SIZE.pixel : FIRST_SIZE.vector);
  return { ...spec, pixel, width: back.width, height: back.height, away: { width: spec.width, height: spec.height } };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const sizeLimit = (pixel: boolean) => (pixel ? 512 : 8192);

/** A saved spec read back (from storage or a file): anything odd falls back to the first-time values, sizes are held to their limits. */
export function cleanSpec(raw: unknown): Omit<CustomSpec, 'name'> {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pixel = r.pixel === true;
  const side = (v: unknown, key: 'width' | 'height', isPixel: boolean) => clampInt(num(v) ?? NaN, 1, sizeLimit(isPixel), (isPixel ? FIRST_SIZE.pixel : FIRST_SIZE.vector)[key]);
  const out: Omit<CustomSpec, 'name'> = {
    width: side(r.width, 'width', pixel),
    height: side(r.height, 'height', pixel),
    fps: clampInt(num(r.fps) ?? NaN, 1, 60, DEFAULT_FPS),
    pixel,
    pixelSize: clampInt(num(r.pixelSize) ?? NaN, 1, 64, 8),
    animate: r.animate === true,
  };
  const dpi = num(r.dpi);
  if (dpi !== undefined && cleanDpi(dpi) !== DEFAULT_DPI) out.dpi = cleanDpi(dpi);
  const a = r.away && typeof r.away === 'object' ? (r.away as Record<string, unknown>) : null;
  if (a) out.away = { width: side(a.width, 'width', !pixel), height: side(a.height, 'height', !pixel) };
  return out;
}

/**
 * What the Custom form starts from: your last settings, with the name back at Untitled. The name is the one thing not
 * kept, because two drawings with the same name is worse than typing it again.
 */
export function startingSpec(last: unknown): CustomSpec {
  return { name: NAME_START, ...cleanSpec(last) };
}

/** What to keep for next time: everything but the name. */
export function rememberable(spec: CustomSpec): Omit<CustomSpec, 'name'> {
  const { name: _name, ...rest } = spec;
  return cleanSpec(rest);
}

/** How many frames a Custom drawing starts with. Missing = the usual for vector, which `newDoc` picks. */
export function startLength(c: Pick<CustomSpec, 'pixel' | 'animate'>): number | undefined {
  if (c.animate === undefined) return c.pixel ? START_FRAMES.picture : undefined;
  if (c.pixel) return c.animate ? START_FRAMES.animation : START_FRAMES.picture;
  return c.animate ? undefined : START_FRAMES.picture;
}

/** Builds the document for a preset. */
export function docFromPreset(p: Preset, name = 'Untitled'): Doc {
  return newDoc({ name, width: p.width, height: p.height, fps: p.fps, ...(p.length ? { length: p.length } : {}), ...(p.pixelSize ? { pixel: { pixelSize: p.pixelSize } } : {}) });
}

/** Builds the document for the Custom card, keeping every number sensible. A picture (no animation) ignores the frame rate. */
export function docFromCustom(c: CustomSpec): Doc {
  const fps = c.animate === false ? DEFAULT_FPS : clampInt(c.fps, 1, 60, DEFAULT_FPS);
  const name = c.name.trim() || NAME_START;
  const length = startLength(c);
  if (c.pixel) {
    const pixelSize = clampInt(c.pixelSize, 1, 64, 8);
    const w = clampInt(c.width, 1, 512, 64);
    const h = clampInt(c.height, 1, 512, 64);
    return newDoc({ name, width: w * pixelSize, height: h * pixelSize, fps, ...(length ? { length } : {}), pixel: { pixelSize } });
  }
  const doc = newDoc({ name, width: clampInt(c.width, 1, 8192, 1280), height: clampInt(c.height, 1, 8192, 720), fps, ...(length ? { length } : {}) });
  const dpi = cleanDpi(c.dpi);
  if (dpi !== DEFAULT_DPI) doc.dpi = dpi;
  return doc;
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
  const map = doc.layers.find((l) => l.kind === 'tilemap');
  if (map && doc.tileset && doc.layers.every((l) => l.kind === 'tilemap')) {
    const cols = Math.ceil(doc.width / (doc.tileset.tileWidth * map.pixelSize));
    const rows = Math.ceil(doc.height / (doc.tileset.tileHeight * map.pixelSize));
    return `${cols} x ${rows} tiles`;
  }
  return `${doc.width} x ${doc.height}`;
}
