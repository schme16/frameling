import { registerCommands } from '../core/registry';
import { openDocument, saveDocument, saveDocumentAs } from './document';
import { openRecentDialog } from './RecentDialog';
import { openRecoverDialog } from './RecoverDialog';

// `file.new` belongs to the ui area, which asks askAboutUnsavedChanges() before replacing the document.
registerCommands([
  {
    id: 'file.open',
    label: 'Open...',
    category: 'File',
    keys: ['Mod+O'],
    description: 'Open a drawing from your computer.',
    help: 'saving-and-opening',
    keywords: ['load', 'file'],
    global: true,
    run: () => openDocument(),
  },
  {
    id: 'file.openRecent',
    label: 'Open recent...',
    category: 'File',
    description: 'Pick up where you left off with a drawing you had open lately.',
    help: 'saving-and-opening',
    keywords: ['history', 'lately', 'last'],
    run: () => openRecentDialog(),
  },
  {
    id: 'file.recover',
    label: 'Recover unsaved work...',
    category: 'File',
    description: 'Get back work you chose not to save, for up to 7 days.',
    help: 'autosave',
    keywords: ['restore', 'lost', 'autosave', 'discard', 'undo close', "don't save", 'crash'],
    run: () => openRecoverDialog(),
  },
  {
    id: 'file.save',
    label: 'Save',
    category: 'File',
    keys: ['Mod+S'],
    description: 'Save your drawing.',
    help: 'saving-and-opening',
    global: true,
    run: () => void saveDocument(),
  },
  {
    id: 'file.saveAs',
    label: 'Save as...',
    category: 'File',
    keys: ['Mod+Shift+S'],
    description: 'Save a copy under a new name or in a new place.',
    help: 'saving-and-opening',
    keywords: ['copy', 'rename', 'duplicate'],
    global: true,
    run: () => void saveDocumentAs(),
  },
]);
