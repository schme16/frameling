// Your templates in the app: commands, help, and the "Yours" source for the welcome sheet. (index.ts stays the plain
// list of built-in templates, which tests and tools import without the UI.)
import { registerCommands, registerHelpTopics } from '../core/registry';
import { openSheet } from '../ui/overlays';
import { importTemplate } from './actions';
import './user';
import { store } from '../core/store';
import { watchSetups } from './setup';

// Onion skin and the like for templates that ask for it, as their documents open.
watchSetups(store());

registerCommands([
  {
    id: 'file.saveAsTemplate',
    label: 'Save as template...',
    category: 'File',
    description: 'Keep this drawing as a starting point in Your templates.',
    help: 'templates-yours',
    keywords: ['template', 'starter', 'preset', 'reuse', 'share', 'community'],
    // The dialog loads on first use.
    run: () => void import('./SaveTemplateDialog').then((m) => m.openSaveTemplate()),
  },
  {
    id: 'file.importTemplate',
    label: 'Import template...',
    category: 'File',
    description: 'Add a template someone shared with you to Your templates.',
    help: 'templates-yours',
    keywords: ['template', 'starter', 'share', 'community', 'add'],
    run: async () => {
      if (await importTemplate()) openSheet('new');
    },
  },
]);

registerHelpTopics([
  {
    id: 'templates-yours',
    title: 'Your templates',
    section: 'Getting started',
    summary: 'Keep any drawing as a starting point, share it as a file, and add templates other people made.',
    keywords: ['template', 'starter', 'preset', 'share', 'community', 'import', 'licence', 'license', 'author'],
    media: 'templates-yours.png',
  },
]);
