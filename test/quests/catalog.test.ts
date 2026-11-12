// @vitest-environment jsdom
// The catalog (what the start-up knows of each quest) says the same as the library (the whole quests, loaded on demand).
import { describe, expect, it } from 'vitest';
import { QUEST_CATALOG } from '../../src/quests/catalog';
import { QUESTS } from '../../src/quests/library';
import { allQuests, getFullQuest, getQuest, registerQuest } from '../../src/quests/registry';

const info = ({ steps, prepare, ready, finish, ...rest }: (typeof QUESTS)[number]) => rest;

describe('the quest catalog', () => {
  it('lists every quest of the library, in the same order, with the same names, icons, badges and needs', () => {
    expect(QUEST_CATALOG).toEqual(QUESTS.map(info));
  });

  it('is what the registry knows before the library loads, and the library replaces it with the whole quest', () => {
    // library.ts has been imported by this file, so each entry is full by now, in the catalog's place and order.
    expect(allQuests().map((q) => q.id).slice(0, QUEST_CATALOG.length)).toEqual(QUEST_CATALOG.map((q) => q.id));
    for (const q of QUESTS) expect(getFullQuest(q.id)).toBe(q);
  });

  it('gives a catalog-only quest no steps', () => {
    const [first] = QUEST_CATALOG;
    registerQuest({ ...first, id: 'only-in-catalog' });
    expect(getQuest('only-in-catalog')?.title).toBe(first.title);
    expect(getFullQuest('only-in-catalog')).toBeUndefined();
  });
});
