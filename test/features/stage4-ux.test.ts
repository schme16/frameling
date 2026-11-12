// @vitest-environment jsdom
// Small things around turning a feature off and on: its panels come back where they were, a lesson that needed it is put
// down politely, and the command palette offers to turn it on.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineFeature } from '../../src/features/feature';
import { _resetFeaturesForTests, onFeaturesChange, registerFeatures, setFeatureOn } from '../../src/features/host';
import { activeQuestOf, handleFeatureChange } from '../../src/features/sync';
import { dock, hidePanel, isVisible, movePanel, placeOf, placePanel, resetDock, resetLayout, zoneOf } from '../../src/ui/dock';
import { paletteItems, rankPalette, TURN_ON_PREFIX, turnOnCommands } from '../../src/ui/palette';
import { questProgress, setStopper } from '../../src/quests/registry';
import { FRESH_PROGRESS, type Quest } from '../../src/quests/types';
import { allPanels } from '../../src/core/registry';

const Dummy = () => null;
const quest = { id: 'mini-quest', title: 'Mini lesson', blurb: 'b', icon: 'help', steps: [] } as unknown as Quest;
const mini = defineFeature({
  id: 'mini',
  name: 'Mini',
  about: 'A small thing.',
  optional: true,
  commands: [{ id: 'mini.go', label: 'Go mini', category: 'Test', keywords: ['tiny'], run: () => {} }],
  panels: [
    { id: 'mini-a', title: 'Mini A', icon: 'help', component: Dummy, zone: 'right' },
    { id: 'mini-b', title: 'Mini B', icon: 'help', component: Dummy, zone: 'right' },
  ],
  quests: [quest],
});

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  registerFeatures([mini]);
  onFeaturesChange(handleFeatureChange);
  resetDock();
  resetLayout();
  questProgress.set({ ...FRESH_PROGRESS });
});
afterEach(() => {
  setStopper(null);
  _resetFeaturesForTests();
  localStorage.clear();
});

describe('panels of a feature that is turned off and on', () => {
  it('come back in the same zone and place among the tabs', () => {
    movePanel('mini-a', 'bottom', 0);
    const tabs = () => dock.get().layout.zones.bottom.tabs;
    const index = tabs().indexOf('mini-a');
    expect(zoneOf('mini-a')).toBe('bottom');
    setFeatureOn('mini', false, { remember: false });
    expect(isVisible('mini-a')).toBe(false);
    expect(tabs()).not.toContain('mini-a');
    setFeatureOn('mini', true, { remember: false });
    expect(zoneOf('mini-a')).toBe('bottom');
    expect(tabs().indexOf('mini-a')).toBe(index);
    expect(zoneOf('mini-b')).toBe('right');
  });

  it('stay closed when they were closed', () => {
    hidePanel('mini-b');
    expect(isVisible('mini-b')).toBe(false);
    setFeatureOn('mini', false, { remember: false });
    setFeatureOn('mini', true, { remember: false });
    expect(isVisible('mini-b')).toBe(false);
    expect(dock.get().layout.hidden).toContain('mini-b');
    expect(zoneOf('mini-a')).toBe('right');
  });

  it('come back in a floating window where it was', () => {
    placePanel('mini-a', { newFloat: { x: 300, y: 200, w: 400, h: 300 } });
    expect(placeOf('mini-a')).toHaveProperty('float');
    setFeatureOn('mini', false, { remember: false });
    expect(placeOf('mini-a')).toBeNull();
    setFeatureOn('mini', true, { remember: false });
    const at = placeOf('mini-a') as { float: string };
    const win = dock.get().layout.floats.find((f) => f.id === at.float)!;
    expect([win.x, win.y, win.w, win.h]).toEqual([300, 200, 400, 300]);
  });

  it('a panel this layout never saw is placed in its home zone when the feature comes on', () => {
    setFeatureOn('mini', false, { remember: false });
    const l = dock.get().layout;
    dock.set({ ...dock.get(), layout: { ...l, known: l.known.filter((id) => !id.startsWith('mini-')) } });
    setFeatureOn('mini', true, { remember: false });
    expect(zoneOf('mini-a')).toBe('right');
    expect(allPanels().some((p) => p.id === 'mini-a')).toBe(true);
  });

  it('keep their place after a restart with the feature off in between', () => {
    movePanel('mini-a', 'bottom', 0);
    setFeatureOn('mini', false, { remember: false });
    // The parked place is in storage, not only in memory.
    expect(localStorage.getItem('frameling.dock.parked.v1')).toContain('mini-a');
    setFeatureOn('mini', true, { remember: false });
    expect(zoneOf('mini-a')).toBe('bottom');
    expect(localStorage.getItem('frameling.dock.parked.v1') ?? '{}').not.toContain('mini-a');
  });
});

describe('a lesson of a feature that is turned off', () => {
  it('is put down with a word, and is not touched when something else goes off', () => {
    let stopped = 0;
    setStopper(() => void stopped++);
    questProgress.set({ ...FRESH_PROGRESS, active: 'mini-quest' });
    expect(activeQuestOf(mini)).toEqual({ id: 'mini-quest', title: 'Mini lesson' });
    setFeatureOn('mini', false, { remember: false });
    expect(stopped).toBe(1);
  });

  it('leaves a lesson of something else alone', () => {
    let stopped = 0;
    setStopper(() => void stopped++);
    questProgress.set({ ...FRESH_PROGRESS, active: 'first-animation' });
    setFeatureOn('mini', false, { remember: false });
    expect(stopped).toBe(0);
  });
});

describe('the command palette for a feature that is off', () => {
  it('offers "Turn on <feature>" when someone types, found by what its commands are called', () => {
    expect(paletteItems().some((i) => i.id.startsWith(TURN_ON_PREFIX))).toBe(false);
    setFeatureOn('mini', false, { remember: false });
    const hit = rankPalette('tiny', paletteItems(), [])[0];
    expect(hit.item.id).toBe(`${TURN_ON_PREFIX}mini`);
    expect(hit.item.label).toBe('Turn on Mini');
    expect(rankPalette('mini', paletteItems(), []).map((h) => h.item.id)).toContain(`${TURN_ON_PREFIX}mini`);
  });

  it('stays quiet with nothing typed, and running it turns the feature on', () => {
    setFeatureOn('mini', false, { remember: false });
    expect(rankPalette('', paletteItems(), []).some((h) => h.item.id.startsWith(TURN_ON_PREFIX))).toBe(false);
    const [c] = turnOnCommands();
    c.run();
    expect(zoneOf('mini-a')).not.toBeNull();
    expect(turnOnCommands()).toEqual([]);
  });
});
