/**
 * Starter templates for the New dialog. Each one builds its document in code, so they're tiny and follow the
 * format as it changes. `make()` returns a fresh document every time.
 */
import type { Doc } from '../core/format';
import { makeBlankLevel, makeBlankPixel, makeBlankVector } from './blank';
import { makeBlink } from './blink';
import { makeBouncingBall } from './bouncing-ball';
import { makeBouncingLogo } from './bouncing-logo';
import { makeCameraPan } from './camera-pan';
import { makeMorph } from './morph';
import { makeFlourSack } from './flour-sack';
import { makeHeroSprite } from './hero-sprite';
import { makeLipSync } from './lip-sync';
import { makeSparkle } from './sparkle';
import { makePuppet } from './puppet';
import { makeTileset } from './tileset';
import { makeWalkCycle } from './walk-cycle';
import { makeRunCycle } from './run-cycle';
import { makeExplosion } from './explosion';
import { makeStickers } from './stickers';
import { makeUiIcons } from './ui-icons';
import { makeTitleCard } from './title-card';
import { makeSpinner } from './spinner';
import { withSetup, type TemplateSetup } from './setup';

export interface Template {
  id: string;
  name: string;
  /** What it is, then a "try this next" line. */
  blurb: string;
  kind: 'vector' | 'pixel';
  /** The frame index that makes the best gallery thumbnail (0 when missing). */
  thumbnail?: () => number;
  /** Words to find it by (search, tooltips). */
  tags?: string[];
  /** How the app sets itself up when it opens (onion skin, the export it starts on). See setup.ts. */
  setup?: TemplateSetup;
  make(): Doc;
}

