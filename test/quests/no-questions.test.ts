// @vitest-environment jsdom
// A lesson never gets a settings question: the Space question waits until the lesson is over.
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/canvas/choices';
import '../../src/quests';
import { _resetChoicesForTests, registerChoice, setChoiceAsker, withChoice, getChoiceDef } from '../../src/core/choices';
import { questProgress } from '../../src/quests/registry';
import '../../src/quests/runtime';

describe('questions during a lesson', () => {
  const spaceDef = getChoiceDef('canvas.spaceTap')!;
  afterEach(() => {
    questProgress.set((p) => ({ ...p, active: null }));
    _resetChoicesForTests();
  });
  it('Tapping Space plays without asking while a quest is active, and asks after', async () => {
    registerChoice(spaceDef);
    let asked = 0;
    setChoiceAsker(async () => (asked++, { value: 'play', remember: true }));
    questProgress.set((p) => ({ ...p, active: 'first-animation' }));
    const seen: string[] = [];
    withChoice('canvas.spaceTap', (v) => seen.push(v));
    expect(seen).toEqual(['play']);
    expect(asked).toBe(0);
    questProgress.set((p) => ({ ...p, active: null }));
    withChoice('canvas.spaceTap', (v) => seen.push(v));
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toBe(1);
  });
});
