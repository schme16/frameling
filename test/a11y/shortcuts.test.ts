// @vitest-environment jsdom
// Every default shortcut, across every feature, does one thing wherever you are. Two commands may share keys only
// when they never work in the same place (the Brush and the Tile brush are both B, but one is for tile layers).
import { describe, expect, it } from 'vitest';
import { allCommands } from '../../src/core/registry';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { allConflicts, comboLabel, effectiveKeys, layeredOverrides, normaliseCombo, sameContext } from '../../src/ui/keys';
import { KEYMAP_SETS } from '../../src/ui/keymapSets';
import '../../src/renderer/features';

describe('default shortcuts', () => {
  it('no two commands share a shortcut in the same place', () => {
    syncDynamicCommands();
    const clashes = [...allConflicts(allCommands(), {})].map(([k, list]) => `${comboLabel(k, false)}: ${list.map((c) => c.id).join(', ')}`);
    expect(clashes).toEqual([]);
  });

  it('tools on different layer kinds may share a letter', () => {
    syncDynamicCommands();
    const brush = allCommands().find((c) => c.id === 'tools.brush')!;
    const tile = allCommands().find((c) => c.id === 'tools.tile-brush')!;
    expect(effectiveKeys(brush, {})).toEqual(effectiveKeys(tile, {}));
    expect(sameContext(brush, tile)).toBe(false);
  });

  it('every command has a plain name for the palette', () => {
    syncDynamicCommands();
    for (const c of allCommands()) expect(c.label.trim(), c.id).not.toBe('');
  });
});

describe('shortcut sets', () => {
  for (const set of KEYMAP_SETS) {
    it(`${set.label}: no two commands share a shortcut in the same place`, () => {
      syncDynamicCommands();
      const cmds = allCommands();
      const clashes = [...allConflicts(cmds, layeredOverrides(set.id, cmds, {}))].map(([k, list]) => `${comboLabel(k, false)}: ${list.map((c) => c.id).join(', ')}`);
      expect(clashes).toEqual([]);
    });

    it(`${set.label}: every command it names exists and every key it gives is real`, () => {
      syncDynamicCommands();
      const ids = new Set(allCommands().map((c) => c.id));
      for (const [id, keys] of Object.entries(set.keys)) {
        expect(ids.has(id), id).toBe(true);
        for (const k of keys) expect(normaliseCombo(k), `${id} ${k}`).not.toBe('');
      }
    });
  }

  it('a set gives its keys, and the commands that had them let go', () => {
    syncDynamicCommands();
    const cmds = allCommands();
    const o = layeredOverrides('flash', cmds, {});
    const find = (id: string) => cmds.find((c) => c.id === id)!;
    expect(effectiveKeys(find('timeline.newKey'), o)).toEqual(['F7']);
    expect(effectiveKeys(find('symbols.edit'), o)).toEqual(['Mod+e']);
    // Export had Ctrl+E; the set moves it on, so nothing is left without a way in.
    expect(effectiveKeys(find('file.export'), o)).not.toContain('Mod+e');
  });

  it("the person's own changes stay on top of a set", () => {
    syncDynamicCommands();
    const cmds = allCommands();
    const o = layeredOverrides('pixel', cmds, { 'tools.pencil': ['y'] });
    expect(effectiveKeys(cmds.find((c) => c.id === 'tools.pencil')!, o)).toEqual(['y']);
    expect(effectiveKeys(cmds.find((c) => c.id === 'tools.rect')!, o)).toEqual(['u']);
  });
});

describe('sameContext', () => {
  it('commands with no layer limit clash with everything', () => {
    expect(sameContext({}, { layers: ['pixel'] })).toBe(true);
    expect(sameContext({ layers: ['vector', 'pixel'] }, { layers: ['pixel'] })).toBe(true);
    expect(sameContext({ layers: ['vector'] }, { layers: ['tilemap'] })).toBe(false);
  });
});
