/**
 * Starter templates for the New dialog. Each one builds its document in code, so they're tiny and follow the
 * format as it changes. `make()` returns a fresh document every time.
 */
import type { Doc } from '../core/format';
import { makeBlankPixel, makeBlankVector } from './blank';
import { makeBlink } from './blink';
import { makeBouncingBall } from './bouncing-ball';
import { makeFlourSack } from './flour-sack';
import { makeHeroSprite } from './hero-sprite';
import { makeSparkle } from './sparkle';
import { makeTileset } from './tileset';

export interface Template {
  id: string;
  name: string;
  /** What it is, then a "try this next" line. */
  blurb: string;
  kind: 'vector' | 'pixel';
  /** The frame index that makes the best gallery thumbnail (0 when missing). */
  thumbnail?: () => number;
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
    id: 'tileset',
    name: 'Tileset and level',
    blurb: 'Five 16x16 tiles (with animated water) and a small level painted on tilemap layers. Try it: double-click the Grass tile in the Tileset panel, give it some flowers, then press Done and watch the whole level change.',
    kind: 'pixel',
    thumbnail: () => 0,
    make: makeTileset,
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
    blurb: 'A 32x32 pixel grid at 12 fps, each pixel 8 screen pixels wide. Try it: draw a 2-frame blink, then press play.',
    kind: 'pixel',
    make: makeBlankPixel,
  },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
