// @vitest-environment jsdom
// The whole app with every optional feature that can be switched turned off: the help audit and the shortcut check
// still pass, nothing of those features is left registered, and turning them back on restores it exactly.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCommands, allHelp, allPanels, allTools, getCommand, getHelp, getPanel } from '../../src/core/registry';
import { hiddenHelp, isFeatureOn, setFeatureOn, switchableFeatures } from '../../src/features/host';
import { auditHelp } from '../../src/ui/help/audit';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { allConflicts, comboLabel } from '../../src/ui/keys';
import { KEYMAP_SETS } from '../../src/ui/keymapSets';
import { layeredOverrides } from '../../src/ui/keys';
import { MENUS, resolveMenu } from '../../src/ui/menus';
import { paletteItems } from '../../src/ui/palette';
import '../../src/renderer/features';

const helpDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/help');
const EXTRA_KEYS = ['Mod+W', 'Mod+T', 'F2', ...KEYMAP_SETS.flatMap((s) => Object.values(s.keys).flat())];

const snap = () => {
  syncDynamicCommands();
  return { commands: allCommands().map((c) => c.id).sort(), panels: allPanels().map((p) => p.id).sort(), tools: allTools().map((t) => t.id).sort(), help: allHelp().map((h) => h.id).sort() };
};

const allOn = snap();
const features = switchableFeatures();

describe('every optional feature turned off', () => {
  beforeAll(() => {
    // Newest first, so a feature goes before the ones it needs (Lip sync before Audio).
    for (const f of [...features].reverse()) expect(setFeatureOn(f.id, false, { remember: false }).ok, f.id).toBe(true);
    syncDynamicCommands();
  });
  afterAll(() => {
    for (const f of [...features].reverse()) setFeatureOn(f.id, true, { remember: false });
    syncDynamicCommands();
  });

  it('there is something to turn off', () => {
    expect(features.map((f) => f.id)).toContain('lipsync');
  });

  it('their commands, panels, tools and help are gone', () => {
    const now = snap();
    for (const f of features) {
      for (const c of f.commands ?? []) expect(getCommand(c.id), c.id).toBeUndefined();
      for (const p of f.panels ?? []) {
        expect(getPanel(p.id), p.id).toBeUndefined();
        expect(getCommand(`view.panel.${p.id}`), `view.panel.${p.id}`).toBeUndefined();
      }
      for (const h of f.help ?? []) expect(getHelp(h.id), h.id).toBeUndefined();
    }
    expect(now.commands.length).toBeLessThan(allOn.commands.length);
  });

  it('the menus and the palette do not show them', () => {
    const ids = new Set(features.flatMap((f) => (f.commands ?? []).map((c) => c.id)));
    const inMenus = MENUS.flatMap((m) => resolveMenu(m)).filter((i) => i.kind === 'command' && ids.has(i.command.id));
    expect(inMenus).toEqual([]);
    const items = paletteItems().filter((i) => (i.kind === 'command' ? ids.has(i.id) : hiddenHelp().some((h) => h.topic.id === i.id)));
    expect(items).toEqual([]);
  });

  it('the help audit is clean', () => {
    const a = auditHelp({ topics: allHelp(), hiddenTopics: hiddenHelp().map((h) => h.topic), commands: allCommands(), panels: allPanels(), tools: allTools(), files: readdirSync(helpDir), extraKeys: EXTRA_KEYS });
    expect(a.commandsWithoutHelp).toEqual([]);
    expect(a.topicsWithoutMedia).toEqual([]);
    expect(a.missingMedia).toEqual([]);
    expect(a.orphanFiles).toEqual([]);
    expect(a.brokenLinks).toEqual([]);
    expect(a.shortcutDrift).toEqual([]);
  });

  it('no two commands share a shortcut in the same place', () => {
    syncDynamicCommands();
    const cmds = allCommands();
    const clash = (o: ReturnType<typeof layeredOverrides> | Record<string, never>) => [...allConflicts(cmds, o)].map(([k, list]) => `${comboLabel(k, false)}: ${list.map((c) => c.id).join(', ')}`);
    expect(clash({})).toEqual([]);
    for (const set of KEYMAP_SETS) expect(clash(layeredOverrides(set.id, cmds, {})), set.label).toEqual([]);
  });

  it('turning them back on restores everything that was there', () => {
    for (const f of [...features].reverse()) setFeatureOn(f.id, true, { remember: false });
    for (const f of features) expect(isFeatureOn(f.id)).toBe(true);
    expect(snap()).toEqual(allOn);
    for (const f of [...features].reverse()) setFeatureOn(f.id, false, { remember: false });
  });
});
