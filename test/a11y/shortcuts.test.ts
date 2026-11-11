// @vitest-environment jsdom
// Every default shortcut, across every feature, does one thing wherever you are. Two commands may share keys only
// when they never work in the same place (the Brush and the Tile brush are both B, but one is for tile layers).
import { describe, expect, it } from 'vitest';
import { allCommands } from '../../src/core/registry';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { allConflicts, comboLabel, effectiveKeys, sameContext } from '../../src/ui/keys';
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

describe('sameContext', () => {
  it('commands with no layer limit clash with everything', () => {
    expect(sameContext({}, { layers: ['pixel'] })).toBe(true);
    expect(sameContext({ layers: ['vector', 'pixel'] }, { layers: ['pixel'] })).toBe(true);
    expect(sameContext({ layers: ['vector'] }, { layers: ['tilemap'] })).toBe(false);
  });
});
