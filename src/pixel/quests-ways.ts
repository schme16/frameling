// Pixel quests, one for each way to build a sprite: One tiny picture, Board by board, A cast on one sheet. (The
// animation way's quest is Pixel pal.) Listed in src/quests/library.ts.
import { getCommand } from '../core/registry';
import { store } from '../core/store';
import type { Doc, SpriteWay } from '../core/format';
import { artboardsOf, contentOf, goToBoard } from './boards';
import { applyWorkspace } from '../ui/dock';
import { paintActiveGrid } from '../tools/edit';
import { drawDemoPixelRing, freshPage } from '../quests/actions';
import { formatCard, pickFormat } from '../quests/probe';
import { paintedAt, paintedPixels } from '../quests/predicates';
import type { Quest } from '../quests/types';
import { isPixelDoc, newSpriteDoc, wayOf } from './way';

const SEL = {
  canvas: '.cv-root',
  pencil: '[data-command="tools.pencil"]',
  wells: '.px-wells',
  export: '[data-command="file.export"]',
  menubar: '.ui-menubar [data-top]',
  boards: '.ab-list',
};

/** The first of these selectors that is on screen. */
const first = (...sels: string[]): Element | null => {
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
};

/** The sprite for a quest: the one open when it is a blank sprite built this way, else a fresh one. */
function prepareWay(way: SpriteWay, size: number) {
  return async (): Promise<boolean> => {
    applyWorkspace('pixel');
    const d = store().get().doc;
    if (isPixelDoc(d) && wayOf(d) === way && inkedBoards(d) === 0) return true;
    return freshPage(() => newSpriteDoc({ way, width: size, height: size }));
  };
}

/** How many boards have any colour on them, on any frame. */
export function inkedBoards(doc: Doc): number {
  let n = 0;
  for (const a of artboardsOf(doc)) {
    const c = contentOf(doc, a.id);
    if (c?.layers.some((l) => l.cels.some((cel) => paintedPixels(doc.drawings[cel.drawingId]) > 0))) n++;
  }
  return n;
}

/** How many different colours are on the open frame (clear pixels don't count). */
export function coloursAt(doc: Doc, frame: number): number {
  const seen = new Set<string>();
  for (const l of doc.layers) {
    if (l.kind !== 'pixel') continue;
    const cel = l.cels.find((c) => frame >= c.start && frame < c.start + c.length);
    const d = cel ? doc.drawings[cel.drawingId] : undefined;
    if (d?.kind !== 'pixel') continue;
    for (let i = 0; i < d.pixels.length; i += 4) if (d.pixels[i + 3] > 0) seen.add(`${d.pixels[i]},${d.pixels[i + 1]},${d.pixels[i + 2]}`);
  }
  return seen.size;
}

/** Dabs a few pixels of the Back colour near the top left of the picture, for "Show me how". */
function dabBack(): boolean {
  const back = /^#([0-9a-f]{6})/i.exec(store().get().ui.fillColor ?? '')?.[1];
  if (!back) return false;
  const rgb = [0, 2, 4].map((i) => parseInt(back.slice(i, i + 2), 16));
  return (
    paintActiveGrid('Draw pixels', (px, d) => {
      for (const [x, y] of [[3, 3], [4, 3], [3, 4]]) px.set([rgb[0], rgb[1], rgb[2], 255], (y * d.width + x) * 4);
    }) === 'ok'
  );
}

/** Opens the next board that has no drawing on it yet, and draws a ring there, for "Show me how". */
function drawOnNextBoard(): void {
  const doc = store().get().doc;
  const next = artboardsOf(doc).find((a) => {
    const c = contentOf(doc, a.id);
    return !c?.layers.some((l) => l.cels.some((cel) => paintedPixels(doc.drawings[cel.drawingId]) > 0));
  });
  if (next) goToBoard(next.id);
  void drawDemoPixelRing();
}

const pickPencil = () => store().setUi({ tool: 'pencil', color: '#ff6f91', fillColor: '#ffc94a', strokeOn: true });

export const ONE_TINY_PICTURE: Quest = {
  id: 'one-tiny-picture',
  title: 'One tiny picture',
  summary: 'Draw a little heart on a 16 by 16 picture, give it a second colour, and export it as a PNG.',
  minutes: 3,
  icon: 'heart',
  group: 'drawing',
  badge: { id: 'icon-maker', name: 'Icon Maker', icon: 'heart', color: '--mint' },
  requires: [],
  finish: 'A whole icon from a handful of pixels! Keep going: a coin, a key, a potion. Quill is cheering.',
  prepare: prepareWay('picture', 16),
  ready: (s) => isPixelDoc(s.doc),
  steps: [
    {
      id: 'draw',
      say: 'Draw a little heart with the Pencil. Every click paints one chunky pixel.',
      why: 'The grid is 16 by 16, so a heart is only a few pixels wide. Wobbly is fine.',
      target: SEL.canvas,
      enter: pickPencil,
      done: (c) => paintedAt(c.state.doc, c.state.ui.frame) >= 8,
      show: () => void drawDemoPixelRing(),
      hint: 'Click and drag over the grid. Paint is the front square at the top of the Palette.',
      help: 'tool-pencil',
    },
    {
      id: 'swap',
      say: 'Press X to swap Paint and Back. Watch the two big squares at the top of the Palette trade places.',
      why: 'Paint is the colour you draw with. Back is your second colour, always one key away.',
      target: SEL.wells,
      done: (c) => c.state.ui.color === c.entry.state.ui.fillColor && c.state.ui.fillColor === c.entry.state.ui.color,
      show: 'pixel.swapPaintBack',
      help: 'pixel-wells',
    },
    {
      id: 'back',
      say: 'Right-click the grid to paint with Back. Dab a few pixels for a shine.',
      target: SEL.canvas,
      done: (c) => coloursAt(c.state.doc, c.state.ui.frame) >= 2,
      show: () => void dabBack(),
      hint: 'Right-click and drag, just like drawing. A trackpad does it with a two finger tap.',
      help: 'pixel-wells',
    },
    {
      id: 'export',
      say: 'Open Export and choose PNG picture (it lives under More formats).',
      why: 'You do not have to save anything: close the window whenever you like.',
      target: () => formatCard('png') ?? first(SEL.export, SEL.menubar),
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'png',
      show: () => {
        void getCommand('file.export')?.run();
        setTimeout(() => pickFormat('png'), 250);
      },
      hint: 'File, then Export. PNG picture is the plain still image.',
      help: 'exporting',
    },
  ],
};

