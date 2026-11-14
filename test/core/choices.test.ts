import { beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, choose, currentChoice, registerChoice, rememberedChoice, setChoice, setChoiceAsker, setChoiceDeferral, withChoice } from '../../src/core/choices';

const def = {
  id: 't.n',
  title: 'N',
  question: 'Blank or copy?',
  options: [
    { value: 'blank', label: 'Blank' },
    { value: 'copy', label: 'Copy' },
  ],
  default: 'blank',
  category: 'Timeline',
};

describe('choices', () => {
  beforeEach(() => {
    _resetChoicesForTests();
    registerChoice(def);
  });

  it('uses the default without an asker, and does not remember it', async () => {
    expect(await choose('t.n')).toBe('blank');
    expect(rememberedChoice('t.n')).toBeUndefined();
  });

  it('asks once, remembers, and stops asking', async () => {
    let asked = 0;
    setChoiceAsker(async () => (asked++, { value: 'copy', remember: true }));
    expect(await choose('t.n')).toBe('copy');
    expect(await choose('t.n')).toBe('copy');
    expect(asked).toBe(1);
    expect(currentChoice('t.n')).toBe('copy');
  });

  it('asks again when not remembered, and shares one dialog between callers', async () => {
    let asked = 0;
    setChoiceAsker(async () => (asked++, { value: 'copy', remember: false }));
    const [a, b] = await Promise.all([choose('t.n'), choose('t.n')]);
    expect([a, b]).toEqual(['copy', 'copy']);
    expect(asked).toBe(1);
    await choose('t.n');
    expect(asked).toBe(2);
  });

  it('falls back to the default when the dialog is closed', async () => {
    setChoiceAsker(async () => null);
    expect(await choose('t.n')).toBe('blank');
  });

  it('forgets an answer so it is asked again', async () => {
    setChoice('t.n', 'copy');
    setChoice('t.n', undefined);
    expect(rememberedChoice('t.n')).toBeUndefined();
  });

  it('does not ask while a lesson plays: takes the default, remembers nothing, asks after', async () => {
    let asked = 0;
    let lesson = true;
    setChoiceAsker(async () => (asked++, { value: 'copy', remember: true }));
    setChoiceDeferral(() => lesson);
    const seen: string[] = [];
    withChoice('t.n', (v) => seen.push(v));
    expect(seen).toEqual(['blank']);
    expect(await choose('t.n')).toBe('blank');
    expect(asked).toBe(0);
    expect(rememberedChoice('t.n')).toBeUndefined();
    lesson = false;
    expect(await choose('t.n')).toBe('copy');
    expect(asked).toBe(1);
  });

  it('a remembered answer still wins during a lesson', async () => {
    setChoice('t.n', 'copy');
    setChoiceDeferral(() => true);
    expect(await choose('t.n')).toBe('copy');
  });
});
