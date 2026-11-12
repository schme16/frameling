// The command and help for the Godot importer add-on. The add-on itself (and its zip) only loads when it's saved.
import type { Command, HelpTopic } from '../core/registry';

const saveGodotAddon = () => import('./godot-addon').then((m) => m.saveGodotAddon());

export const godotAddonCommands: Command[] = [
  {
    id: 'file.exportGodotAddon',
    label: 'Godot importer add-on...',
    category: 'File',
    description: 'Save a Godot add-on that reads .flplay packages straight into a project and updates them when they change.',
    help: 'godot-addon',
    keywords: ['godot', 'addon', 'add-on', 'plugin', 'import', 'importer', 'flplay', 'spriteframes', 'animatedsprite2d', 'reimport', 'game'],
    global: true,
    run: () => saveGodotAddon(),
  },
];

export const godotAddonHelp: HelpTopic[] = [
  {
    id: 'godot-addon',
    title: 'Godot importer add-on',
    section: 'Exporting',
    media: 'godot-addon.png',
    summary: 'A Godot add-on that reads Frameling packages (.flplay) straight in, and updates them every time you export again.',
    keywords: ['godot', 'addon', 'add-on', 'plugin', 'import', 'importer', 'flplay', 'spriteframes', 'animatedsprite2d', 'reimport', 'game'],
  },
];
