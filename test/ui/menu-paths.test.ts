// @vitest-environment jsdom
// Every **Menu > Item** path written anywhere in the app's words, with Interactives switched on so its menu lines
// are there to find: the help topics (shown or kept out of sight) and every other string in src/ (tips, quests,
// hints, dialog words). The help audit holds the shown topics to the same rule; this one reaches the rest.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { _forceInteractivesForTests } from '../../src/features/flags';

_forceInteractivesForTests(true);

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

describe('menu paths in the app words (Interactives on)', async () => {
  await import('../../src/renderer/features');
  const { allHelp, helpBody, loadHelpBodies } = await import('../../src/core/registry');
  const { syncDynamicCommands } = await import('../../src/ui/dynamic');
  const { hiddenFeatureHelp } = await import('../../src/features/host');
  const { menuPathDrift } = await import('../../src/ui/help/menuPaths');
  const { wordsTree } = await import('../helpers/menuTree');
  await loadHelpBodies();
  syncDynamicCommands();
  const menus = wordsTree();

  it('every help topic, shown or kept out of sight, names menus that exist', () => {
    const drift = [...allHelp(), ...hiddenFeatureHelp()].flatMap((t) => menuPathDrift(t.id, helpBody(t), menus));
    expect(drift).toEqual([]);
  });

  it('every other string in src/ that names a menu path does too', () => {
    const drift = files(src)
      .filter((f) => !f.endsWith(`${path.sep}menuPaths.ts`))
      .flatMap((f) => menuPathDrift(path.relative(src, f), readFileSync(f, 'utf8'), menus));
    expect(drift).toEqual([]);
  });
});