export const BOARD_BY_BOARD: Quest = {
  id: 'board-by-board',
  title: 'Board by board',
  summary: 'Draw three frames on three boards, play them in order, and export them as a sprite sheet.',
  minutes: 4,
  icon: 'artboard',
  group: 'drawing',
  badge: { id: 'storyboarder', name: 'Storyboarder', icon: 'artboard', color: '--sky' },
  requires: [],
  finish: 'Three boards, one animation! Each board is a frame, and the sheet holds them all in order.',
  prepare: prepareWay('boards', 32),
  ready: (s) => isPixelDoc(s.doc),
  steps: [
    {
      id: 'one',
      say: 'Draw something on Frame 1 with the Pencil. It is the first frame of your animation.',
      target: SEL.canvas,
      enter: pickPencil,
      done: (c) => inkedBoards(c.state.doc) >= 1,
      show: () => void drawDemoPixelRing(),
      hint: 'A blob, a face, a ball: anything that can move a little next.',
      help: 'pixel-ways',
    },
    {
      id: 'two',
      say: 'Click Frame 2 in the Artboards panel and draw it a little different.',
      why: 'Every frame gets its own board. Tidy!',
      target: SEL.boards,
      done: (c) => inkedBoards(c.state.doc) >= 2,
      show: drawOnNextBoard,
      hint: 'Move something a pixel or two, so it looks like it is moving.',
      help: 'artboards',
    },
    {
      id: 'three',
      say: 'Once more: Frame 3.',
      target: SEL.boards,
      done: (c) => inkedBoards(c.state.doc) >= 3,
      show: drawOnNextBoard,
      help: 'artboards',
    },
    {
      id: 'play',
      say: 'Press Play all in order in the Artboards panel, and watch them go.',
      target: () => first('[data-command="artboards.playAll"]', SEL.boards),
      done: (c) => c.ran.has('artboards.playAll'),
      show: 'artboards.playAll',
      help: 'artboards',
    },
    {
      id: 'sheet',
      say: 'Open Export and choose Sprite sheet. Every board becomes one frame.',
      target: () => formatCard('sheet') ?? first(SEL.export, SEL.menubar),
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'sheet',
      show: () => {
        void getCommand('file.export')?.run();
        setTimeout(() => pickFormat('sheet'), 250);
      },
      hint: 'The Sprite sheet card says "For games".',
      help: 'export-sprite-sheets',
    },
  ],
};

export const CAST_ON_A_SHEET: Quest = {
  id: 'cast-on-a-sheet',
  title: 'A cast on one sheet',
  summary: 'Draw a hero and a coin on their own boards, then pack them on one sheet for your game engine.',
  minutes: 4,
  icon: 'grid',
  group: 'drawing',
  badge: { id: 'sheet-master', name: 'Sheet Master', icon: 'grid', color: '--sunny' },
  requires: [],
  finish: 'A whole cast on one sheet, ready for Godot, Unity or Phaser. Add an enemy next!',
  prepare: prepareWay('sheet', 32),
  ready: (s) => isPixelDoc(s.doc),
  steps: [
    {
      id: 'hero',
      say: 'Draw your hero on the Hero board with the Pencil.',
      why: 'Every board is a sprite of its own. This one is already named Hero.',
      target: SEL.canvas,
      enter: pickPencil,
      done: (c) => inkedBoards(c.state.doc) >= 1,
      show: () => void drawDemoPixelRing(),
      help: 'pixel-ways',
    },
    {
      id: 'item',
      say: 'Click Item in the Artboards panel and draw a coin.',
      target: SEL.boards,
      done: (c) => inkedBoards(c.state.doc) >= 2,
      show: drawOnNextBoard,
      hint: 'A round blob with a shine is a fine coin.',
      help: 'artboards',
    },
    {
      id: 'sheet',
      say: 'Open Export and choose Sprite sheet. The boards pack onto one picture, with the data for your engine.',
      target: () => formatCard('sheet') ?? first(SEL.export, SEL.menubar),
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'sheet',
      show: () => {
        void getCommand('file.export')?.run();
        setTimeout(() => pickFormat('sheet'), 250);
      },
      hint: 'The Sprite sheet card says "For games". Pick Godot, Unity, Phaser or PixiJS under it.',
      help: 'export-sprite-sheets',
    },
  ],
};

export const PIXEL_WAY_QUESTS: Quest[] = [ONE_TINY_PICTURE, BOARD_BY_BOARD, CAST_ON_A_SHEET];

/** Quests whose step cheers are the pixel ones (Chunky! Crisp!): these, Pixel pal and Shade and shine. */
export const PIXEL_QUESTS = new Set(['pixel-pal', 'shade-and-shine', ...PIXEL_WAY_QUESTS.map((q) => q.id)]);
