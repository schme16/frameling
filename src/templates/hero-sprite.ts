import { newDoc, uid } from '../core/doc';
import type { Doc } from '../core/format';
import {
  addClip, addMarker, addPixelLayer, blankGrid, emptyOf, hold, pixelDrawing, stamp, swatchesFrom,
  type PixelPalette,
} from './build';

const GRID = 32;
// Pip: a round little creature with dog-eared ears and a sunny scarf. Palette keys: K outline, b body, d body shade,
// l belly, w eye shine, r cheek, s scarf, S scarf shade, G grass, E earth, e earth shade, h shadow.
const PALETTE: PixelPalette = {
  K: '#1d1b26',
  b: '#4fd1a5',
  d: '#2fa27d',
  l: '#c4f3e1',
  w: '#fffaf0',
  r: '#ff6f91',
  s: '#ffc94a',
  S: '#f2a91c',
  G: '#6abf4b',
  E: '#c98f5a',
  e: '#a8703f',
  h: '#1d1b2655',
};

// Pip facing us. Rows 0-13 are the body, and the legs are separate pieces so one body can walk on any of them.
const BODY_FRONT = [
  '................',
  '..KK........KK..',
  '.KbbK......KbbK.',
  '.KbbbKKKKKKbbbK.',
  '.KbbbbbbbbbbbbK.',
  'KbbbbbbbbbbbbbbK',
  'KbbbwKbbbbwKbbbK',
  'KbbbKKbbbbKKbbbK',
  'KbrrbbbbbbbbrrbK',
  'KbbbbbbKKbbbbbbK',
  '.KssssssssssssK.',
  '.KbbllllllllbbK.',
  '.KbbllllllllbbK.',
  '..KddbbbbbbddK..',
];
// Pip looking and leaning right, for running and jumping. The scarf trails behind.
const BODY_SIDE = [
  '................',
  '..KK........KK..',
  '.KbbK......KbbK.',
  '.KbbbKKKKKKbbbK.',
  '.KbbbbbbbbbbbbK.',
  'KbbbbbbbbbbbbbbK',
  'KbbbbbbbwKbbwKbK',
  'KbbbbbbbKKbbKKbK',
  'KbbbbbbbbbbbbrrK',
  'KbbbbbbbbbbKKbbK',
  'ssKssssssssssssK',
  'SSKbbllllllllbbK',
  '..KbbllllllllbbK',
  '...KddbbbbbbddK.',
];

// Legs: two rows each, drawn straight under the body (row 14 and 15 of the 16 row sprite).
const LEGS_STAND = ['..KbbKKKKKKbbK..', '..KKKK....KKKK..'];
const LEGS_TUCK = ['..KKKKKKKKKKKK..', '................'];
const LEGS_CONTACT_A = ['KKKK.KKKKKKKKbbK', '............KKKK'];
const LEGS_CONTACT_B = ['KbbKKKKKKKK.KKKK', 'KKKK............'];
const LEGS_PASS_L = ['..KbbKKKKKKKKK..', '..KKKK..........'];
const LEGS_PASS_R = ['..KKKKKKKKKbbK..', '..........KKKK..'];

// Frame row of the creature's top-left on the 32 grid: its feet land on row 29, the last row above the ground.
const OX = 8;
const OY = 14;

interface Look {
  body: readonly string[];
  legs: readonly string[];
  /** Body shift down (positive) or up (negative), in pixels. */
  dy?: number;
  /** Lift the whole creature off the ground. */
  up?: number;
  /** Body rows to cut out (squash) or repeat (stretch), by index in the body. */
  squash?: number[];
  stretch?: number[];
  blink?: boolean;
  /** Shift sideways, in pixels (negative is left). */
  dx?: number;
  /** Everything but the outline turns cream for one frame, the classic "ouch" flash. */
  flash?: boolean;
}

