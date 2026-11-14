// A made-up brush library for the layout mockups: the four real starters, then a pack of pretend brushes in groups.
import { DEFAULT_BRUSH } from '../../core/doc';
import type { BrushSettings } from '../../core/format';
import { STARTERS } from '../model';

export interface MockBrush {
  id: string;
  name: string;
  group: string;
  brush: BrushSettings;
}

interface Pack {
  group: string;
  base: Partial<BrushSettings>;
  names: string[];
}

const PACKS: Pack[] = [
  { group: 'My brushes', base: { size: 7, thinning: 0.5, smoothing: 0.6, streamline: 0.6, taperEnd: 24 }, names: ['Morning doodle', 'Soft shading', 'Fat pen', 'Eyes and brows', 'Clean lines', 'Blocking in'] },
  { group: 'Inking', base: { size: 4, thinning: 0.5, smoothing: 0.7, streamline: 0.7 }, names: ['Technical pen', 'Fine liner', 'Brush pen', 'Dip pen', 'Felt tip', 'Gel pen', 'Rollerball', 'Crow quill', 'Sumi ink', 'Comic nib', 'Reed pen', 'Fountain pen'] },
  { group: 'Sketching', base: { size: 2, thinning: 0.3, smoothing: 0.25, streamline: 0.2 }, names: ['Soft pencil', 'Hard pencil', '2B graphite', '6B graphite', 'Mechanical', 'Carpenter', 'Charcoal stick', 'Willow charcoal', 'Conte', 'Blue pencil', 'Red pencil', 'Scribble'] },
  { group: 'Painting', base: { size: 24, thinning: 0.4, smoothing: 0.6, streamline: 0.5 }, names: ['Round gouache', 'Flat gouache', 'Oil bristle', 'Soft airbrush', 'Wet blend', 'Dry brush', 'Palette knife', 'Fan blender', 'Watercolour wash', 'Glaze', 'Impasto', 'Filbert'] },
  { group: 'Markers', base: { size: 26, thinning: 0, smoothing: 0.5, streamline: 0.4 }, names: ['Chisel marker', 'Bullet marker', 'Highlighter', 'Alcohol marker', 'Paint pen', 'Fat felt', 'Poster marker', 'Chalk marker', 'Sharpie', 'Brush marker', 'Dual tip', 'Whiteboard'] },
  { group: 'Calligraphy', base: { size: 10, thinning: 0.7, smoothing: 0.6, streamline: 0.6, taperStart: 20, taperEnd: 30 }, names: ['Copperplate', 'Italic nib', 'Gothic', 'Uncial', 'Brush script', 'Flourish', 'Spencerian', 'Chancery', 'Round hand', 'Foundational', 'Roman cap', 'Sign painter'] },
  { group: 'Texture and grain', base: { size: 16, thinning: 0.2, smoothing: 0.3, streamline: 0.3 }, names: ['Grainy', 'Stipple', 'Hatching', 'Cross hatch', 'Sponge', 'Spatter', 'Rough chalk', 'Pastel', 'Crayon', 'Wax', 'Canvas tooth', 'Salt'] },
  { group: 'Cartoon', base: { size: 9, thinning: 0.55, smoothing: 0.65, streamline: 0.65, taperStart: 12, taperEnd: 36 }, names: ['Bouncy outline', 'Squash line', 'Wobbly', 'Thick and thin', 'Cel ink', 'Toon fill', 'Rubber hose', 'Tapered tail', 'Doodle', 'Eyebrow', 'Whisker', 'Speed line'] },
  { group: 'Comics', base: { size: 6, thinning: 0.45, smoothing: 0.7, streamline: 0.75, taperStart: 6, taperEnd: 18 }, names: ['Panel border', 'G-pen', 'Maru pen', 'Kabura', 'Screentone dot', 'Action line', 'Focus line', 'Sound effect', 'Hair flow', 'Cross panel', 'Gutter', 'Bubble outline'] },
  { group: 'Pixel friendly', base: { size: 3, thinning: 0, smoothing: 0, streamline: 0.1, capStart: false, capEnd: false }, names: ['1px line', '2px line', 'Dither', 'Block', 'Pixel round', 'Pixel square', 'Outline', 'Shade', 'Highlight', 'Tile edge', 'Sprite ink', 'Corner'] },
  { group: 'Effects', base: { size: 14, thinning: 0.8, smoothing: 0.4, streamline: 0.3, taperStart: 30, taperEnd: 50 }, names: ['Sparkle', 'Smoke wisp', 'Fire lick', 'Lightning', 'Ink drop', 'Splash', 'Comet', 'Magic trail', 'Dust', 'Rain', 'Steam', 'Glow'] },
  { group: 'Hair and fur', base: { size: 5, thinning: 0.7, smoothing: 0.5, streamline: 0.5, taperStart: 24, taperEnd: 40 }, names: ['Fine hair', 'Curl', 'Wavy', 'Fur short', 'Fur long', 'Whiskers', 'Feather', 'Grass blade', 'Mane', 'Eyelash', 'Beard', 'Tuft'] },
  { group: 'Lettering', base: { size: 12, thinning: 0.35, smoothing: 0.6, streamline: 0.6 }, names: ['Chalkboard', 'Marquee', 'Bubble letter', 'Sign shop', 'Retro script', 'Stencil', 'Graffiti', 'Handwritten', 'Block caps', 'Tall thin', 'Drop shadow line', 'Neon tube'] },
];

/** A little deterministic wobble so brushes in one pack are alike but not the same. */
const jitter = (i: number, n: number): number => 0.75 + ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.6;

const mk = (group: string, name: string, base: Partial<BrushSettings>, k: number, i: number): MockBrush => {
  const b = { ...DEFAULT_BRUSH, ...base };
  return {
    id: `mock:${group}:${k}`,
    name,
    group,
    brush: { ...b, size: Math.max(1, Math.round(b.size * jitter(i, 1))), thinning: Math.min(1, Math.max(0, b.thinning * jitter(i, 2) - 0.05)) },
  };
};

/** `n` brushes: n = 4 is exactly what ships today, anything more adds packs on top. */
export function makeLibrary(n: number): MockBrush[] {
  const starters: MockBrush[] = STARTERS.map((p) => ({ id: p.id, name: p.name, group: 'Starters', brush: p.brush }));
  if (n <= starters.length) return starters.slice(0, n);
  const out = [...starters];
  for (const pack of PACKS) pack.names.forEach((name, k) => out.push(mk(pack.group, name, pack.base, k, out.length + k)));
  return out.slice(0, n);
}

/** Your own brushes: always first in a real library, so they get their own group. */
export const FAVOURITE_IDS = ['starter:ink', 'starter:marker', 'mock:Inking:0', 'mock:Painting:3', 'mock:Cartoon:7', 'mock:Calligraphy:4'];
export const RECENT_IDS = ['mock:Inking:1', 'starter:ink', 'mock:Cartoon:4', 'starter:pencil', 'mock:Markers:2', 'mock:Painting:1', 'mock:Sketching:3', 'mock:Texture and grain:2'];