export const TEMPLATES: Template[] = [
  {
    id: 'bouncing-ball',
    name: 'Bouncing ball',
    blurb: 'The classic first exercise: a looping ball with squash and stretch. Try it: select frame 8 and redraw the squash with the paint bucket.',
    kind: 'vector',
    thumbnail: () => 8,
    make: makeBouncingBall,
  },
  {
    id: 'flour-sack-hop',
    name: 'Flour sack hop',
    blurb: 'A sack squashes down, jumps and lands with a wobble. Try it: turn on onion skin, then re-time the jump by dragging cels on the timeline.',
    kind: 'vector',
    thumbnail: () => 7,
    make: makeFlourSack,
  },
  {
    id: 'blink',
    name: 'Blink',
    blurb: 'A face that blinks: three frames of eyes on a 24-frame hold. Try it: stretch the open eyes longer, or add a second, slower blink.',
    kind: 'vector',
    thumbnail: () => 0,
    make: makeBlink,
  },
  {
    id: 'hero-sprites',
    name: 'Game hero sprite set',
    blurb: 'A little pixel creature with idle, run, jump, hurt and die clips and footstep markers. Try it: recolour the scarf, then export it for Godot, Unity or the web.',
    kind: 'pixel',
    thumbnail: () => 0,
    make: makeHeroSprite,
  },
  {
    id: 'sparkle-fx',
    name: 'Sparkle FX',
    blurb: 'A six-frame sparkle burst that loops. Try it: recolour the Sparks layer to make magic, fire or snow.',
    kind: 'pixel',
    thumbnail: () => 2,
    make: makeSparkle,
  },
  {
    id: 'bouncing-logo',
    name: 'Bouncing logo',
    blurb: 'A star drops in with a bounce, pops, spins and fades, all with in-betweens. Try it: click the Logo layer between two keys and pick a different easing in Symbol and motion.',
    kind: 'vector',
    thumbnail: () => 30,
    make: makeBouncingLogo,
  },
  {
    id: 'morphing-shapes',
    name: 'Morphing shapes',
    blurb: 'A square melts into a circle, a star, then back, with shape tweens. Try it: go to frame 15 and redraw the circle as a heart, then press play.',
    kind: 'vector',
    thumbnail: () => 20,
    make: makeMorph,
  },
  {
    id: 'camera-parallax',
    name: 'Camera and parallax',
    blurb: 'A camera pans across a valley and zooms in on a house, with far hills drifting slower. Try it: press Shift+C to look through the camera, or give the Near hills a different distance in the Camera panel.',
    kind: 'vector',
    thumbnail: () => 20,
    make: makeCameraPan,
  },
  {
    id: 'puppet',
    name: 'Paper doll puppet',
    blurb: 'A cut-out character with bones and a walk made from four poses. Try it: pick the Pose tool (Shift+K), go to frame 6 and drag a hand, or click Wave in the Rig panel.',
    kind: 'vector',
    thumbnail: () => 6,
    make: makePuppet,
  },
  {
    id: 'tileset',
    name: 'Tileset and level',
    blurb: 'Five 16x16 tiles (with animated water) and a small level painted on tilemap layers. Try it: double-click the Grass tile in the Tileset panel, give it some flowers, then press Done and watch the whole level change.',
    kind: 'pixel',
    thumbnail: () => 0,
    make: makeTileset,
  },
  {
    id: 'lip-sync',
    name: 'Lip sync mouth chart',
    blurb: 'A face with a mouth that has the ten standard talking shapes, with a little "hello" already on it. Try it: File > Import sound, then Frames and motion > Auto lip sync, and fix any mouth in the Lip sync panel.',
    kind: 'vector',
    thumbnail: () => 11,
    make: makeLipSync,
  },
  {
    id: 'walk-cycle',
    name: 'Walk cycle',
    blurb: 'A character walking on the spot: 8 drawings on twos, with onion skin already on so you see the drawings either side. Try it: go to a passing frame (marker) and lift the knee higher, then play.',
    kind: 'vector',
    thumbnail: () => 0,
    tags: ['walk', 'cycle', 'character', 'on twos', 'onion skin', 'loop'],
    setup: { onion: { enabled: true, before: 1, after: 1 }, export: { format: 'gif', loop: true } },
    make: makeWalkCycle,
  },
  {
    id: 'run-cycle',
    name: 'Run cycle',
    blurb: 'An 8-frame pixel runner on a 32x32 grid, with dust puffs on their own layer and footstep markers for game sounds. Try it: recolour the shirt with the paint bucket on every frame, then export a sprite sheet.',
    kind: 'pixel',
    thumbnail: () => 2,
    tags: ['run', 'cycle', 'pixel', 'sprite', 'game', 'character'],
    setup: { export: { format: 'sheet', scale: 'art' } },
    make: makeRunCycle,
  },
  {
    id: 'explosion-fx',
    name: 'Explosion and smoke',
    blurb: 'A bang drawn frame by frame, with sparks and smoke made by particles, and a glow on the fireball. Try it: select the Smoke layer and drag Particles > Wind, or Shuffle for a new puff.',
    kind: 'vector',
    thumbnail: () => 6,
    tags: ['explosion', 'smoke', 'fx', 'particles', 'fire', 'game', 'glow'],
    setup: { export: { format: 'sheet', transparent: true } },
    make: makeExplosion,
  },
  {
    id: 'sticker-pack',
    name: 'Sticker pack',
    blurb: 'Six die-cut emoji stickers, each a symbol, one per frame and named by a marker. Export is set up to save each as its own picture. Try it: double-click a sticker to change it, or drop one into another drawing.',
    kind: 'vector',
    thumbnail: () => 0,
    tags: ['sticker', 'emoji', 'icons', 'symbols', 'separate sprites', 'chat'],
    setup: { export: { format: 'sheet', sheet: { content: 'separate', separateFiles: true, engine: 'none', trim: true, padding: 2 } } },
    make: makeStickers,
  },
  {
    id: 'ui-icons',
    name: 'UI icon set',
    blurb: 'Twelve 16x16 pixel icons (heart, coin, key, gear...) sharing one palette, one per frame, ready to export as a named sprite sheet. Try it: draw a new icon on a new frame and add a marker to name it.',
    kind: 'pixel',
    thumbnail: () => 0,
    tags: ['icons', 'ui', 'pixel', '16x16', 'sprite sheet', 'game', 'hud'],
    setup: { export: { format: 'sheet', scale: 'art', sheet: { content: 'separate', layout: 'grid', columns: 4, trim: false, padding: 0 } } },
    make: makeUiIcons,
  },
  {
    id: 'title-card',
    name: 'Title card',
    blurb: 'A title that pops in letter by letter, a subtitle that slides up word by word, and a camera that eases back from a tilted close-up. Try it: double-click the title to type your own, then change its animation in the Text panel.',
    kind: 'vector',
    thumbnail: () => 60,
    tags: ['title', 'text', 'intro', 'camera', 'kinetic type', 'video'],
    setup: { export: { format: 'mp4' } },
    make: makeTitleCard,
  },
  {
    id: 'loading-spinner',
    name: 'Loading spinner',
    blurb: 'A ring of dots that turns with one in-between, looping with no jump, and a waving label. Export starts on a see-through GIF. Try it: double-click the ring to recolour the dots, or change the label.',
    kind: 'vector',
    thumbnail: () => 0,
    tags: ['spinner', 'loading', 'loop', 'tween', 'gif', 'apng', 'ui'],
    setup: { export: { format: 'gif', loop: true, transparent: true } },
    make: makeSpinner,
  },
  {
    id: 'blank-vector',
    name: 'Blank vector',
    blurb: 'A 1280x720 stage at 12 fps with a Colour layer under a Lines layer. Try it: draw something on frame 1, then add frame 2 and draw it again.',
    kind: 'vector',
    make: makeBlankVector,
  },
  {
    id: 'blank-pixel',
    name: 'Blank pixel',
    blurb: 'A 32x32 pixel grid at 12 fps with 4 frames to animate, each pixel 8 screen pixels wide. Try it: draw a 2-frame blink, then press play.',
    kind: 'pixel',
    make: makeBlankPixel,
  },
  {
    id: 'blank-level',
    name: 'Blank level',
    blurb: 'A 320x192 stage for 20 by 12 tiles of 16x16, with an empty tilemap layer. Try it: make a tile in the Tileset panel, then paint the level with it.',
    kind: 'pixel',
    make: makeBlankLevel,
  },
];

// Templates with a setup remember it for every document they make.
for (const t of TEMPLATES) if (t.setup) t.make = withSetup(t.make, t.setup);

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