function frameGrid(look: Look): string[][] {
  const g = blankGrid(GRID, GRID);
  const up = look.up ?? 0;
  let body = [...look.body];
  // Closing the eyes is just taking the shine and top of each eye out (row 6 holds the eyes).
  if (look.blink) body = body.map((r, i) => (i === 6 ? r.replace(/wK/g, 'bb') : r));
  if (look.flash) body = body.map((r) => r.replace(/[^K.]/g, 'w'));
  if (look.squash) body = body.filter((_, i) => !look.squash!.includes(i));
  if (look.stretch) body = body.flatMap((r, i) => (look.stretch!.includes(i) ? [r, r] : [r]));
  // The body's last row sits on row 13 of the sprite, whatever its height.
  const bodyTop = OY + 14 - body.length + (look.dy ?? 0) - up;
  const ox = OX + (look.dx ?? 0);
  stamp(g, look.flash ? look.legs.map((r) => r.replace(/[^K.]/g, 'w')) : look.legs, ox, OY + 14 - up);
  stamp(g, body, ox, bodyTop);
  return g;
}

/** The soft shadow on the grass: wide on the ground, smaller as Pip goes up. */
function shadowGrid(half: number): string[][] {
  const g = blankGrid(GRID, GRID);
  for (let x = 16 - half; x < 16 + half; x++) g[30][x] = 'h';
  return g;
}

function groundGrid(): string[][] {
  const g = blankGrid(GRID, GRID);
  for (let x = 0; x < GRID; x++) {
    g[30][x] = 'G';
    g[31][x] = (x * 5) % 11 === 0 ? 'e' : 'E';
  }
  return g;
}

const IDLE: Look[] = [
  { body: BODY_FRONT, legs: LEGS_STAND },
  { body: BODY_FRONT, legs: LEGS_STAND, dy: 1 },
  { body: BODY_FRONT, legs: LEGS_STAND, blink: true },
  { body: BODY_FRONT, legs: LEGS_STAND, dy: 1 },
];
const RUN: Look[] = [
  { body: BODY_SIDE, legs: LEGS_CONTACT_A },
  { body: BODY_SIDE, legs: LEGS_PASS_R, dy: 1 },
  { body: BODY_SIDE, legs: LEGS_PASS_R },
  { body: BODY_SIDE, legs: LEGS_CONTACT_B },
  { body: BODY_SIDE, legs: LEGS_PASS_L, dy: 1 },
  { body: BODY_SIDE, legs: LEGS_PASS_L },
];
const JUMP: Look[] = [
  { body: BODY_SIDE, legs: LEGS_STAND, squash: [11, 12] },
  { body: BODY_SIDE, legs: LEGS_TUCK, stretch: [11], up: 9 },
  { body: BODY_SIDE, legs: LEGS_STAND, stretch: [11], up: 4 },
];
/** Half the shadow's width for each jump frame. */
const JUMP_SHADOW = [7, 4, 6];
// Knocked back, a flash, and back on its feet with eyes screwed shut.
const HURT: Look[] = [
  { body: BODY_FRONT, legs: LEGS_STAND, blink: true, dx: -2, up: 1 },
  { body: BODY_FRONT, legs: LEGS_STAND, flash: true, dx: -2, up: 1 },
  { body: BODY_FRONT, legs: LEGS_STAND, blink: true, dx: -1 },
];
// Wobbles, then sinks down flatter and flatter. The last pose is held (see DIE_HOLD).
const DIE: Look[] = [
  { body: BODY_FRONT, legs: LEGS_STAND, blink: true, dy: 1 },
  { body: BODY_FRONT, legs: LEGS_TUCK, blink: true, squash: [11, 12] },
  { body: BODY_FRONT, legs: LEGS_TUCK, blink: true, squash: [3, 4, 11, 12] },
  { body: BODY_FRONT, legs: LEGS_TUCK, blink: true, squash: [1, 3, 4, 5, 11, 12] },
];
const DIE_SHADOW = [7, 8, 8, 9];
/** How many frames the last "die" pose stays on screen (one drawing, held). */
const DIE_HOLD = 4;

