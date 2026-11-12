// @vitest-environment jsdom
// Everything a feature adds outside the main registries is tagged with it and goes when it is turned off: canvas
// decorations, overlays, grabs and pointer hooks, file openers and save hooks, choices and template sources.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCanvasGrab, addPointerDownHook, addStageOverlay, getStageOverlays, grabAt, runPointerDownHooks } from '../../src/canvas/controller';
import { drawDecorations, registerDecoration } from '../../src/canvas/decorations';
import { getChoiceDef, registerChoice } from '../../src/core/choices';
import { defineFeature } from '../../src/features/feature';
import { _resetFeaturesForTests, registerFeatures, setFeatureOn } from '../../src/features/host';
import { openPath, registerOpener, registerSaveHook, saveDocument } from '../../src/io/document';
import { registerTemplateSource, templateSources } from '../../src/templates/user';
import { resetStore } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';

const calls: string[] = [];
const overlay = () => void calls.push('overlay');
const grab = { hit: () => true, down: () => undefined, move: () => undefined, up: () => undefined };
const gx = { save: () => undefined, restore: () => undefined } as unknown as CanvasRenderingContext2D;
const opened: string[] = [];
const saved: string[] = [];

const feature = defineFeature({
  id: 'owns-things',
  name: 'Owns things',
  about: 'Registers everything.',
  optional: true,
  choices: [{ id: 'owns.choice', title: 'T', question: 'Q?', category: 'Test', default: 'a', options: [{ value: 'a', label: 'A', detail: '' }] }],
  activate() {
    registerDecoration(() => void calls.push('decoration'));
    addStageOverlay(overlay);
    addCanvasGrab(grab);
    addPointerDownHook(() => void calls.push('down'));
    registerOpener((p) => p.endsWith('.owned'), async (_b, p) => (opened.push(p), true));
    registerSaveHook({ instead: async () => (saved.push('instead'), true) });
    registerChoice({ id: 'owns.second', title: 'T', question: 'Q?', category: 'Test', default: 'a', options: [{ value: 'a', label: 'A', detail: '' }] });
    registerTemplateSource({ id: 'owns-source', title: 'Owned', empty: 'None', list: async () => [] });
  },
});

beforeEach(() => {
  calls.length = 0;
  opened.length = 0;
  saved.length = 0;
  _resetFeaturesForTests();
  resetStore(newDoc());
  (window as unknown as { frameling: unknown }).frameling = {
    versions: { app: 'test', electron: '', chrome: '' },
    files: { read: async (path: string) => ({ path, bytes: new Uint8Array() }), write: async () => ({ ok: true }), save: async () => null },
    recent: { add: async () => undefined, remove: async () => undefined, list: async () => [] },
    autosave: { clear: async () => undefined, removeKept: async () => undefined },
    app: { askSaveChanges: async () => 'discard' },
  };
});
afterEach(() => {
  _resetFeaturesForTests();
  delete (window as unknown as { frameling?: unknown }).frameling;
});

const present = async () => {
  calls.length = 0;
  drawDecorations(gx, {} as never);
  runPointerDownHooks({ x: 0, y: 0 }, 'pencil');
  const r = {
    decoration: calls.includes('decoration'),
    down: calls.includes('down'),
    overlay: getStageOverlays().includes(overlay),
    grab: grabAt({ x: 0, y: 0 }, 1) === grab,
    choice: !!getChoiceDef('owns.choice') && !!getChoiceDef('owns.second'),
    source: templateSources().some((s) => s.id === 'owns-source'),
    opener: false,
    saveHook: false,
  };
  opened.length = 0;
  await openPath('a.owned');
  r.opener = opened.length > 0;
  saved.length = 0;
  await saveDocument();
  r.saveHook = saved.length > 0;
  return r;
};

describe('what a feature registers outside the main registries', () => {
  it('is all there while it is on, all gone when off, and all back when on again', async () => {
    registerFeatures([feature]);
    const on = { decoration: true, down: true, overlay: true, grab: true, choice: true, source: true, opener: true, saveHook: true };
    expect(await present()).toEqual(on);
    expect(setFeatureOn('owns-things', false, { remember: false }).ok).toBe(true);
    expect(await present()).toEqual(Object.fromEntries(Object.keys(on).map((k) => [k, false])));
    expect(setFeatureOn('owns-things', true, { remember: false }).ok).toBe(true);
    expect(await present()).toEqual(on);
  });

  it('a template source that replaced another one gives it back', () => {
    const base = { id: 'shared-source', title: 'Base', empty: '', list: async () => [] };
    registerTemplateSource(base);
    const f = defineFeature({ id: 'swap', name: 'Swap', about: '.', optional: true, activate: () => registerTemplateSource({ ...base, title: 'Swapped' }) });
    registerFeatures([f]);
    expect(templateSources().find((s) => s.id === 'shared-source')!.title).toBe('Swapped');
    setFeatureOn('swap', false, { remember: false });
    expect(templateSources().find((s) => s.id === 'shared-source')!.title).toBe('Base');
  });

  it('things registered with no feature stay for good', () => {
    const o = () => undefined;
    addStageOverlay(o);
    registerFeatures([feature]);
    setFeatureOn('owns-things', false, { remember: false });
    expect(getStageOverlays().includes(o)).toBe(true);
    vi.restoreAllMocks();
  });
});
