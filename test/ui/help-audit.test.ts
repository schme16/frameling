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
import { auditHelp, formatAudit, helpLinksIn, shortcutsIn } from '../../src/ui/help/audit';
import '../../src/renderer/features';
import { KEYMAP_SETS } from '../../src/ui/keymapSets';

const helpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/help');

// Keys a topic may name that no command has: the browser's own (web-browser) and renaming a tile in the Tileset panel.
// Plus every key a shortcut set gives (the shortcut-sets topic names them).
const EXTRA_KEYS = ['Mod+W', 'Mod+T', 'F2', ...KEYMAP_SETS.flatMap((s) => Object.values(s.keys).flat())];

const run = () => auditHelp({ topics: allHelp(), commands: allCommands(), panels: allPanels(), tools: allTools(), files: readdirSync(helpDir), extraKeys: EXTRA_KEYS });

describe('help audit (the real app)', () => {
  // The topics' words load on demand, so the audit waits for them.
  let a: ReturnType<typeof run>;
  beforeAll(async () => {
    await loadHelpBodies();
    a = run();
    if (process.env.HELP_AUDIT || process.env.npm_lifecycle_event === 'help:audit') process.stdout.write(`\n${formatAudit(a)}\n`);
  });

  it('every command has a help topic', () => expect(a.commandsWithoutHelp).toEqual([]));
  it('every topic has a picture or clip', () => expect(a.topicsWithoutMedia).toEqual([]));
  it('every picture a topic names exists', () => expect(a.missingMedia).toEqual([]));
  it('every file in public/help is used', () => expect(a.orphanFiles).toEqual([]));
  it('every help link goes somewhere', () => expect(a.brokenLinks).toEqual([]));
  it('every shortcut a topic names is a real one', () => expect(a.shortcutDrift).toEqual([]));
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
