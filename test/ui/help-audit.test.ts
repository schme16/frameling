// @vitest-environment jsdom
// The help audit against the real app: every command has a topic, every topic has a picture or clip that exists and
// is used, no link points nowhere, and no topic names a shortcut that's changed. `npm run help:audit` prints the
// whole report, long topics included.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Command, HelpTopic } from '../../src/core/registry';
import { allCommands, allHelp, allPanels, allTools, loadHelpBodies } from '../../src/core/registry';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { auditHelp, formatAudit, helpLinksIn, shortcutsIn } from '../../src/ui/help/audit';
import '../../src/renderer/features';
import { hiddenFeatureHelp } from '../../src/features/host';
import { KEYMAP_SETS } from '../../src/ui/keymapSets';
import { wordsTree } from '../helpers/menuTree';
import { menuPathDrift, menuPathProblem, menuPathsIn, type MenuNode } from '../../src/ui/help/menuPaths';

const helpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/help');

// Keys a topic may name that no command has: the ones the window keeps, and renaming a tile in the Tileset panel.
// Plus every key a shortcut set gives (the shortcut-sets topic names them).
const EXTRA_KEYS = ['Mod+W', 'Mod+T', 'F2', ...KEYMAP_SETS.flatMap((s) => Object.values(s.keys).flat())];

const run = () => auditHelp({ menus: wordsTree(), topics: allHelp(), keptOut: hiddenFeatureHelp(), commands: allCommands(), panels: allPanels(), tools: allTools(), files: readdirSync(helpDir), extraKeys: EXTRA_KEYS });

describe('help audit (the real app)', () => {
  // The topics' words load on demand, so the audit waits for them.
  let a: ReturnType<typeof run>;
  beforeAll(async () => {
    await loadHelpBodies();
    // The tool, panel and workspace commands are made on demand; the real app has made them by now.
    syncDynamicCommands();
    a = run();
    if (process.env.HELP_AUDIT || process.env.npm_lifecycle_event === 'help:audit') process.stdout.write(`\n${formatAudit(a)}\n`);
  });

  it('every command has a help topic', () => expect(a.commandsWithoutHelp).toEqual([]));
  it('every topic has a picture or clip', () => expect(a.topicsWithoutMedia).toEqual([]));
  it('every picture a topic names exists', () => expect(a.missingMedia).toEqual([]));
  it('every file in public/help is used', () => expect(a.orphanFiles).toEqual([]));
  it('every help link goes somewhere', () => expect(a.brokenLinks).toEqual([]));
  it('every shortcut a topic names is a real one', () => expect(a.shortcutDrift).toEqual([]));
  it('every **Menu > Item** a topic names is in the menus, where it says', () => expect(a.menuPathDrift).toEqual([]));
  it('no topic rambles on', () => {
    // Over 400 words shows in the report; over 500 fails.
    const way = a.longTopics.filter((x) => Number(/\((\d+) words\)/.exec(x)![1]) > 500);
    expect(way).toEqual([]);
  });
});

const topic = (id: string, body: string, extra: Partial<HelpTopic> = {}): HelpTopic => ({ id, title: id, summary: '', section: 'Basics', body, ...extra });
const cmd = (id: string, extra: Partial<Command> = {}): Command => ({ id, label: id, category: 'Edit', run: () => {}, ...extra });

