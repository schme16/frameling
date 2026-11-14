// @vitest-environment jsdom
// Interactives is kept out of sight for now (src/features/flags.json). With the switch off, nothing a person can see
// mentions it: the menus, the command palette, the Export window, Preferences, the help, the first-run hello. With the
// switch on, all of it is back. A drawing that came out of Interactives still opens and saves, and says something plain.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDoc } from '../../src/core/doc';
import { allChoices } from '../../src/core/choices';
import { allCommands, allHelp, getCommand, helpBody, loadHelpBodies } from '../../src/core/registry';
import { INTERACTIVES_ENABLED } from '../../src/features/flags';
import { hiddenFeatureHelp, hiddenFeatureOpening, hiddenFeaturesUsedBy, hiddenHelp, isFeatureOn, offFeatureOpening, offFeatures, offFeaturesUsedBy, setFeatureOn, switchableFeatures } from '../../src/features/host';
import { hiddenDocText, hiddenFileText } from '../../src/features/prompt';
import { loadFile, saveFile } from '../../src/io/file';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';
import { paletteItems } from '../../src/ui/palette';

const WORDS = /interactives|flplay/i;
const flat = (items: MenuItem[]): string[] => items.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? flat(i.items) : []));

/** Every word a person can meet in the menus, the palette, the Export window, Preferences, the help and the hello. */
async function everyWord(): Promise<string[]> {
  const { availableFormats } = await import('../../src/export/ExportDialog');
  const { INTERESTS } = await import('../../src/ui/onboarding/flow');
  await loadHelpBodies();
  const menus = resolveMenus().flatMap((m) => flat(m.items).map((id) => `${id} ${getCommand(id)?.label ?? ''}`));
  const commands = allCommands().map((c) => [c.id, c.label, c.description, c.category, ...(c.keywords ?? [])].join(' '));
  const palette = paletteItems().map((i) => JSON.stringify(i, (k, v) => (typeof v === 'function' ? undefined : v)));
  const help = allHelp().map((t) => [t.id, t.title, t.summary, ...(t.keywords ?? []), helpBody(t)].join(' '));
  const choices = allChoices().map((c) => JSON.stringify(c, (k, v) => (typeof v === 'function' ? undefined : v)));
  const formats = availableFormats().map((f) => JSON.stringify(f));
  const prefs = switchableFeatures().map((f) => `${f.name} ${f.about}`);
  const hello = INTERESTS.map((i) => `${i.id} ${i.title} ${i.blurb} ${i.reaction}`);
  return [...menus, ...commands, ...palette, ...help, ...choices, ...formats, ...prefs, ...hello];
}

describe('Interactives, switched off (the way it ships for now)', async () => {
  const real = await import('../../src/renderer/features');
  void real;

  it('is off in the flags file', () => {
    expect(INTERACTIVES_ENABLED).toBe(false);
    expect(JSON.parse(readFileSync(path.resolve(__dirname, '../../src/features/flags.json'), 'utf8'))).toEqual({ interactives: false });
  });

  it('is not on, not in Preferences > Features, and nothing offers to turn it on', () => {
    expect(isFeatureOn('interactives')).toBe(false);
    expect(switchableFeatures().map((f) => f.id)).not.toContain('interactives');
    expect(offFeatures().map((f) => f.id)).not.toContain('interactives');
    expect(hiddenHelp().map((h) => h.feature.id)).not.toContain('interactives');
    expect(setFeatureOn('interactives', true, { remember: false }).ok).toBe(false);
    expect(paletteItems().some((i) => i.id.startsWith('features.turnOn.interactives'))).toBe(false);
  });

  it('puts none of its commands, the File menu entry, the Export card or the round trip in the app', async () => {
    for (const id of ['file.exportInteractives', 'file.openPlayable', 'file.toggleUpdatePlayable', 'file.updatePlayableNow']) expect(getCommand(id), id).toBeUndefined();
    const ids = resolveMenus().flatMap((m) => flat(m.items));
    for (const id of ['file.exportInteractives', 'file.openPlayable', 'file.toggleUpdatePlayable']) expect(ids, id).not.toContain(id);
    const { availableFormats } = await import('../../src/export/ExportDialog');
    expect(availableFormats().map((f) => f.id)).not.toContain('interactives');
    expect(availableFormats().length).toBeGreaterThan(8);
  });

  it('says the word nowhere: menus, palette, Export window, Preferences, help, the hello', async () => {
    const hits = (await everyWord()).filter((w) => WORDS.test(w));
    expect(hits.map((h) => h.slice(0, 120))).toEqual([]);
  });

  it('leaves the Godot add-on, which reads .flplay files, out with it, but the audit still counts its help', () => {
    expect(getCommand('file.exportGodotAddon')).toBeUndefined();
    expect(hiddenFeatureHelp().map((t) => t.id).sort()).toEqual(['edit-in-frameling', 'export-interactives', 'godot-addon']);
  });

  it('does not claim the .flplay file type in the installers', () => {
    const cfg = createRequire(import.meta.url)('../../electron-builder.cjs');
    expect(JSON.stringify(cfg)).not.toMatch(WORDS);
    expect(cfg.fileAssociations.map((a: { ext: string }) => a.ext)).toEqual(['frameling']);
  });

  describe('a drawing or file from Interactives', () => {
    const fromInteractives = () => Object.assign(newDoc(), { ext: { interactives: { used: true } } });

    it('opens and saves as a plain drawing and keeps what Interactives put in it', () => {
      const doc = fromInteractives();
      expect(loadFile(saveFile(doc, 't')).doc.ext).toEqual({ interactives: { used: true } });
    });

    it('is recognised as from Interactives without offering a switch that is not there', () => {
      expect(hiddenFeaturesUsedBy(fromInteractives()).map((f) => f.id)).toEqual(['interactives']);
      expect(hiddenFeaturesUsedBy(newDoc())).toEqual([]);
      expect(offFeaturesUsedBy(fromInteractives())).toEqual([]);
      expect(hiddenFeatureOpening('/art/walk.flplay')?.id).toBe('interactives');
      expect(hiddenFeatureOpening('/art/walk.frameling')).toBeUndefined();
      expect(offFeatureOpening('/art/walk.flplay')).toBeUndefined();
    });

    it('says what is going on in plain words, with no em dash', () => {
      expect(hiddenDocText('Interactives')).toBe("This drawing came out of Interactives, which isn't in this version of Frameling yet. It opens as a plain drawing, and nothing is lost: the Interactives part stays in the file.");
      expect(hiddenFileText('Interactives', 'walk.flplay')).toBe(`"walk.flplay" is an Interactives file, and Interactives isn't in this version of Frameling yet, so it can't be opened here. The file hasn't been touched.`);
      expect(hiddenDocText('Interactives') + hiddenFileText('Interactives', 'a.flplay')).not.toMatch(/—/);
    });

    it('toasts the plain words when such a drawing or file is opened', async () => {
      const notify = vi.fn();
      vi.doMock('../../src/io/notify', () => ({ notify }));
      vi.resetModules();
      await import('../../src/renderer/features');
      const { offerTurnOn, explainHiddenFile } = await import('../../src/features/prompt');
      expect(await offerTurnOn(fromInteractives())).toEqual([]);
      expect(notify.mock.calls[0][0]).toContain('This drawing came out of Interactives');
      expect(explainHiddenFile('/art/walk.flplay', 'walk.flplay')).toBe(true);
      expect(notify.mock.calls[1][0]).toContain('"walk.flplay" is an Interactives file');
      expect(explainHiddenFile('/art/walk.frameling', 'walk.frameling')).toBe(false);
      vi.doUnmock('../../src/io/notify');
    });
  });
});