/** A small original creature with idle, run, jump, hurt and die clips, in 32x32 pixel art. */
export function makeHeroSprite(): Doc {
  const looks = [...IDLE, ...RUN, ...JUMP, ...HURT, ...DIE];
  const halves = [...IDLE.map(() => 7), ...RUN.map(() => 7), ...JUMP_SHADOW, ...HURT.map(() => 7), ...DIE_SHADOW];
  const length = looks.length + DIE_HOLD - 1;
  const doc = emptyOf(newDoc({ name: 'Game hero sprite set', width: 256, height: 256, fps: 12, length, background: '#bfe6ff' }));
  swatchesFrom(doc, [
    ['Outline', PALETTE.K], ['Body', PALETTE.b], ['Body shade', PALETTE.d], ['Belly', PALETTE.l], ['Cheek', PALETTE.r],
    ['Scarf', PALETTE.s], ['Scarf shade', PALETTE.S], ['Grass', PALETTE.G], ['Earth', PALETTE.E], ['Cream', PALETTE.w],
  ]);

  // The ground is a reference layer: there to stand on while drawing, left out of exports so sprites come out clean.
  const ground = addPixelLayer(doc, 'Ground', 8);
  ground.reference = true;
  const shadow = addPixelLayer(doc, 'Shadow', 8);
  const hero = addPixelLayer(doc, 'Pip', 8);

  hold(ground, pixelDrawing(doc, groundGrid(), PALETTE).id, 0, length);

  looks.forEach((look, f) => {
    const n = f === looks.length - 1 ? DIE_HOLD : 1;
    hold(hero, pixelDrawing(doc, frameGrid(look), PALETTE).id, f, n);
    hold(shadow, pixelDrawing(doc, shadowGrid(halves[f]), PALETTE).id, f, n);
  });

  const at = (name: string, n: number, loop: boolean) => {
    const start = doc.clips.length ? Math.max(...doc.clips.map((c) => c.end)) + 1 : 0;
    addClip(doc, name, start, start + n - 1, loop);
  };
  at('idle', IDLE.length, true);
  at('run', RUN.length, true);
  at('jump', JUMP.length, false);
  at('hurt', HURT.length, false);
  at('die', DIE.length + DIE_HOLD - 1, false);
  // Feet hit the ground on the two contact frames of the run.
  addMarker(doc, 'footstep', 4);
  addMarker(doc, 'footstep', 7);
  // The clip flow a game would use: idle and run swap on triggers, the one-shots go back to idle at their end.
  const id = (name: string) => doc.clips.find((c) => c.name === name)!.id;
  doc.flow = {
    start: id('idle'),
    transitions: [
      { id: uid('t'), from: id('idle'), to: id('run'), when: 'trigger', trigger: 'run' },
      { id: uid('t'), from: id('run'), to: id('idle'), when: 'trigger', trigger: 'stop' },
      { id: uid('t'), from: id('idle'), to: id('jump'), when: 'trigger', trigger: 'jump' },
      { id: uid('t'), from: id('run'), to: id('jump'), when: 'trigger', trigger: 'jump' },
      { id: uid('t'), from: id('jump'), to: id('idle'), when: 'end' },
      { id: uid('t'), from: id('idle'), to: id('hurt'), when: 'trigger', trigger: 'hit' },
      { id: uid('t'), from: id('hurt'), to: id('idle'), when: 'end' },
      { id: uid('t'), from: id('hurt'), to: id('die'), when: 'trigger', trigger: 'hit' },
    ],
    positions: { [id('idle')]: { x: 10, y: 100 }, [id('run')]: { x: 190, y: 14 }, [id('jump')]: { x: 190, y: 186 }, [id('hurt')]: { x: 10, y: 270 }, [id('die')]: { x: 190, y: 340 } },
  };
  return doc;
}
