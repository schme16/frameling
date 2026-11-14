// @vitest-environment jsdom
// A choice that would have stopped the hand: the usual thing happens, a toast says so, and Change redoes it the other way.
import { beforeEach, describe, expect, it } from 'vitest';
import { registerChoice, rememberedChoice, setChoice, setChoiceAsker, withChoice } from '../../src/core/choices';
import { resetStore, store } from '../../src/core/store';
import { newDoc } from '../../src/core/doc';
import '../../src/ui/ChoiceDialog';
import { clearToasts, toasts } from '../../src/ui/toast';

registerChoice({
  id: 'g.mark',
  title: 'Mark',
  question: 'Which mark?',
  options: [
    { value: 'one', label: 'One', did: 'Made the first mark.' },
    { value: 'two', label: 'Two', did: 'Made the second mark.' },
  ],
  default: 'one',
  category: 'Test',
});

const marks = () => store().get().doc.name;
const make = (v: string) => store().update('Mark', (d) => void (d.name = v));
const press = (label = 'Change') => toasts.get()[0].action!.run();
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetStore(newDoc());
  clearToasts();
  setChoice('g.mark', undefined);
  setChoiceAsker(null);
});

describe('doing the usual thing and saying so', () => {
  it('does it at once, toasts what was done, and remembers it', () => {
    setChoiceAsker(async () => null);
    withChoice('g.mark', make, { gently: true });
    expect(marks()).toBe('one');
    expect(toasts.get().map((t) => t.message)).toEqual(['Made the first mark.']);
    expect(toasts.get()[0].action?.label).toBe('Change');
    expect(rememberedChoice('g.mark')).toBe('one');
    // The next time it just happens.
    clearToasts();
    withChoice('g.mark', make, { gently: true });
    expect(toasts.get()).toEqual([]);
  });

  it('Change undoes it and does it the other way, and remembers the new answer', async () => {
    setChoiceAsker(async () => null);
    withChoice('g.mark', make, { gently: true });
    setChoiceAsker(async (def) => ({ value: 'two', remember: true, started: def.highlight } as never));
    press();
    await settle();
    expect(marks()).toBe('two');
    expect(rememberedChoice('g.mark')).toBe('two');
    // One undo step, not two: undoing goes back to before either.
    store().undo();
    expect(marks()).not.toBe('one');
    expect(marks()).not.toBe('two');
  });

  it('Change opens the sheet on the answer that was used', async () => {
    setChoiceAsker(async () => null);
    withChoice('g.mark', make, { gently: true });
    let started = '';
    setChoiceAsker(async (def) => ((started = def.highlight ?? ''), null));
    press();
    await settle();
    expect(started).toBe('one');
    expect(marks()).toBe('one');
  });

  it('Change with the same answer only remembers it, and without Remember asks again next time', async () => {
    setChoiceAsker(async () => null);
    withChoice('g.mark', make, { gently: true });
    setChoiceAsker(async () => ({ value: 'one', remember: false }));
    press();
    await settle();
    expect(marks()).toBe('one');
    expect(rememberedChoice('g.mark')).toBeUndefined();
  });

  it('closing the Change sheet changes nothing', async () => {
    setChoiceAsker(async () => null);
    withChoice('g.mark', make, { gently: true });
    press();
    await settle();
    expect(marks()).toBe('one');
    expect(rememberedChoice('g.mark')).toBe('one');
  });

  it('does not undo something else if more has happened since', async () => {
    setChoiceAsker(async () => null);
    withChoice('g.mark', make, { gently: true });
    store().update('Later', (d) => void (d.name = 'later'));
    setChoiceAsker(async () => ({ value: 'two', remember: true }));
    press();
    await settle();
    expect(marks()).toBe('later');
    expect(rememberedChoice('g.mark')).toBe('two');
  });

  it('says nothing, and remembers nothing, when nothing happened', () => {
    setChoiceAsker(async () => null);
    withChoice('g.mark', () => {}, { gently: true });
    expect(toasts.get()).toEqual([]);
    expect(rememberedChoice('g.mark')).toBeUndefined();
  });

  it('takes back with its own undo when one is given (a workspace switch is not an undo step)', async () => {
    setChoiceAsker(async () => null);
    let on = '';
    withChoice('g.mark', (v) => void (on = v), { gently: { undo: () => void (on = 'nothing') } });
    expect(on).toBe('one');
    setChoiceAsker(async () => ({ value: 'two', remember: true }));
    press();
    await settle();
    expect(on).toBe('two');
  });
});
