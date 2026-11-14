// @vitest-environment jsdom
// The feature host: what a descriptor registers, taking exactly that away when it is turned off, bringing it back, order
// and requirements, and the saved choice.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allCommands, allHelp, allPanels, allTools, getCommand, getHelp, getPanel, getTool } from '../../src/core/registry';
import { defineFeature } from '../../src/features/feature';
import { _resetFeaturesForTests, getFeature, hiddenHelp, hiddenTemplateIds, isFeatureOn, offFeatures, offFeaturesUsedBy, orderFeatures, registerFeatures, setFeatureOn, switchableFeatures } from '../../src/features/host';
import { allQuests } from '../../src/quests/registry';
import { MENUS, resolveMenu } from '../../src/ui/menus';
import { PANEL_INFO } from '../../src/ui/panelInfo';
import { newDoc } from '../../src/core/doc';

const Dummy = () => null;
const mini = (id: string, extra: Partial<Parameters<typeof defineFeature>[0]> = {}) =>
  defineFeature({
    id,
    name: id.toUpperCase(),
    about: `The ${id} feature.`,
    optional: true,
    commands: [{ id: `${id}.go`, label: `Go ${id}`, category: 'Test', run: () => {} }],
    panels: [{ id: `${id}-panel`, title: id, icon: 'help', component: Dummy, zone: 'right' }],
    tools: [{ id: `${id}-tool`, label: id, icon: 'brush', layers: ['vector'] }],
    help: [{ id: `${id}-help`, title: `About ${id}`, summary: 'S.', body: 'B.', section: 'Test' }],
    quests: [{ id: `${id}-quest`, title: id, blurb: 'b', steps: [] } as never],
    templates: [`${id}-template`],
    menus: [{ menu: 'Animate', items: [`${id}.go`] }],
    sections: { [`${id}-panel`]: { blurb: 'Blurb.', group: 'more' } },
    ...extra,
  });

const snapshot = () => ({
  commands: allCommands().map((c) => c.id).sort(),
  panels: allPanels().map((p) => p.id).sort(),
  tools: allTools().map((t) => t.id).sort(),
  help: allHelp().map((h) => h.id).sort(),
  quests: allQuests().map((q) => q.id).sort(),
  info: Object.keys(PANEL_INFO).sort(),
});
const animate = () => resolveMenu(MENUS.find((m) => m.label === 'Animate')!).flatMap((i) => (i.kind === 'command' ? [i.command.id] : []));

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
});
afterEach(() => _resetFeaturesForTests());

describe('registering a feature', () => {
  it('puts in everything the descriptor lists', () => {
    const before = snapshot();
    registerFeatures([mini('aa')]);
    expect(getCommand('aa.go')).toBeTruthy();
    expect(getPanel('aa-panel')).toBeTruthy();
    expect(getTool('aa-tool')).toBeTruthy();
    expect(getHelp('aa-help')).toBeTruthy();
    expect(allQuests().some((q) => q.id === 'aa-quest')).toBe(true);
    expect(PANEL_INFO['aa-panel']).toBeTruthy();
    expect(animate()).toContain('aa.go');
    expect(snapshot()).not.toEqual(before);
  });

  it('turning it off takes away exactly what it added, and on brings it all back', () => {
    const before = snapshot();
    const menuBefore = animate();
    registerFeatures([mini('aa')]);
    const withIt = snapshot();
    expect(setFeatureOn('aa', false, { remember: false })).toEqual({ ok: true });
    expect(isFeatureOn('aa')).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(animate()).toEqual(menuBefore);
    expect(hiddenTemplateIds().has('aa-template')).toBe(true);
    expect(hiddenHelp().map((h) => h.topic.id)).toEqual(['aa-help']);
    expect(setFeatureOn('aa', true, { remember: false })).toEqual({ ok: true });
    expect(snapshot()).toEqual(withIt);
    expect(animate()).toContain('aa.go');
    expect(hiddenTemplateIds().size).toBe(0);
    expect(hiddenHelp()).toEqual([]);
  });

  it('leaves things other code registered alone', () => {
    registerFeatures([mini('aa'), mini('bb')]);
    setFeatureOn('aa', false, { remember: false });
    expect(getCommand('bb.go')).toBeTruthy();
    expect(getPanel('bb-panel')).toBeTruthy();
    expect(getCommand('aa.go')).toBeUndefined();
  });

  it('runs activate inside the owner scope, so what it registers goes with it', async () => {
    const { registerCommand } = await import('../../src/core/registry');
    registerFeatures([mini('aa', { activate: () => registerCommand({ id: 'aa.late', label: 'Late', category: 'Test', run: () => {} }) })]);
    expect(getCommand('aa.late')).toBeTruthy();
    setFeatureOn('aa', false, { remember: false });
    expect(getCommand('aa.late')).toBeUndefined();
    setFeatureOn('aa', true, { remember: false });
    expect(getCommand('aa.late')).toBeTruthy();
  });

  it('calls deactivate when it goes', () => {
    let n = 0;
    registerFeatures([mini('aa', { deactivate: () => n++ })]);
    setFeatureOn('aa', false, { remember: false });
    expect(n).toBe(1);
  });

  it('tells listeners', async () => {
    const { onFeaturesChange } = await import('../../src/features/host');
    const seen: string[] = [];
    registerFeatures([mini('aa')]);
    onFeaturesChange((e) => seen.push(`${e.id}:${e.on}`));
    setFeatureOn('aa', false, { remember: false });
    setFeatureOn('aa', false, { remember: false });
    setFeatureOn('aa', true, { remember: false });
    expect(seen).toEqual(['aa:false', 'aa:true']);
  });
});

