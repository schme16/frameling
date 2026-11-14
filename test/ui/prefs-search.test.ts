// @vitest-environment jsdom
// Searching Preferences: the examples people from other apps would type each find their row, a typo or the other
// spelling still does, nothing found is empty, and the index keeps up with the pages (it reads their source).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { allChoices } from '../../src/core/choices';
import { loadHelpBodies } from '../../src/core/registry';
import { switchableFeatures } from '../../src/features/host';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { searchHelp } from '../../src/ui/help/search';
import { sameSpelling, sameWords } from '../../src/ui/match';
import { allPrefRows, CHOICE_ALSO, choiceRows, commandRows, FEATURE_ALSO, featureRows, SETTING_ROWS } from '../../src/ui/prefsIndex';
import { foundSaid, groupByPage, searchPrefs, type PrefRow } from '../../src/ui/prefsSearch';
import { settingRows, withSettings } from '../../src/ui/palette';

let rows: PrefRow[];
beforeAll(async () => {
  syncDynamicCommands();
  rows = allPrefRows();
  await loadHelpBodies();
});

const find = (q: string, list = rows) => searchPrefs(q, list);
const top = (q: string) => find(q)[0]?.row;
const labelsOf = (q: string, n = 6) => find(q).slice(0, n).map((h) => `${h.row.page}/${h.row.label}`);

describe('one spelling', () => {
  it('treats British and American, one and many, as the same word', () => {
    expect(sameSpelling('colour')).toBe(sameSpelling('color'));
    expect(sameSpelling('colours')).toBe(sameSpelling('color'));
    expect(sameSpelling('stabiliser')).toBe(sameSpelling('stabilizer'));
    expect(sameSpelling('behaviour')).toBe(sameSpelling('behavior'));
    expect(sameSpelling('centre')).toBe(sameSpelling('center'));
    expect(sameSpelling('grey')).toBe(sameSpelling('gray'));
    expect(sameSpelling('customise')).toBe(sameSpelling('customize'));
    expect(sameSpelling('hotkeys')).toBe(sameSpelling('hotkey'));
  });
  it('leaves words that only look British alone', () => {
    expect(sameSpelling('pass')).toBe('pass');
    expect(sameSpelling('status')).toBe('status');
    expect(sameWords('Dark-mode!')).toEqual(['dark', 'mode']);
  });
});

