/** Moving a drawing without redrawing it: the commands behind Ctrl+Alt+arrows, the palette and the Timeline menu. */
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { findLayer } from '../core/doc';
import { celOffsetAt } from '../core/symbols';
import * as ops from './ops';
import { say } from './commands';
import { setTl, tl } from './state';

/** Moves what is picked: the drawing on the picked layer, or every drawing in its folder when that is switched on. */
function move(dx: number, dy: number): void {
  const o = tl().moveFolder ? ops.nudgeFolder(dx, dy) : ops.nudgeKey(dx, dy);
  say(o);
}

const direction = (id: string, word: string, dx: number, dy: number, key: string, keywords: string[]) => ({
  id,
  label: `Move drawing ${word}`,
  category: 'Timeline',
  keys: [`Mod+Alt+Arrow${key}`],
  description: `Move the drawing on this frame one pixel ${word} without redrawing it (one art pixel on a pixel layer). On a later frame of a held drawing it starts a new key there that shares the same drawing. Turn on "Move the whole folder together" to move every layer in the folder.`,
  help: 'timeline-move-drawing',
  keywords: ['nudge', 'offset', 'bob', 'breathe', 'shift', 'reposition', ...keywords],
  run: () => move(dx, dy),
});

registerCommands([
  direction('timeline.offsetLeft', 'left', -1, 0, 'Left', ['west']),
  direction('timeline.offsetRight', 'right', 1, 0, 'Right', ['east']),
  direction('timeline.offsetUp', 'up', 0, -1, 'Up', ['north']),
  direction('timeline.offsetDown', 'down', 0, 1, 'Down', ['south', 'head bob']),
  {
    id: 'timeline.offsetFolder',
    label: 'Move the whole folder together',
    category: 'Timeline',
    description: 'When on, moving a drawing moves every drawing in the same folder on this frame, so a head or a body bobs as one.',
    help: 'timeline-move-drawing',
    keywords: ['group', 'folder', 'together', 'bob', 'offset'],
    checked: () => tl().moveFolder,
    run: () => {
      const on = !tl().moveFolder;
      if (on && !ops.pickedFolderId()) toast("This layer isn't in a folder yet, so there is no group to move. Put it in a folder first.");
      setTl({ moveFolder: on });
    },
  },
  {
    id: 'timeline.offsetReset',
    label: 'Put drawing back where it was drawn',
    category: 'Timeline',
    description: 'Clears the move on this frame. With "Move the whole folder together" on, every drawing in the folder goes back.',
    help: 'timeline-move-drawing',
    keywords: ['offset', 'reset', 'undo move', 'unmove', 'nudge'],
    enabled: (s) => {
      const layer = findLayer(s.doc, s.ui.activeLayerId);
      return !!layer && !!celOffsetAt(layer, s.ui.frame);
    },
    run: () => void say(tl().moveFolder ? ops.resetFolderOffset() : ops.resetKeyOffset()),
  },
]);