describe('what can be switched', () => {
  it('core and legacy features cannot be turned off', () => {
    registerFeatures([mini('core1', { optional: false }), mini('old1', { legacy: true })]);
    expect(setFeatureOn('core1', false).ok).toBe(false);
    expect(setFeatureOn('old1', false).ok).toBe(false);
    expect(setFeatureOn('nope', false).ok).toBe(false);
    expect(switchableFeatures()).toEqual([]);
    expect(getCommand('core1.go')).toBeTruthy();
  });

  it('ids nobody registered count as on', () => {
    expect(isFeatureOn('whatever')).toBe(true);
  });
});

describe('order and requirements', () => {
  it('orders so requirements come first, and says so in words when it cannot', () => {
    const a = mini('aa', { requires: ['bb'] });
    const b = mini('bb');
    expect(orderFeatures([a, b]).map((d) => d.id)).toEqual(['bb', 'aa']);
    expect(() => orderFeatures([mini('aa', { requires: ['zz'] })])).toThrow(/needs "zz"/);
    expect(() => orderFeatures([mini('aa', { requires: ['bb'] }), mini('bb', { requires: ['aa'] })])).toThrow(/circle/);
    expect(() => orderFeatures([mini('aa'), mini('aa')])).toThrow(/share an id/);
  });

  it('will not turn a feature off while another that is on needs it', () => {
    registerFeatures([mini('aa', { requires: ['bb'] }), mini('bb')]);
    const r = setFeatureOn('bb', false, { remember: false });
    expect(r).toEqual({ ok: false, reason: 'AA needs BB. Turn off AA first.' });
    expect(isFeatureOn('bb')).toBe(true);
    expect(setFeatureOn('aa', false, { remember: false }).ok).toBe(true);
    expect(setFeatureOn('bb', false, { remember: false }).ok).toBe(true);
  });

  it('turning a feature on turns on what it needs', () => {
    registerFeatures([mini('aa', { requires: ['bb'] }), mini('bb')]);
    setFeatureOn('aa', false, { remember: false });
    setFeatureOn('bb', false, { remember: false });
    expect(setFeatureOn('aa', true, { remember: false }).ok).toBe(true);
    expect(isFeatureOn('bb')).toBe(true);
    expect(getCommand('bb.go')).toBeTruthy();
  });
});

describe('the saved choice', () => {
  it('is kept, and a feature saved as off stays out at the next start', () => {
    registerFeatures([mini('aa')]);
    setFeatureOn('aa', false);
    expect(JSON.parse(localStorage.getItem('frameling.features.v1')!)).toEqual(['aa']);
    _resetFeaturesForTests();
    registerFeatures([mini('aa')]);
    expect(isFeatureOn('aa')).toBe(false);
    expect(getCommand('aa.go')).toBeUndefined();
    expect(getFeature('aa')).toBeTruthy();
    expect(offFeatures().map((d) => d.id)).toEqual(['aa']);
    setFeatureOn('aa', true);
    expect(JSON.parse(localStorage.getItem('frameling.features.v1')!)).toEqual([]);
  });

  it('survives unreadable saved data', () => {
    localStorage.setItem('frameling.features.v1', '{not json');
    registerFeatures([mini('aa')]);
    expect(isFeatureOn('aa')).toBe(true);
  });
});

describe('files that use a feature', () => {
  it('names the features that are off and used by a document', () => {
    registerFeatures([mini('aa', { usedBy: (d) => !!d.ext?.aa }), mini('bb', { usedBy: (d) => !!d.ext?.bb })]);
    const doc = { ...newDoc(), ext: { aa: { x: 1 }, bb: { y: 1 } } };
    expect(offFeaturesUsedBy(doc)).toEqual([]);
    setFeatureOn('aa', false, { remember: false });
    expect(offFeaturesUsedBy(doc).map((d) => d.id)).toEqual(['aa']);
    expect(offFeaturesUsedBy(newDoc())).toEqual([]);
  });
});