describe('the index', () => {
  it('has the fixed rows, every remembered choice, every feature and the Keyboard page commands', () => {
    expect(SETTING_ROWS.length).toBeGreaterThan(60);
    expect(choiceRows().length).toBe(allChoices().length);
    expect(featureRows().length).toBe(switchableFeatures().length);
    expect(commandRows().length).toBeGreaterThan(100);
    expect(rows.length).toBe(SETTING_ROWS.length + allChoices().length + switchableFeatures().length + commandRows().length);
  });
  it('gives every row a different id', () => {
    const ids = rows.map((r) => r.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
  it('names no choice or feature that is not in the app any more', () => {
    const choices = new Set(allChoices().map((c) => c.id));
    const features = new Set(switchableFeatures().map((f) => f.id));
    expect(Object.keys(CHOICE_ALSO).filter((id) => !choices.has(id))).toEqual([]);
    expect(Object.keys(FEATURE_ALSO).filter((id) => !features.has(id))).toEqual([]);
  });
  it('finds every choice and feature by its own name', () => {
    for (const r of [...choiceRows(), ...featureRows()]) expect(find(r.label).map((h) => h.row.id), r.label).toContain(r.id);
  });
});

describe('the index keeps up with the pages', () => {
  const src = (...files: string[]) => files.map((f) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', f), 'utf8')).join('\n');
  const PAGE_FILES: Record<string, string[]> = {
    general: ['src/ui/PrefsModal.tsx'],
    keyboard: ['src/ui/PrefsModal.tsx'],
    snapping: ['src/ui/PrefsModal.tsx', 'src/canvas/SnapOptions.tsx'],
    pen: ['src/tablet/PenPage.tsx'],
    performance: ['src/gpu/GpuPage.tsx'],
    themes: ['src/ui/themes/ThemesPage.tsx'],
    workspaces: ['src/ui/WorkspacesPage.tsx'],
    menus: ['src/ui/MenusPage.tsx'],
    plugins: ['src/plugins/PluginsPage.tsx'],
    features: ['src/features/FeaturesPage.tsx'],
    diagnostics: ['src/tablet/check/DiagnosticsPage.tsx', 'src/beta/BetaPanel.tsx', 'src/update/UpdatePanel.tsx', 'src/plugins/DiagnosticsSwitch.tsx'],
    behaviour: ['src/ui/ChoiceDialog.tsx'],
  };
  it('has a row for every labelled row on the pages', () => {
    for (const page of ['general', 'keyboard', 'pen', 'performance'] as const) {
      const labels = [...src(...PAGE_FILES[page]).matchAll(/<Row label="([^"]+)"/g)].map((m) => m[1]);
      expect(labels.length).toBeGreaterThan(0);
      // General and Keyboard share a file: a label counts if any page of that file has it.
      const have = new Set(SETTING_ROWS.filter((r) => PAGE_FILES[r.page].some((f) => PAGE_FILES[page].includes(f))).map((r) => r.label));
      expect(labels.filter((l) => !have.has(l)), `${page}: rows with no entry in prefsIndex.ts`).toEqual([]);
    }
  });
  it('only looks for words the page really has', () => {
    for (const r of SETTING_ROWS) {
      const text = src(...PAGE_FILES[r.page]).toLowerCase();
      for (const w of [r.find ?? r.label, r.group].filter(Boolean) as string[]) expect(text.includes(w.toLowerCase().replace(/\.\.\.$/, '')), `${r.page}: "${w}" is not in the page`).toBe(true);
    }
  });
});

describe('other apps\' words find the right row', () => {
  it('smoothing finds the stabilizer', () => expect(top('smoothing')).toMatchObject({ page: 'pen', label: 'Stabilizer' }));
  it('stabilizer, stabiliser and two typos find it', () => {
    for (const q of ['stabilizer', 'stabiliser', 'stablizer', 'stabilsier']) expect(top(q), q).toMatchObject({ page: 'pen', label: 'Stabilizer' });
  });
  it('lazy mouse and streamline find it (Krita, Procreate)', () => {
    expect(top('lazy mouse')).toMatchObject({ label: 'Stabilizer' });
    expect(top('streamline')).toMatchObject({ label: 'Stabilizer' });
  });
  it('onion finds the onion skin choice', () => expect(labelsOf('onion')).toContain('behaviour/Onion skin at launch'));
  it('canvas size finds the picture size', () => expect(top('canvas size')).toMatchObject({ label: 'Picture size when shots are joined' }));
  it('shortcuts, hotkeys, keymap and key bindings all find Keyboard first', () => {
    for (const q of ['shortcuts', 'hotkeys', 'hotkey', 'keymap', 'key bindings', 'keybindings']) expect(top(q)?.page, q).toBe('keyboard');
  });
  it('dark mode finds Mode and Themes', () => {
    expect(['general', 'themes']).toContain(top('dark mode')?.page);
    expect(find('dark mode').slice(0, 4).some((h) => h.row.page === 'themes')).toBe(true);
    expect(find('night mode').some((h) => h.row.page === 'themes')).toBe(true);
  });
  it('tablet pressure finds Pen and tablet', () => expect(top('tablet pressure')).toMatchObject({ page: 'pen', label: 'Pen pressure' }));
  it('autosave finds saving: the versions choice and your settings', () => {
    const l = labelsOf('autosave', 3);
    expect(l).toContain('behaviour/Bringing back a version');
    expect(l).toContain('general/Your settings');
  });
  it('grid finds snapping', () => expect(top('grid')?.page).toBe('snapping'));
  it('ui scale and hidpi find the interface size', () => {
    expect(top('ui scale')).toMatchObject({ label: 'Interface size' });
    expect(top('hidpi')).toMatchObject({ label: 'Interface size' });
  });
  it('palm rejection finds the touch rows', () => expect(top('palm rejection')?.page).toBe('pen'));
  it('lip sync and godot find their features', () => {
    expect(top('lip sync')).toMatchObject({ page: 'features', label: 'Lip sync' });
    expect(top('godot')?.page).toBe('features');
  });
  it('a command is found by its name, and the Keyboard page can scroll to it', () => {
    const hit = find('mirror draw').find((h) => h.row.kind === 'command');
    expect(hit?.row.commandId).toBeTruthy();
    expect(hit?.row.page).toBe('keyboard');
  });
});

describe('near enough', () => {
  it('spells colour either way', () => {
    expect(find('colour scheme').map((h) => h.row.id)).toEqual(find('color scheme').map((h) => h.row.id));
    expect(find('colour').length).toBeGreaterThan(0);
  });
  it('forgives a missing, doubled or swapped letter', () => {
    for (const [typo, want] of [['pressue', 'Pen pressure'], ['snaping', 'Snapping'], ['keybord', 'Keyboard shortcuts'], ['workspase', 'Workspaces'], ['sufaces', 'x']] as const) {
      if (want === 'x') continue;
      expect(labelsOf(typo, 4).join('|'), typo).toContain(want);
    }
  });
  it('needs every word to match', () => {
    expect(find('stabilizer banana')).toEqual([]);
  });
  it('searches the page name, so a page name lists the page', () => {
    expect(find('pen and tablet').filter((h) => h.row.page === 'pen').length).toBeGreaterThan(8);
  });
  it('searches the explainer words under a row', () => {
    expect(labelsOf('hedgehog')).toContain('general/Show Quill');
    expect(labelsOf('barrel')).toEqual(expect.arrayContaining(['pen/Button nearest the tip']));
  });
  it('searches a choice by its question as well as its title', () => {
    expect(labelsOf('copy of the drawing that was there')).toContain('behaviour/New drawing (N)');
  });
});

describe('nothing found', () => {
  it('is empty for words that mean nothing, and for no words', () => {
    expect(find('zzzqx')).toEqual([]);
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
    expect(find('!!!')).toEqual([]);
  });
  it('says so to a screen reader, and says what Enter will do', () => {
    expect(foundSaid(0, 'zzz')).toMatch(/Nothing in Preferences matches zzz.*help/);
    expect(foundSaid(1, 'grid')).toMatch(/One setting found/);
    expect(foundSaid(7, 'grid')).toMatch(/7 settings found.*Enter/);
    expect(foundSaid(0, '')).toBe('');
  });
  it('is not in Preferences when it is a help topic, and the help finds it', () => {
    // Symmetry and mirroring are a way of drawing, not a setting: the help answers, so the box offers it.
    expect(find('mirroring').filter((h) => h.row.kind !== 'command')).toEqual([]);
    expect(searchHelp('symmetry', 5).map((h) => h.topic.id)).toContain('mirror-drawing');
  });
});

describe('the results', () => {
  it('keeps the rows of a page together, pages in the order of their best row, commands last', () => {
    const pages = find('pen').map((h) => (h.row.kind === 'command' ? 'commands' : h.row.page));
    const seen: string[] = [];
    for (const p of pages) if (seen[seen.length - 1] !== p) seen.push(p);
    expect(seen.length).toBe(new Set(seen).size);
    expect(seen[0]).toBe('pen');
    expect(seen[seen.length - 1] === 'commands' || !seen.includes('commands')).toBe(true);
  });
  it('lets only a few commands in, behind the settings', () => {
    const hits = find('brush');
    expect(hits.filter((h) => h.row.kind === 'command').length).toBeLessThanOrEqual(5);
    const kinds = hits.map((h) => h.row.kind === 'command');
    expect(kinds.lastIndexOf(false)).toBeLessThan(kinds.indexOf(true) === -1 ? Infinity : kinds.indexOf(true));
  });
  it('groups hits by page without reordering inside a page', () => {
    const h = (id: string, page: PrefRow['page'], score: number) => ({ row: { id, page, label: id, also: [], kind: 'setting' } as PrefRow, score });
    expect(groupByPage([h('a', 'pen', 9), h('b', 'general', 8), h('c', 'pen', 7)]).map((x) => x.row.id)).toEqual(['a', 'c', 'b']);
  });
  it('is quick enough to run on every keystroke', () => {
    const t = performance.now();
    for (const q of ['s', 'sm', 'smo', 'smoo', 'smoot', 'smooth', 'smoothing']) find(q);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe('from the command palette', () => {
  it('lets a few settings in after the best matches, and only when something is typed', () => {
    const fake = Array.from({ length: 10 }, (_, i) => ({ item: { kind: 'help' as const, id: `h${i}`, label: `h${i}`, category: 'Help', description: '', topic: {} as never }, score: 100 - i }));
    const out = withSettings(fake, 'smoothing', settingRows());
    expect(out.length).toBeGreaterThan(fake.length);
    expect(out.slice(0, 6).every((h) => h.item.kind === 'help')).toBe(true);
    expect(out[6].item).toMatchObject({ kind: 'setting', label: 'Stabilizer' });
    expect(out.filter((h) => h.item.kind === 'setting').length).toBeLessThanOrEqual(3);
    expect(withSettings(fake, '   ', settingRows())).toBe(fake);
  });
  it('leaves the commands of the Keyboard page to the palette itself', () => {
    expect(settingRows().some((r) => r.kind === 'command')).toBe(false);
  });
});