describe('help audit (the checks)', () => {
  it('reads shortcuts out of a body and skips mouse gestures', () => {
    expect(shortcutsIn('Press **Ctrl+Shift+Z**, or Shift+drag, or Alt+click. Press **G**. Then **F9**. The key `b`. Brush (B).')).toEqual(['Ctrl+Shift+Z', 'G', 'F9', 'b', 'B']);
    expect(shortcutsIn('**Ctrl+=** and **Ctrl+-**, **Ctrl+]** and Shift+comma')).toEqual(['Ctrl+=', 'Ctrl+-', 'Ctrl+]', 'Shift+comma']);
  });

  it('reads help links', () => {
    expect(helpLinksIn('See [a](help:undo) and [b](help:fill#tips) and [c](https://x.y).')).toEqual(['undo', 'fill#tips']);
  });

  it('finds each kind of problem', () => {
    const a = auditHelp({
      topics: [topic('undo', 'Press **Ctrl+Z**. Or **Ctrl+Q**. See [x](help:nope) and [y](help:fill#nowhere) and [z](help:fill#tips).', { media: 'undo.mp4' }), topic('fill', `## Tips\n\n${'word '.repeat(420)}`)],
      commands: [cmd('edit.undo', { keys: ['Mod+Z'], help: 'undo' }), cmd('edit.lost'), cmd('edit.bad', { help: 'gone' })],
      files: ['undo-dark.mp4', 'undo-dark-poster.png', 'undo-light.mp4', 'stray.png'],
    });
    expect(a.commandsWithoutHelp).toEqual(['edit.lost']);
    expect(a.topicsWithoutMedia).toEqual(['fill']);
    expect(a.missingMedia).toEqual(['undo -> undo-light-poster.png']);
    expect(a.orphanFiles).toEqual(['stray.png']);
    expect(a.longTopics).toEqual(['fill (421 words)']);
    expect(a.shortcutDrift).toEqual(['undo: Ctrl+Q']);
    expect(a.brokenLinks).toEqual(['undo -> help:nope', 'undo -> help:fill#nowhere', 'command edit.bad -> help:gone']);
  });

  it('wants both the dark and the light version of a picture', () => {
    const a = auditHelp({ topics: [topic('t', 'Hi.', { media: 'x.png' })], commands: [], files: ['x-dark.png'] });
    expect(a.missingMedia).toEqual(['t -> x-light.png']);
    expect(a.orphanFiles).toEqual([]);
  });

  it('lets a shortcut through when it is allowed on purpose', () => {
    const a = auditHelp({ topics: [topic('t', 'Press **Ctrl+W**.', { media: 'x.png' })], commands: [], files: ['x-dark.png', 'x-light.png'], extraKeys: ['Mod+W'] });
    expect(a.shortcutDrift).toEqual([]);
  });
});

describe('menu paths in help words', () => {
  const menus: MenuNode[] = [
    { label: 'File', items: [{ label: 'Open...' }, { label: 'Export', items: [{ label: 'Export...' }, { label: 'Export a Lottie animation...' }] }] },
    { label: 'Artboards', items: [{ label: 'Zoom to artboard' }, { label: 'Make a variation (linked copy)' }] },
    { label: 'View', items: [{ label: 'Panels', items: [{ label: 'Library' }] }, { label: 'Tile mode (repeat around the edges)' }] },
  ];

  it('reads the bold paths and nothing else', () => {
    expect(menuPathsIn('Use **File > Export > Export...** or **Ctrl+E**, but not plain File > Open.')).toEqual([['File', 'Export', 'Export...']]);
  });
  it('lets a path through when it leads somewhere, ignoring dots, case and a bracketed aside', () => {
    expect(menuPathProblem(['File', 'Open'], menus)).toBeUndefined();
    expect(menuPathProblem(['file', 'export', 'export a lottie animation'], menus)).toBeUndefined();
    expect(menuPathProblem(['View', 'Tile mode'], menus)).toBeUndefined();
    expect(menuPathProblem(['Artboards', 'Make a variation'], menus)).toBeUndefined();
  });
  it('says where a thing went when the path is stale', () => {
    expect(menuPathProblem(['View', 'Zoom to artboard'], menus)).toBe('"Zoom to artboard" is not in View (it is at Artboards > Zoom to artboard)');
    expect(menuPathProblem(['View', 'Library'], menus)).toBe('"Library" is not in View (it is at View > Panels > Library)');
    expect(menuPathProblem(['Draw', 'Library'], menus)).toContain('"Draw" is not in the menu bar');
    expect(menuPathProblem(['File', 'Open', 'Recent'], menus)).toBe('"Open..." is an item, not a menu'.replace('Open...', 'Open'));
  });
  it('leaves other programs\' menus alone and the ⋯ button', () => {
    expect(menuPathProblem(['⋯', 'Remove'], menus)).toBeUndefined();
    expect(menuPathProblem(['Window', 'Package Manager'], menus)).toBeUndefined();
  });
  it('reports each stale path once, with where it was found', () => {
    const md = 'Try **View > Zoom to artboard**, then **View > Zoom to artboard** again, then **File > Open**.';
    expect(menuPathDrift('artboards', md, menus)).toEqual(['artboards: View > Zoom to artboard ("Zoom to artboard" is not in View (it is at Artboards > Zoom to artboard))']);
  });
});
