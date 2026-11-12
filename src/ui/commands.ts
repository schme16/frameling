// The commands the shell owns: new document, view (panels, workspaces, theme, palette, preferences) and help.
import { getHelp, registerCommands } from '../core/registry';
import { contextualHelpId } from './help/context';
import { resetLayoutAndAsk } from './workspaceActions';
import { openAbout, openHelp, openPrefs, openSheet, togglePalette } from './overlays';
import { effectiveTheme, getPrefs, setPrefs } from './prefs';
import { toast } from './toast';
import { BUILT_IN_THEMES } from './themes/builtIn';
import { selectTheme, themeById } from './themes/library';

export function aboutText(): string {
  const v = typeof window !== 'undefined' ? window.frameling?.versions : undefined;
  return v?.app ? `Frameling ${v.app}. Made with care, and a little bit of glitter.` : 'Frameling. Made with care, and a little bit of glitter.';
}

/** F1: help for what the pointer is over or what has focus, else the contents. */
export function showContextHelp(): void {
  const id = contextualHelpId();
  if (id && getHelp(id)) openHelp(id);
  else openHelp();
}

registerCommands([
  {
    id: 'file.new',
    label: 'New drawing...',
    category: 'File',
    keys: ['Mod+N'],
    description: 'Start something new. Pick a size and go.',
    help: 'new-document',
    keywords: ['create', 'blank', 'start', 'document', 'file'],
    run: () => openSheet('new'),
  },
  {
    id: 'file.openExample',
    label: 'Examples...',
    category: 'Help',
    description: 'Start from a ready-made drawing and see how it is put together.',
    help: 'examples',
    keywords: ['template', 'sample', 'demo', 'starter', 'learn'],
    run: () => openSheet('examples'),
  },
  {
    id: 'view.commandPalette',
    label: 'Find a command',
    category: 'View',
    keys: ['Mod+K', 'Mod+Shift+P'],
    description: 'Search everything Frameling can do, and the help too.',
    help: 'command-palette',
    keywords: ['search', 'palette', 'run', 'anything'],
    global: true,
    run: () => togglePalette(),
  },
  {
    id: 'view.preferences',
    label: 'Preferences...',
    category: 'View',
    keys: ['Mod+,'],
    description: 'Change the look, the shortcuts and the workspaces.',
    help: 'preferences',
    keywords: ['settings', 'options', 'theme', 'shortcuts'],
    global: true,
    run: () => openPrefs('general'),
  },
  {
    id: 'view.features',
    label: 'Features...',
    category: 'View',
    description: 'Turn parts of Frameling on or off, like Lip sync.',
    help: 'features',
    keywords: ['turn off', 'turn on', 'switch', 'optional', 'simple', 'hide', 'lip sync', 'particles', 'text', 'tiles'],
    global: true,
    run: () => openPrefs('features'),
  },
  {
    id: 'view.toggleTheme',
    label: 'Switch dark or light',
    category: 'View',
    description: 'Flip between the dark and the light theme.',
    help: 'look-and-feel',
    keywords: ['theme', 'dark mode', 'light mode', 'night'],
    run: () => setPrefs({ theme: effectiveTheme() === 'dark' ? 'light' : 'dark' }),
  },
  {
    id: 'view.themes',
    label: 'Choose themes...',
    category: 'View',
    description: 'Pick your dark and light themes, or make your own.',
    help: 'themes',
    keywords: ['theme', 'colours', 'colors', 'customise', 'customize', 'palette'],
    run: () => openPrefs('themes'),
  },
  {
    id: 'view.nextTheme',
    label: 'Next theme',
    category: 'View',
    description: 'Try the next theme for the mode you are in (dark or light).',
    help: 'themes',
    keywords: ['theme', 'cycle', 'switch theme'],
    run: () => {
      const mode = effectiveTheme();
      const p = getPrefs();
      const list = [...BUILT_IN_THEMES, ...p.customThemes].filter((t) => t.mode === mode);
      const cur = mode === 'dark' ? p.darkTheme : p.lightTheme;
      const next = list[(list.findIndex((t) => t.id === cur) + 1) % list.length];
      if (!next) return;
      selectTheme(next);
      toast(`Theme: ${themeById(next.id)?.name ?? next.name}`);
    },
  },
  {
    id: 'view.toggleLook',
    label: 'Switch cosy or crisp',
    category: 'View',
    description: 'Flip between the soft, rounded look and the tighter, sharper one.',
    help: 'look-and-feel',
    keywords: ['look', 'style', 'rounded', 'compact'],
    run: () => setPrefs({ look: getPrefs().look === 'cosy' ? 'crisp' : 'cosy' }),
  },
  {
    id: 'view.resetLayout',
    label: 'Reset layout',
    category: 'View',
    description: 'Put the panels back where this workspace started.',
    help: 'workspaces',
    keywords: ['panels', 'restore', 'default'],
    run: () => resetLayoutAndAsk(),
  },
  {
    id: 'view.saveWorkspace',
    label: 'Save layout as a workspace...',
    category: 'View',
    description: 'Keep the way your panels are arranged right now, with a name.',
    help: 'workspaces',
    keywords: ['layout', 'panels', 'remember'],
    run: () => openPrefs('workspaces'),
  },
  {
    id: 'help.contents',
    label: 'Help',
    category: 'Help',
    keys: ['F1'],
    description: 'Help for what you are pointing at, or all the help.',
    help: 'using-help',
    keywords: ['docs', 'manual', 'learn', 'how'],
    global: true,
    run: showContextHelp,
  },
  {
    id: 'help.shortcuts',
    label: 'Keyboard shortcuts',
    category: 'Help',
    description: 'See every shortcut, and change them.',
    help: 'keyboard-shortcuts',
    keywords: ['keys', 'hotkeys', 'keymap', 'rebind'],
    run: () => openPrefs('keyboard'),
  },
  {
    id: 'help.welcome',
    label: 'Show the welcome screen',
    category: 'Help',
    description: 'The friendly start page, with ways to begin.',
    help: 'welcome',
    keywords: ['start', 'intro', 'quest', 'first'],
    run: () => openSheet('welcome'),
  },
  {
    id: 'help.about',
    label: 'About Frameling',
    category: 'Help',
    description: 'Which version you have, and a hello from Quill.',
    help: 'meet-quill',
    keywords: ['version', 'quill', 'hedgehog', 'mascot'],
    run: openAbout,
  },
]);

