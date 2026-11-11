import { registerCommands } from '../core/registry';
import { exportAgain, openExportDialog } from './ExportDialog';

registerCommands([
  {
    id: 'file.export',
    label: 'Export...',
    category: 'File',
    keys: ['Mod+E'],
    description: 'Make a video, GIF, pictures, an SVG or a sprite sheet to share or use in a game.',
    help: 'exporting',
    keywords: ['video', 'gif', 'mp4', 'png', 'share', 'render', 'sprite sheet', 'godot', 'svg', 'apng', 'webm'],
    global: true,
    run: () => openExportDialog(),
  },
  {
    id: 'file.exportAgain',
    label: 'Export again',
    category: 'File',
    keys: ['Mod+Shift+E'],
    description: 'Export once more with the same settings as last time.',
    help: 'exporting',
    keywords: ['repeat', 'last export'],
    global: true,
    run: () => exportAgain(),
  },
]);
