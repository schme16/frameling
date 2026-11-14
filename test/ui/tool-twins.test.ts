// @vitest-environment jsdom
// Select, Lasso and Polygon select are one tool for vector layers and another for pixel layers, with the same name and
// key. The Draw menu and the command palette show each name once.
import { describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import '../../src/select';
import { allCommands, allTools, getCommand, type Command } from '../../src/core/registry';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { MENUS, resolveMenu, type MenuItem } from '../../src/ui/menus';
import { paletteItems, withoutToolTwins } from '../../src/ui/palette';
import { oneOfEach } from '../../src/ui/toolTwins';

const labels = (items: MenuItem[]) => items.filter((i): i is Extract<MenuItem, { kind: 'command' }> => i.kind === 'command').map((i) => i.command.label);
const drawMenu = () => {
  syncDynamicCommands();
  return labels(resolveMenu(MENUS.find((m) => m.label === 'Draw')!));
};
const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

describe('oneOfEach', () => {
  const t = (label: string, on: boolean) => ({ label, on });
  it('keeps the usable one of a pair, in the place the name first appeared', () => {
    const out = oneOfEach([t('Select', false), t('Lasso', true), t('Select', true), t('Lasso', false)], (x) => x.label, (x) => x.on);
    expect(out).toEqual([t('Select', true), t('Lasso', true)]);
  });
  it('keeps the first when none (or all) can be used', () => {
    const a = { label: 'Select', n: 1 };
    const b = { label: 'Select', n: 2 };
    expect(oneOfEach([a, b], (x) => x.label, () => false)).toEqual([a]);
    expect(oneOfEach([a, b], (x) => x.label, () => true)).toEqual([a]);
  });
});

describe('the Draw menu', () => {
  it('lists each name once on a vector layer, and the pixel ones on a pixel layer', () => {
    resetStore(newDoc({ name: 'v', width: 64, height: 64 }));
    const onVector = drawMenu();
    expect(dupes(onVector)).toEqual([]);
    expect(onVector).toContain('Select');
    expect(onVector).not.toContain('Magic wand');
    const doc = newDoc({ name: 'p', width: 64, height: 64 });
    doc.layers = [newPixelLayer('Pixels', 1)];
    resetStore(doc);
    store().setUi({ activeLayerId: doc.layers[0].id });
    const onPixel = drawMenu();
    expect(dupes(onPixel)).toEqual([]);
    expect(onPixel).toContain('Select');
    expect(onPixel).toContain('Magic wand');
    expect(onPixel).toContain('Pencil');
  });
  it('still shows each name once with no layer to go by', () => {
    resetStore(newDoc({ name: 'empty', width: 64, height: 64 }));
    expect(dupes(drawMenu())).toEqual([]);
  });
});

describe('the command palette', () => {
  it('has each tool name once, with the one that works on this layer', () => {
    resetStore(newDoc({ name: 'v', width: 64, height: 64 }));
    syncDynamicCommands();
    const tools = withoutToolTwins(paletteItems().flatMap((i) => (i.kind === 'command' ? [i.command] : [])));
    const names = tools.filter((c: Command) => c.category === 'Tools').map((c) => c.label);
    expect(dupes(names)).toEqual([]);
    expect(allTools().length).toBeGreaterThan(names.length);
    const select = tools.find((c) => c.label === 'Select' && c.category === 'Tools')!;
    expect(select.enabled?.(store().get()) ?? true).toBe(true);
  });
  it('leaves out the older pick-the-way commands, which the tools already say, but keeps them for keys', () => {
    syncDynamicCommands();
    const ids = paletteItems().filter((i) => i.kind === 'command').map((i) => i.id);
    for (const id of ['select.box', 'select.lasso', 'select.magnetic', 'select.wand']) {
      expect(getCommand(id)?.hidden).toBe(true);
      expect(ids).not.toContain(id);
      expect(allCommands().some((c) => c.id === id)).toBe(true);
    }
    expect(ids).toContain('tools.select-lasso');
  });
});
