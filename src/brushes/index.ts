// Saved brushes: the row at the top of the brush options, and the commands to save, pick, share and step through them.
// The rules are in model.ts, where they are kept and changed in presets.ts, and the row itself is BrushPresetRow.tsx.
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { showPanel } from '../ui/dock';
import { pickTool } from '../tools/pick';
import './help';
import {
  activeOwn,
  addBrushesFromClipboard,
  addBrushesFromFile,
  copyBrushesText,
  currentBrushState,
  deleteActive,
  myBrushes,
  saveBrushesFile,
  startNaming,
  stepBrush,
  updateActive,
} from './presets';

export { startBrushPresets } from './presets';

/** Brings the brush options up, with the brush tool, so a name box has somewhere to show. */
function showBrushOptions(): void {
  pickTool('brush');
  showPanel('tool-options');
}

registerCommands([
  {
    id: 'brush.saveAs',
    label: 'Save this brush as...',
    category: 'Draw',
    description: 'Keep the brush you are using under a name, to pick again in one click.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'save brush', 'new brush', 'name', 'favourite'],
    run: () => {
      showBrushOptions();
      startNaming('save');
    },
  },
  {
    id: 'brush.update',
    label: 'Update the saved brush',
    category: 'Draw',
    description: 'Put your changes to the size, smoothing and the rest into the saved brush you picked.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'update', 'overwrite', 'keep changes'],
    enabled: () => !!activeOwn() && currentBrushState().changed,
    run: () => void updateActive(),
  },
  {
    id: 'brush.rename',
    label: 'Rename the saved brush...',
    category: 'Draw',
    description: 'Give the saved brush you picked another name.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'rename', 'name'],
    enabled: () => !!activeOwn(),
    run: () => {
      showBrushOptions();
      startNaming('rename');
    },
  },
  {
    id: 'brush.delete',
    label: 'Delete the saved brush',
    category: 'Draw',
    description: 'Take the saved brush you picked away. The message that appears has Undo.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'delete', 'remove'],
    enabled: () => !!activeOwn(),
    run: () => void deleteActive(),
  },
  {
    id: 'brush.next',
    label: 'Next saved brush',
    category: 'Draw',
    keys: ['Alt+ArrowDown'],
    description: 'Move to the next brush in the row at the top of the brush options.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'next', 'switch brush', 'cycle'],
    run: () => {
      stepBrush(1);
      if (store().get().ui.tool !== 'brush') pickTool('brush');
    },
  },
  {
    id: 'brush.previous',
    label: 'Previous saved brush',
    category: 'Draw',
    keys: ['Alt+ArrowUp'],
    description: 'Move to the brush before this one in the row at the top of the brush options.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'previous', 'switch brush', 'cycle'],
    run: () => {
      stepBrush(-1);
      if (store().get().ui.tool !== 'brush') pickTool('brush');
    },
  },
  {
    id: 'brush.saveFile',
    label: 'Save my brushes as a file',
    category: 'Draw',
    description: 'Make a small file of the brushes you saved, to send to a friend.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'share', 'export', 'file'],
    enabled: () => myBrushes().length > 0,
    run: () => void saveBrushesFile(),
  },
  {
    id: 'brush.copyText',
    label: 'Copy my brushes as text',
    category: 'Draw',
    description: 'Put the brushes you saved on the clipboard as text, to paste into a message.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'share', 'copy', 'text', 'clipboard'],
    enabled: () => myBrushes().length > 0,
    run: () => void copyBrushesText(),
  },
  {
    id: 'brush.addFile',
    label: 'Add brushes from a file...',
    category: 'Draw',
    description: 'Add the brushes in a file someone sent you.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'import', 'open', 'file'],
    run: () => void addBrushesFromFile(),
  },
  {
    id: 'brush.pasteText',
    label: 'Add brushes from pasted text',
    category: 'Draw',
    description: 'Add the brushes in text you copied from a message.',
    help: 'brush-presets',
    keywords: ['brush', 'preset', 'import', 'paste', 'text', 'clipboard'],
    run: () => void addBrushesFromClipboard(),
  },
]);

