// "Shade and shine": a short pixel art quest using mirror drawing, the pixel pencil, the bucket, Shade and the
// outline. Listed in src/quests/library.ts after Pixel pal.
import { store } from '../core/store';
import { getCommand } from '../core/registry';
import type { Quest } from '../quests/types';
import { demoFill, ensureTinySpritePage } from '../quests/actions';
import { hasPixelLayer, paintedAt } from '../quests/predicates';
import { activeDrawing, activeGrid, paintActiveGrid, setActivePixels } from '../tools/edit';
import { gridPixels } from '../core/pixelBounds';
import { shadeInk } from './ink';
import { docPalette } from './palette';
import { getPixelSettings, setPixelSettings } from './settings';
import { activePixelLayer } from './tools';
import { questWord } from '../words/quests';

const SEL = {
  canvas: '.cv-root',
  pencil: '[data-command="tools.pencil"]',
  fill: '[data-command="tools.fill"]',
  shade: '[data-command="tools.shade"]',
  palette: '.px-palette',
  menu: '.ui-menubar [data-top]',
};

/** A little round blob outline, mirrored left to right, for "Show me how". */
function drawDemoBlob(): boolean {
  const layer = activePixelLayer();
  if (!layer) return false;
  const c = /^#([0-9a-f]{6})/i.exec(store().get().ui.color)?.[1] ?? '1d1b26';
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (
    paintActiveGrid('Draw pixels', (px, d) => {
      const cx = d.width / 2;
      const cy = d.height / 2;
      const rows = ['..####..', '.#....#.', '#......#', '#......#', '#......#', '.#....#.', '..####..'];
      rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch !== '#') return;
          const i = ((Math.floor(cy) - 3 + y) * d.width + (Math.floor(cx) - 4 + x)) * 4;
          px.set([rgb[0], rgb[1], rgb[2], 255], i);
        }),
      );
    }) === 'ok'
  );
}

/** Shades the lower half of the drawing one step darker, for "Show me how". */
function shadeDemo(): boolean {
  const d = activeDrawing();
  const g = activeGrid();
  if (!d || d.kind !== 'pixel' || !g) return false;
  const ink = shadeInk(docPalette(store().get().doc), false);
  const from = gridPixels(d, g.width, g.height);
  const out = new Uint8ClampedArray(from);
  const c = new Uint8Array(4);
  for (let y = Math.floor(g.height / 2) + 1; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const i = (y * g.width + x) * 4;
      if (ink.color(x, y, from, i, c)) out.set(c, i);
    }
  return setActivePixels('Shade pixels', out) === 'ok';
}

export const SHADE_AND_SHINE: Quest = {
  id: 'shade-and-shine',
  title: questWord('quest.shade-and-shine.title'),
  summary: questWord('quest.shade-and-shine.summary'),
  minutes: 4,
  icon: 'shade',
  badge: { id: 'shade-and-shine', name: questWord('quest.shade-and-shine.badge'), icon: 'shade', color: '--grape' },
  requires: ['first-animation'],
  finish: questWord('quest.shade-and-shine.finish'),
  prepare: ensureTinySpritePage,
  ready: hasPixelLayer,
  steps: [
    {
      id: 'mirror',
      say: questWord('quest.shade-and-shine.mirror.say'),
      why: questWord('quest.shade-and-shine.mirror.why'),
      target: SEL.canvas,
      done: (c) => c.ran.has('pixel.mirror') || getPixelSettings().symmetry !== 'off',
      show: () => setPixelSettings({ symmetry: 'h' }),
      help: 'pixel-mirror',
    },
    {
      id: 'outline',
      say: questWord('quest.shade-and-shine.outline.say'),
      target: SEL.pencil,
      enter: () => store().setUi({ tool: 'pencil', color: '#1d1b26', strokeOn: true, fillColor: '#4f9a45' }),
      done: (c) => paintedAt(c.state.doc, c.state.ui.frame) >= 10,
      show: () => void drawDemoBlob(),
      hint: questWord('quest.shade-and-shine.outline.hint'),
      help: 'tool-pencil',
    },
    {
      id: 'fill',
      say: questWord('quest.shade-and-shine.fill.say'),
      target: SEL.fill,
      enter: () => store().setUi({ tool: 'fill' }),
      done: (c) => c.edits.includes('Fill'),
      show: () => void demoFill(),
      hint: questWord('quest.shade-and-shine.fill.hint'),
      help: 'fill',
    },
    {
      id: 'shade',
      say: questWord('quest.shade-and-shine.shade.say'),
      why: questWord('quest.shade-and-shine.shade.why'),
      target: SEL.shade,
      enter: () => {
        store().setUi({ tool: 'shade' });
        setPixelSettings({ shadeLighter: false });
      },
      done: (c) => c.edits.includes('Shade pixels'),
      show: () => void shadeDemo(),
      hint: questWord('quest.shade-and-shine.shade.hint'),
      help: 'tool-shade',
    },
    {
      id: 'shine',
      say: questWord('quest.shade-and-shine.shine.say'),
      target: SEL.shade,
      enter: () => setPixelSettings({ shadeLighter: true }),
      done: (c) => c.edits.includes('Shade pixels'),
      hint: questWord('quest.shade-and-shine.shine.hint'),
      help: 'tool-shade',
    },
    {
      id: 'edge',
      say: questWord('quest.shade-and-shine.edge.say'),
      why: questWord('quest.shade-and-shine.edge.why'),
      target: SEL.menu,
      done: (c) => c.edits.includes('Add outline'),
      show: () => void getCommand('pixel.outline')?.run(),
      help: 'pixel-outline',
    },
  ],
};
