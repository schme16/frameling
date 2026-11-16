// @vitest-environment jsdom
// Commands the menus leave out on purpose (src/ui/paletteFirst.ts). Taking an entry out of a menu is only fair when a
// control on screen does the same job, so each one has to be named by a component (a control carrying data-command),
// still has to be a real command in the palette, and must not be in any menu any more.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allCommands } from '../../src/core/registry';
import { LEFT_OUT_OF_MENUS } from '../../src/ui/paletteFirst';
import { resolveMenus } from '../../src/ui/menus';
import { loadApp, surfaceMentions } from '../findability/app';
import type { MenuItem } from '../../src/ui/menus';

const flat = (items: MenuItem[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? flat(i.items) : []));

describe('commands left out of the menus on purpose', () => {
  it('each is a real command, found in the palette by its name', async () => {
    await loadApp();
    const ids = new Set(allCommands().map((c) => c.id));
    expect(Object.keys(LEFT_OUT_OF_MENUS).filter((id) => !ids.has(id)), 'no longer registered: delete the line').toEqual([]);
  });

  it('each is named by a control in a component, so there is a real way in that is not a menu', async () => {
    await loadApp();
    const ms = surfaceMentions().filter((m) => m.file.endsWith('.tsx') || /dockMenus\.ts$/.test(m.file));
    const bare = Object.keys(LEFT_OUT_OF_MENUS).filter((id) => !ms.some((m) => (m.prefix ? id.startsWith(m.text) : m.text === id)));
    expect(bare, 'give the control that does the same job a data-command, or put the command back in a menu').toEqual([]);
  });

  it('each named control really carries the attribute, not just the words', async () => {
    await loadApp();
    const ms = surfaceMentions().filter((m) => m.file.endsWith('.tsx') || /dockMenus\.ts$/.test(m.file));
    const files = new Map<string, string>();
    for (const id of Object.keys(LEFT_OUT_OF_MENUS)) {
      const hit = ms.filter((m) => (m.prefix ? id.startsWith(m.text) : m.text === id));
      const ok = hit.some((m) => {
        if (!files.has(m.file)) files.set(m.file, readFileSync(m.file, 'utf8'));
        return /data-command|command[:=]|command=/.test(files.get(m.file)!);
      });
      expect(ok, id).toBe(true);
    }
  });

  it('none is in any menu, in any situation, so a command is in the menus or here, never both', async () => {
    await loadApp();
    const inMenus = new Set(resolveMenus().flatMap((m) => flat(m.items)));
    expect(Object.keys(LEFT_OUT_OF_MENUS).filter((id) => inMenus.has(id))).toEqual([]);
  });
});
