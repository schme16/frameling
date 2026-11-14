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
    // The id stays `pixel` so a saved choice keeps working; the name people see is Aseprite keys.
    id: 'pixel',
    label: 'Aseprite keys',
    blurb: 'The keys Aseprite artists know: B pencil, U rectangle, M and Q select, X swaps colours, + and - change the brush, [ and ] step the palette, 1 to 6 zoom, Tab hides the panels, Alt+N adds a frame, Alt+arrows step frames.',
    keys: {
      // Tools (Aseprite's own letters; ours stay as a second key where they are free)
      'tools.pencil': ['b'],
      'tools.brush': ['p'],
      'tools.rect': ['u', 'r'],
      'tools.ellipse': ['Shift+U', 'o'],
      'tools.polygon': ['Shift+D'],
      'tools.star': ['Shift+P'],
      'tools.pen': ['Shift+Alt+P'],
      'tools.pixel-select': ['m', 'v'],
      'select.lasso': ['q'],
      // Q is Aseprite's lasso, so Transform takes Shift+Q here
      'tools.transform': ['Shift+Q'],
      // The mirror button's key makes room for Aseprite's Shift+M
      'pixel.mirror': ['Shift+Alt+M'],
      'rig.mirrorPose': ['Mod+Alt+M'],
      // Colours: X swaps them, like the front and back colours; [ and ] step along the palette
      'colors.swap': ['x'],
      'colors.toggleWell': ['Shift+X'],
      'colors.reset': ['Shift+Alt+D'],
      'pixel.previousColor': ['['],
      'pixel.nextColor': [']'],
      // Brush size
      'pixel.sizeUp': ['+', '='],
      'pixel.sizeDown': ['-'],
      // Zoom: 100%, 200%, 400%, 800%, 1600%, 3200%
      'pixel.zoom1': ['1'],
      'pixel.zoom2': ['2'],
      'pixel.zoom3': ['3'],
      'pixel.zoom4': ['4'],
      'pixel.zoom5': ['5'],
      'pixel.zoom6': ['6'],
      // Frames: Alt+arrows step (plain arrows nudge a selection, as in Frameling), Alt+N adds one (a copy), Alt+B an empty one, Alt+M a linked one, Alt+C removes one
      'timeline.prevFrame': ['Alt+ArrowLeft', ','],
      'timeline.nextFrame': ['Alt+ArrowRight', '.'],
      'timeline.duplicateKey': ['Alt+N', 'Alt+D', 'd'],
      'timeline.newKey': ['Alt+B', 'n'],
      'timeline.insertFrame': ['Alt+M'],
      'timeline.removeFrame': ['Alt+C'],
      'timeline.toggleOnion': ['F3', 'Shift+O'],
      // Layers
      'layers.addPixel': ['Shift+N'],
      'layers.duplicate': ['Mod+J'],
      // Selection and flipping
      'select.none': ['Mod+D', 'Escape'],
      'edit.duplicate': ['Mod+Alt+D'],
      'pixel.flipH': ['Shift+H'],
      'pixel.flipV': ['Shift+V'],
      'tiles.flipX': ['Mod+Shift+H'],
      'tiles.flipY': ['Mod+Shift+V'],
      // View, sprite and files
      'view.pixelGrid': ["Mod+Shift+'"],
      'view.fit': ['Mod+0'],
      'view.hidePanels': ['Tab', 'Mod+\\'],
      'document.settings': ['c', 'Mod+Alt+C'],
      'file.exportAgain': ['Mod+Shift+X', 'Mod+Shift+E'],
    },
  },
];

export function keymapSet(id: string | undefined): KeymapSet {
  return KEYMAP_SETS.find((s) => s.id === id) ?? KEYMAP_SETS[0];
}

export const isKeymapSet = (id: unknown): id is string => typeof id === 'string' && KEYMAP_SETS.some((s) => s.id === id);
