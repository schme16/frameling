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
import { questWord } from '../words/quests';

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
  title: questWord('quest.one-tiny-picture.title'),
  summary: questWord('quest.one-tiny-picture.summary'),
  minutes: 3,
  icon: 'heart',
  group: 'drawing',
  badge: { id: 'icon-maker', name: questWord('quest.one-tiny-picture.badge'), icon: 'heart', color: '--mint' },
  requires: [],
  finish: questWord('quest.one-tiny-picture.finish'),
  prepare: prepareWay('picture', 16),
  ready: (s) => isPixelDoc(s.doc),
  steps: [
    {
      id: 'draw',
      say: questWord('quest.one-tiny-picture.draw.say'),
      why: questWord('quest.one-tiny-picture.draw.why'),
      target: SEL.canvas,
      enter: pickPencil,
      done: (c) => paintedAt(c.state.doc, c.state.ui.frame) >= 8,
      show: () => void drawDemoPixelRing(),
      hint: questWord('quest.one-tiny-picture.draw.hint'),
      help: 'tool-pencil',
    },
    {
      id: 'swap',
      say: questWord('quest.one-tiny-picture.swap.say'),
      why: questWord('quest.one-tiny-picture.swap.why'),
      target: SEL.wells,
      done: (c) => c.state.ui.color === c.entry.state.ui.fillColor && c.state.ui.fillColor === c.entry.state.ui.color,
      show: 'pixel.swapPaintBack',
      help: 'pixel-wells',
    },
    {
      id: 'back',
      say: questWord('quest.one-tiny-picture.back.say'),
      target: SEL.canvas,
      done: (c) => coloursAt(c.state.doc, c.state.ui.frame) >= 2,
      show: () => void dabBack(),
      hint: questWord('quest.one-tiny-picture.back.hint'),
      help: 'pixel-wells',
    },
    {
      id: 'export',
      say: questWord('quest.one-tiny-picture.export.say'),
      why: questWord('quest.one-tiny-picture.export.why'),
      target: () => formatCard('png') ?? first(SEL.export, SEL.menubar),
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'png',
      show: () => {
        void getCommand('file.export')?.run();
        setTimeout(() => pickFormat('png'), 250);
      },
      hint: questWord('quest.one-tiny-picture.export.hint'),
      help: 'exporting',
    },
  ],
};

export const BOARD_BY_BOARD: Quest = {
  id: 'board-by-board',
  title: questWord('quest.board-by-board.title'),
  summary: questWord('quest.board-by-board.summary'),
  minutes: 4,
  icon: 'artboard',
  group: 'drawing',
  badge: { id: 'storyboarder', name: questWord('quest.board-by-board.badge'), icon: 'artboard', color: '--sky' },
  requires: [],
  finish: questWord('quest.board-by-board.finish'),
  prepare: prepareWay('boards', 32),
  ready: (s) => isPixelDoc(s.doc),
  steps: [
    {
      id: 'one',
      say: questWord('quest.board-by-board.one.say'),
      target: SEL.canvas,
      enter: pickPencil,
      done: (c) => inkedBoards(c.state.doc) >= 1,
      show: () => void drawDemoPixelRing(),
      hint: questWord('quest.board-by-board.one.hint'),
      help: 'pixel-ways',
    },
    {
      id: 'two',
      say: questWord('quest.board-by-board.two.say'),
      why: questWord('quest.board-by-board.two.why'),
      target: SEL.boards,
      done: (c) => inkedBoards(c.state.doc) >= 2,
      show: drawOnNextBoard,
      hint: questWord('quest.board-by-board.two.hint'),
      help: 'artboards',
    },
    {
      id: 'three',
      say: questWord('quest.board-by-board.three.say'),
      target: SEL.boards,
      done: (c) => inkedBoards(c.state.doc) >= 3,
      show: drawOnNextBoard,
      help: 'artboards',
    },
    {
      id: 'play',
      say: questWord('quest.board-by-board.play.say'),
      target: () => first('[data-command="artboards.playAll"]', SEL.boards),
      done: (c) => c.ran.has('artboards.playAll'),
      show: 'artboards.playAll',
      help: 'artboards',
    },
    {
      id: 'sheet',
      say: questWord('quest.board-by-board.sheet.say'),
      target: () => formatCard('sheet') ?? first(SEL.export, SEL.menubar),
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'sheet',
      show: () => {
        void getCommand('file.export')?.run();
        setTimeout(() => pickFormat('sheet'), 250);
      },
      hint: questWord('quest.board-by-board.sheet.hint'),
      help: 'export-sprite-sheets',
    },
  ],
};

export const CAST_ON_A_SHEET: Quest = {
  id: 'cast-on-a-sheet',
  title: questWord('quest.cast-on-a-sheet.title'),
  summary: questWord('quest.cast-on-a-sheet.summary'),
  minutes: 4,
  icon: 'grid',
  group: 'drawing',
  badge: { id: 'sheet-master', name: questWord('quest.cast-on-a-sheet.badge'), icon: 'grid', color: '--sunny' },
  requires: [],
  finish: questWord('quest.cast-on-a-sheet.finish'),
  prepare: prepareWay('sheet', 32),
  ready: (s) => isPixelDoc(s.doc),
  steps: [
    {
      id: 'hero',
      say: questWord('quest.cast-on-a-sheet.hero.say'),
      why: questWord('quest.cast-on-a-sheet.hero.why'),
      target: SEL.canvas,
      enter: pickPencil,
      done: (c) => inkedBoards(c.state.doc) >= 1,
      show: () => void drawDemoPixelRing(),
      help: 'pixel-ways',
    },
    {
      id: 'item',
      say: questWord('quest.cast-on-a-sheet.item.say'),
      target: SEL.boards,
      done: (c) => inkedBoards(c.state.doc) >= 2,
      show: drawOnNextBoard,
      hint: questWord('quest.cast-on-a-sheet.item.hint'),
      help: 'artboards',
    },
    {
      id: 'sheet',
      say: questWord('quest.cast-on-a-sheet.sheet.say'),
      target: () => formatCard('sheet') ?? first(SEL.export, SEL.menubar),
      done: (c) => c.probe.exportOpen && c.probe.exportFormat === 'sheet',
      show: () => {
        void getCommand('file.export')?.run();
        setTimeout(() => pickFormat('sheet'), 250);
      },
      hint: questWord('quest.cast-on-a-sheet.sheet.hint'),
      help: 'export-sprite-sheets',
    },
  ],
};

export const PIXEL_WAY_QUESTS: Quest[] = [ONE_TINY_PICTURE, BOARD_BY_BOARD, CAST_ON_A_SHEET];

/** Quests whose step cheers are the pixel ones (Chunky! Crisp!): these, Pixel pal and Shade and shine. */
export const PIXEL_QUESTS = new Set(['pixel-pal', 'shade-and-shine', ...PIXEL_WAY_QUESTS.map((q) => q.id)]);
