// The house's tabs: the pure parts, and that every way into the house is a command that opens the right tab.
import { describe, expect, it } from 'vitest';
import { HOUSE_TABS, isHouseTab, stepTab, unopenedCount } from '../../src/quillpet/house';
import { quillPetCommands } from '../../src/quillpet/commands';
import { quillPetHelp } from '../../src/quillpet/help';
import { bodies } from '../../src/quillpet/help.bodies';

describe('house tabs', () => {
  it('are Room, His things and Presents, room first', () => {
    expect(HOUSE_TABS.map((t) => t.label)).toEqual(['Room', 'His things', 'Presents']);
    expect(HOUSE_TABS[0].id).toBe('room');
  });

  it('step round the ends in both directions', () => {
    expect(stepTab('room', 1)).toBe('things');
    expect(stepTab('presents', 1)).toBe('room');
    expect(stepTab('room', -1)).toBe('presents');
  });

  it('knows a tab when it sees one', () => {
    expect(isHouseTab('things')).toBe(true);
    expect(isHouseTab('shelves')).toBe(false);
  });

  it('counts only the presents still to open', () => {
    const p = (opened?: boolean) => ({ id: 'x', kind: 'crayon' as const, name: 'a', picture: '', source: { width: 1, height: 1, background: null, shapes: [] }, seed: 1, madeAt: 1, ...(opened ? { opened } : {}) });
    expect(unopenedCount([])).toBe(0);
    expect(unopenedCount([p(), p(true), p()])).toBe(2);
  });

  it('each tab has a command that opens it, and a help topic that explains it', () => {
    const ids = new Set(quillPetCommands.map((c) => c.id));
    for (const id of ['quillPet.open', 'quillPet.things', 'quillPet.presents']) expect(ids.has(id), id).toBe(true);
    const topics = new Set(quillPetHelp.map((t) => t.id));
    for (const t of HOUSE_TABS) {
      expect(topics.has(t.help), t.help).toBe(true);
      expect(bodies[t.help], t.help).toBeTruthy();
    }
  });
});
