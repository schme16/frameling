// Align and Spread out in the command palette and the Edit menu. The buttons in the Properties panel run these same commands.
import { registerCommands, type Command } from '../core/registry';
import { store } from '../core/store';
import { alignSelection, canAlign, pickedCount, spreadSelection } from './align-ops';
import { getAlignTo, setAlignTo } from './align-settings';
import type { AlignKind } from './align';

const ALIGN: { kind: AlignKind; id: string; label: string; says: string; keywords: string[] }[] = [
  { kind: 'left', id: 'select.alignLeft', label: 'Align left', says: 'Line the picked shapes up on their left edges.', keywords: ['left edge', 'flush left'] },
  { kind: 'centre', id: 'select.alignCentre', label: 'Align centre', says: 'Line the picked shapes up on one vertical middle line (centre them side to side).', keywords: ['center', 'horizontal centre', 'centre horizontally', 'middle'] },
  { kind: 'right', id: 'select.alignRight', label: 'Align right', says: 'Line the picked shapes up on their right edges.', keywords: ['right edge', 'flush right'] },
  { kind: 'top', id: 'select.alignTop', label: 'Align top', says: 'Line the picked shapes up on their top edges.', keywords: ['top edge'] },
  { kind: 'middle', id: 'select.alignMiddle', label: 'Align middle', says: 'Line the picked shapes up on one horizontal middle line (centre them up and down).', keywords: ['vertical centre', 'centre vertically', 'center vertically'] },
  { kind: 'bottom', id: 'select.alignBottom', label: 'Align bottom', says: 'Line the picked shapes up on their bottom edges.', keywords: ['bottom edge'] },
];

const enabled = (): boolean => canAlign();

const commands: Command[] = [
  ...ALIGN.map(
    (a): Command => ({
      id: a.id,
      label: a.label,
      category: 'Edit',
      description: `${a.says} One shape alone lines up to the page. Press Ctrl+Z to undo.`,
      help: 'align-space-out',
      keywords: ['align', 'line up', 'arrange', 'distribute', ...a.keywords],
      enabled,
      run: () => void alignSelection(a.kind),
    }),
  ),
  {
    id: 'select.spreadAcross',
    label: 'Space out across',
    category: 'Edit',
    description: 'Make the gaps between three or more picked shapes the same, left to right. The outer two stay put.',
    help: 'align-space-out',
    keywords: ['distribute', 'distribute horizontally', 'even spacing', 'equal gaps', 'spread', 'space evenly', 'horizontal gap'],
    enabled: () => pickedCount() >= 3,
    run: () => void spreadSelection('across'),
  },
  {
    id: 'select.spreadDown',
    label: 'Space out down',
    category: 'Edit',
    description: 'Make the gaps between three or more picked shapes the same, top to bottom. The outer two stay put.',
    help: 'align-space-out',
    keywords: ['distribute', 'distribute vertically', 'even spacing', 'equal gaps', 'spread', 'space evenly', 'vertical gap'],
    enabled: () => pickedCount() >= 3,
    run: () => void spreadSelection('down'),
  },
  {
    id: 'select.alignToPage',
    label: 'Align to the page',
    category: 'Edit',
    description: 'Line several shapes up to the page instead of to their own box. One shape alone always lines up to the page.',
    help: 'align-space-out',
    keywords: ['align to', 'page', 'artboard', 'selection box', 'canvas'],
    checked: () => getAlignTo() === 'page',
    run: () => {
      setAlignTo(getAlignTo() === 'page' ? 'selection' : 'page');
      // Menus read the tick from the store's state, so give them a nudge to look again.
      store().setUi({});
    },
  },
];

registerCommands(commands);
