// @vitest-environment jsdom
// Commands the menus leave out on purpose (src/ui/paletteFirst.ts). Taking an entry out of a menu is only fair when a
// control on screen does the same job, so each one has to be named by a component (a control carrying data-command),
// still has to be a real command in the palette, and must not be in any menu any more.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allCommands, allTools } from '../../src/core/registry';
import { PIXEL_TOOLS } from '../../src/ui/dock';
import { railFor, type RailTool } from '../../src/ui/toolArrange';
import { LEFT_OUT_OF_MENUS } from '../../src/ui/paletteFirst';
import { resolveMenus, TOOLS_OFF_THE_PIXEL_RAIL, TOOLS_WITH_THEIR_FEATURE } from '../../src/ui/menus';
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

  // A tool is only left out of the Tools menu when the rail shows it on every kind of layer it works on, the Pixel
  // workspace's narrower rail included. Where the rail leaves a tool off, the menu has to name it.
  it('a tool left out is a button on every rail it works on, and a tool the Pixel rail leaves off is still in the menu', async () => {
    await loadApp();
    const tools = allTools() as RailTool[];
    const onRail = (id: string): boolean =>
      tools.find((t) => t.id === id)!.layers.every((kind) => {
        const rail = railFor(tools, kind, kind === 'pixel' ? [...PIXEL_TOOLS] : undefined, true).shown;
        const slot = tools.find((t) => t.id === id)!.slot;
        return rail.includes(id) || (!!slot && rail.some((o) => tools.find((t) => t.id === o)?.slot === slot));
      });
    const leftOut = Object.keys(LEFT_OUT_OF_MENUS).filter((id) => id.startsWith('tools.')).map((id) => id.slice(6));
    expect(leftOut.filter((id) => !onRail(id)), 'not on a rail it works on: keep it in a menu').toEqual([]);
    const inMenus = new Set(resolveMenus().flatMap((m) => flat(m.items)));
    const offRail = tools.map((t) => t.id).filter((id) => !onRail(id) && !TOOLS_WITH_THEIR_FEATURE.includes(`tools.${id}`));
    expect(offRail.filter((id) => !inMenus.has(`tools.${id}`)), 'off a rail and in no menu').toEqual([]);
    expect(TOOLS_OFF_THE_PIXEL_RAIL.filter((id) => onRail(id.slice(6))), 'now on every rail: leave it out of the menu').toEqual([]);
  });
});