describe('Interactives, switched on (flags.json: true)', () => {
  afterEach(() => vi.resetModules());
  // Fresh copies of every module, with the switch on before the app registers anything.
  const bringBack = async () => {
    vi.resetModules();
    (await import('../../src/features/flags'))._forceInteractivesForTests(true);
    await import('../../src/renderer/features');
  };

  it('is a feature in Preferences again, on, with its commands, menu entries and Export card', async () => {
    await bringBack();
    const host = await import('../../src/features/host');
    const registry = await import('../../src/core/registry');
    const { resolveMenus: menus } = await import('../../src/ui/menus');
    const { availableFormats } = await import('../../src/export/ExportDialog');
    expect(host.switchableFeatures().map((f) => f.id)).toContain('interactives');
    expect(host.isFeatureOn('interactives')).toBe(true);
    for (const id of ['file.exportInteractives', 'file.openPlayable', 'file.toggleUpdatePlayable', 'file.updatePlayableNow']) expect(registry.getCommand(id), id).toBeTruthy();
    const ids = menus().flatMap((m) => flat(m.items));
    for (const id of ['file.exportInteractives', 'file.openPlayable', 'file.toggleUpdatePlayable']) expect(ids, id).toContain(id);
    expect(availableFormats().map((f) => f.id)).toContain('interactives');
    expect(registry.getCommand('file.exportGodotAddon')).toBeTruthy();
    expect(host.hiddenFeatureHelp()).toEqual([]);
  });

  it('has its help, its remembered choice and its mentions in other topics back', async () => {
    await bringBack();
    const registry = await import('../../src/core/registry');
    const { getChoiceDef } = await import('../../src/core/choices');
    await registry.loadHelpBodies();
    for (const id of ['export-interactives', 'edit-in-frameling', 'godot-addon']) expect(registry.getHelp(id), id).toBeTruthy();
    expect(registry.helpBody(registry.getHelp('export-interactives')!)).toContain('Interactives builds clickable pages');
    expect(registry.helpBody(registry.getHelp('exporting')!)).toContain('[Interactives](help:export-interactives)');
    expect(getChoiceDef('interactives.saveTarget')).toBeTruthy();
    const { INTERESTS } = await import('../../src/ui/onboarding/flow');
    expect(INTERESTS.map((i) => i.id)).toContain('interactives');
  });

  it('can be switched off again, and a .flplay then asks to turn it on, as before', async () => {
    await bringBack();
    const host = await import('../../src/features/host');
    expect(host.setFeatureOn('interactives', false, { remember: false }).ok).toBe(true);
    expect(host.offFeatureOpening('/art/walk.flplay')?.id).toBe('interactives');
    expect(host.hiddenFeatureOpening('/art/walk.flplay')).toBeUndefined();
  });
});
