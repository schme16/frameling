import { registerCommands } from '../core/registry';
import { openPrefs } from '../ui/overlays';

registerCommands([
  {
    id: 'plugins.manage',
    label: 'Manage plugins...',
    category: 'Plugins',
    description: 'See your plugins, turn them on or off, and what each one may do.',
    help: 'plugins',
    keywords: ['plugin', 'add-on', 'extension', 'extend', 'install', 'remove', 'permissions'],
    run: () => openPrefs('plugins'),
  },
  {
    id: 'plugins.install',
    label: 'Install a plugin...',
    category: 'Plugins',
    description: 'Add a plugin from a .zip file. Frameling shows what it asks for first.',
    help: 'plugins',
    keywords: ['plugin', 'add-on', 'extension', 'zip'],
    run: () => void import('./install').then((m) => m.installFromFile()),
  },
]);
