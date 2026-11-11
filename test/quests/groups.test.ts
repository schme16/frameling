import { describe, expect, it } from 'vitest';
import { QUESTS } from '../../src/quests/library';
import { groupQuests, questGroupOf, QUEST_GROUPS } from '../../src/quests/groups';
import type { Quest } from '../../src/quests/types';

const stub = (id: string, group?: Quest['group']): Quest => ({ id, title: id, summary: '', minutes: 1, icon: 'check', steps: [], group });

describe('quest groups', () => {
  it('puts every built-in quest under a named heading', () => {
    for (const q of QUESTS) expect(questGroupOf(q), q.id).not.toBe('more');
  });

  it('sorts quests under headings in heading order, keeping their own order, with done counts', () => {
    const list = [stub('share-it'), stub('first-animation'), stub('bones-and-pose'), stub('bouncing-ball'), stub('mystery')];
    const groups = groupQuests(list, { completed: ['bouncing-ball'] });
    expect(groups.map((g) => g.title)).toEqual(['Getting started', 'Rigging and effects', 'Sharing', 'More quests']);
    expect(groups[0].quests.map((q) => q.id)).toEqual(['first-animation', 'bouncing-ball']);
    expect(groups[0].done).toBe(1);
    expect(groups[3].quests.map((q) => q.id)).toEqual(['mystery']);
  });

  it("lets a quest name its own group", () => {
    expect(questGroupOf(stub('share-it', 'motion'))).toBe('motion');
    expect(QUEST_GROUPS.map((g) => g.id)).toContain('motion');
  });
});
