// @vitest-environment jsdom
// Lessons that need a feature are tagged, and are left out while that feature is off.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import { defineFeature } from '../../src/features/feature';
import { PLANNED_FEATURES } from '../../src/features/planned';
import { _resetFeaturesForTests, registerFeatures, setFeatureOn } from '../../src/features/host';
import { questFeaturesOn } from '../../src/features/sync';
import { allQuests, registerQuest, setStarter, startQuest } from '../../src/quests/registry';
import { QUESTS } from '../../src/quests/library';
import { lipsyncFeature } from '../../src/lipsync';
import { audioFeature } from '../../src/audio';
import { flowFeature } from '../../src/flow';
import { interactivesFeature } from '../../src/interactives';
import type { Quest } from '../../src/quests/types';

const tagged = { id: 'mini-lesson', title: 'Mini', summary: 's', minutes: 1, icon: 'help', steps: [], features: ['mini'] } as unknown as Quest;
const plain = { id: 'plain-lesson', title: 'Plain', summary: 's', minutes: 1, icon: 'help', steps: [] } as unknown as Quest;
const mini = defineFeature({ id: 'mini', name: 'Mini', about: 'A small thing.', optional: true });

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  registerFeatures([mini]);
  registerQuest(tagged);
  registerQuest(plain);
  setStarter(() => true);
});
afterEach(() => {
  setStarter(null);
  _resetFeaturesForTests();
  localStorage.clear();
});

describe('quests of a feature that is off', () => {
  it('are left out of the list and cannot be started, and come back with the feature', () => {
    const ids = () => allQuests().map((q) => q.id);
    expect(ids()).toContain('mini-lesson');
    expect(startQuest('mini-lesson')).toBe(true);
    setFeatureOn('mini', false, { remember: false });
    expect(ids()).not.toContain('mini-lesson');
    expect(ids()).toContain('plain-lesson');
    expect(startQuest('mini-lesson')).toBe(false);
    setFeatureOn('mini', true, { remember: false });
    expect(ids()).toContain('mini-lesson');
  });
});

describe('the built-in quests', () => {
  const known = new Set([...PLANNED_FEATURES, lipsyncFeature, audioFeature, flowFeature, interactivesFeature].map((f) => f.id));

  it('only name features that exist', () => {
    for (const q of QUESTS) for (const f of q.features ?? []) expect(known.has(f), `${q.id} names ${f}`).toBe(true);
  });

  it('tag the lessons for Particles, Text, Tiles, Rig and Camera', () => {
    const by = Object.fromEntries(QUESTS.map((q) => [q.id, q.features]));
    expect(by['particle-party']).toEqual(['particles']);
    expect(by['say-it-with-text']).toEqual(['text']);
    expect(by['tiles']).toEqual(['tiles']);
    expect(by['bones-and-pose']).toEqual(['rig']);
    expect(by['camera-move']).toEqual(['camera']);
  });

  it('stay available while their legacy features cannot be switched', () => {
    registerFeatures(PLANNED_FEATURES);
    expect(QUESTS.every(questFeaturesOn)).toBe(true);
  });
});
