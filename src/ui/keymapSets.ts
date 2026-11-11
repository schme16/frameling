// Shortcut sets: the keys people already know from other tools, laid over Frameling's own defaults.
//
// A set only lists the commands it changes. Anything it doesn't list keeps Frameling's key, unless the set gives that
// key to something else, in which case it quietly drops it (see `setBaseKeys` in keys.ts). The person's own changes
// always sit on top of whichever set is picked. Unknown command ids are ignored, so a set never breaks when a command
// is renamed or a plugin is missing.

export interface KeymapSet {
  id: string;
  label: string;
  /** One line under the picker. */
  blurb: string;
  /** Command id -> its shortcuts in this set. An empty list takes the shortcut away. */
  keys: Record<string, string[]>;
}

export const DEFAULT_KEYMAP_SET = 'frameling';

export const KEYMAP_SETS: KeymapSet[] = [
  {
    id: 'frameling',
    label: 'Frameling',
    blurb: "Frameling's own keys. Good if you're new to animation tools.",
    keys: {},
  },
  {
    id: 'flash',
    label: 'Familiar from Flash / Animate',
    blurb: 'F5 adds a frame, F6 a key with a copy, F7 an empty key, and the tool letters you remember.',
    keys: {
      // Timeline
      'timeline.insertFrame': ['F5', '='],
      'timeline.removeFrame': ['Shift+F5', '-'],
      'timeline.duplicateKey': ['F6'],
      'timeline.newKey': ['F7'],
      'timeline.clearKey': ['Shift+F6'],
      // Tools
      'tools.pencil': ['y'],
      'tools.line': ['n'],
      'tools.fill': ['k'],
      'tools.bone': ['m'],
      'select.lasso': ['l'],
      // Symbols: edit in place with Ctrl+E, the same keys take you back out
      'symbols.edit': ['Mod+E'],
      'symbols.exit': ['Shift+F9'],
      'file.export': ['Mod+Alt+Shift+S'],
      // Stage and view
      'document.settings': ['Mod+J'],
      'view.fit': ['Mod+2', 'Mod+0'],
      'view.rulers': ['Mod+Alt+Shift+R'],
      'edit.redo': ['Mod+Y', 'Mod+Shift+Z'],
      // Arrange with the arrow keys
      'arrange.forward': ['Mod+ArrowUp', 'Mod+]'],
      'arrange.backward': ['Mod+ArrowDown', 'Mod+['],
      'arrange.front': ['Mod+Shift+ArrowUp', 'Mod+Shift+]'],
      'arrange.back': ['Mod+Shift+ArrowDown', 'Mod+Shift+['],
    },
  },
  {
    id: 'pixel',
    label: 'Familiar from pixel tools (Aseprite-like)',
    blurb: 'B is the pencil, U the rectangle, M and Q select, Alt+N adds a frame and F3 shows the onion skin.',
    keys: {
      // Tools
      'tools.pencil': ['b'],
      'tools.brush': ['p'],
      'tools.rect': ['u'],
      'tools.ellipse': ['Shift+U'],
      'tools.pixel-select': ['m', 'v'],
      'select.lasso': ['q'],
      // Colours: X swaps them, like the front and back colours
      'colors.swap': ['x'],
      'colors.toggleWell': ['Shift+X'],
      // Frames and layers
      'timeline.duplicateKey': ['Alt+N', 'd'],
      'timeline.removeFrame': ['Alt+C', '-'],
      'timeline.toggleOnion': ['F3', 'Shift+O'],
      'layers.addPixel': ['Shift+N'],
      'layers.duplicate': ['Mod+J'],
      // Selection
      'select.none': ['Mod+D', 'Escape'],
      'edit.duplicate': ['Mod+Alt+D'],
      // View
      'view.pixelGrid': ["Mod+'"],
      'view.fit': ['Mod+0'],
    },
  },
];

export function keymapSet(id: string | undefined): KeymapSet {
  return KEYMAP_SETS.find((s) => s.id === id) ?? KEYMAP_SETS[0];
}

export const isKeymapSet = (id: unknown): id is string => typeof id === 'string' && KEYMAP_SETS.some((s) => s.id === id);
