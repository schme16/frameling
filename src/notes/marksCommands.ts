// The commands for marks drawn over the picture: pick the pen, show or hide them all, clear them.
import { registerCommands, type Command } from '../core/registry';
import { store } from '../core/store';
import { notify } from '../io/notify';
import { countMarks } from './marks';
import { clearMarks, ensureShown } from './marksOps';
import { getMarksState, setMarksSaved, type MarkTool } from './marksState';

const HELP = 'canvas-marks';

/** Picks the Marks tool with a pen already chosen, so the palette can go straight to "Draw an arrow". */
const pen = (shape: MarkTool, label: string, description: string, keywords: string[]): Command => ({
  id: `marks.${shape}`,
  label,
  category: 'View',
  description,
  help: HELP,
  keywords: ['marks', 'annotate', 'markup', 'draw over', 'review', ...keywords],
  run: () => {
    setMarksSaved({ shape });
    ensureShown();
    store().setUi({ tool: 'marks' });
  },
});

registerCommands([
  pen('arrow', 'Draw an arrow on the picture', 'Picks the Marks tool with the arrow pen: drag from the tail to the tip. Marks never come out in an export.', ['arrow', 'point', 'pointer']),
  pen('circle', 'Draw a circle on the picture', 'Picks the Marks tool with the circle pen: drag across the thing you want to ring. Marks never come out in an export.', ['circle', 'ring', 'oval', 'highlight']),
  pen('scribble', 'Sketch on the picture', 'Picks the Marks tool with the freehand pen, for a quick scribble over the drawing. Marks never come out in an export.', ['sketch', 'scribble', 'freehand', 'pen']),
  pen('text', 'Write words on the picture', 'Picks the Marks tool with the words pen: click, then type. Marks never come out in an export.', ['text', 'words', 'label', 'caption']),
  pen('erase', 'Rub out marks', 'Picks the Marks tool to rub marks out: click or drag over them.', ['erase', 'remove', 'delete']),
  {
    id: 'marks.toggleShow',
    label: 'Marks',
    category: 'View',
    keys: ['Mod+Alt+A'],
    description: 'Show or hide every mark drawn over the picture. They stay in the file, and are never in an export either way.',
    help: HELP,
    keywords: ['marks', 'show marks', 'hide marks', 'annotations', 'markup', 'arrows', 'circles', 'review'],
    checked: () => getMarksState().show,
    run: () => setMarksSaved({ show: !getMarksState().show }),
  },
  {
    id: 'marks.clearFrame',
    label: 'Clear the marks on this frame',
    category: 'View',
    description: 'Takes the marks you can see on this frame out of the file. Undo brings them back.',
    help: HELP,
    keywords: ['marks', 'clear', 'remove', 'delete', 'tidy', 'annotations'],
    enabled: (s) => countMarks(s.doc, s.ui.frame).here > 0,
    run: () => {
      const n = clearMarks('frame');
      if (n) notify(`Cleared ${n} mark${n === 1 ? '' : 's'} on this frame. Undo brings ${n === 1 ? 'it' : 'them'} back.`, 'info');
    },
  },
  {
    id: 'marks.clearAll',
    label: 'Clear every mark',
    category: 'View',
    description: 'Takes every mark on this page out of the file, once the pass is finished. Undo brings them back.',
    help: HELP,
    keywords: ['marks', 'clear', 'remove', 'delete', 'tidy', 'annotations', 'all'],
    enabled: (s) => countMarks(s.doc, s.ui.frame).all > 0,
    run: () => {
      const n = clearMarks('all');
      if (n) notify(`Cleared ${n} mark${n === 1 ? '' : 's'}. Undo brings ${n === 1 ? 'it' : 'them'} back.`, 'info');
    },
  },
]);
