import { beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, planAsk, registerChoice, rememberedChoice, setChoice, setChoiceAsker, setGentleTeller, setUsualAnswers, withChoice, allChoices, type AskFacts } from '../../src/core/choices';

const base: AskFacts = { remembered: false, canAsk: true, silent: false, matters: true, gently: false, mustAsk: false, canTell: true };

describe('planAsk: how a choice is put', () => {
  it('uses what is remembered, whatever else is true', () => {
    expect(planAsk({ ...base, remembered: true, gently: true })).toBe('remembered');
  });
  it('asks nothing when every answer would do the same thing', () => {
    expect(planAsk({ ...base, matters: false })).toBe('usual');
    expect(planAsk({ ...base, matters: false, gently: true })).toBe('usual');
  });
  it('asks nothing when there is no way to ask, or it is only a preference', () => {
    expect(planAsk({ ...base, canAsk: false })).toBe('usual');
    expect(planAsk({ ...base, silent: true })).toBe('usual');
  });
  it('does the usual thing and says so when it can, if the call allows it', () => {
    expect(planAsk({ ...base, gently: true })).toBe('toast');
  });
  it('stops and asks when the call does not allow a toast, there is no toast, or the choice must ask', () => {
    expect(planAsk(base)).toBe('sheet');
    expect(planAsk({ ...base, gently: true, canTell: false })).toBe('sheet');
    expect(planAsk({ ...base, gently: true, mustAsk: true })).toBe('sheet');
  });
});

const def = (id: string, extra: object = {}) => ({
  id,
  title: id,
  question: 'Which?',
  options: [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ],
  default: 'a',
  category: 'Test',
  ...extra,
});

describe('withChoice with a moment to judge', () => {
  let asked: string[];
  beforeEach(() => {
    _resetChoicesForTests();
    registerChoice(def('t.one'));
    asked = [];
    setChoiceAsker(async (d) => (asked.push(d.id), { value: 'b', remember: true }));
  });

  it('does not ask or remember when it makes no difference, and uses the usual answer in the same tick', () => {
    let got = '';
    withChoice('t.one', (v) => void (got = v), { matters: false });
    expect(got).toBe('a');
    expect(asked).toEqual([]);
    expect(rememberedChoice('t.one')).toBeUndefined();
  });

  it('still honours a remembered answer when it makes no difference', () => {
    setChoice('t.one', 'b');
    let got = '';
    withChoice('t.one', (v) => void (got = v), { matters: false });
    expect(got).toBe('b');
  });

  it('asks the sheet when it matters and the call is not gentle', async () => {
    let got = '';
    withChoice('t.one', (v) => void (got = v));
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual(['t.one']);
    expect(got).toBe('b');
  });

  it('hands a gentle call to the teller with the usual answer, and remembers it so the toast is a one-off', () => {
    const told: string[] = [];
    setGentleTeller((d, value, run) => (told.push(`${d.id}:${value}`), run(value)));
    let got = '';
    withChoice('t.one', (v) => void (got = v), { gently: true });
    expect(got).toBe('a');
    expect(told).toEqual(['t.one:a']);
    expect(asked).toEqual([]);
    expect(rememberedChoice('t.one')).toBe('a');
    withChoice('t.one', () => {}, { gently: true });
    expect(told.length).toBe(1);
  });

  it('a choice that must ask is never gentle', async () => {
    _resetChoicesForTests();
    registerChoice(def('t.must', { mustAsk: true }));
    setChoiceAsker(async (d) => (asked.push(d.id), { value: 'b', remember: true }));
    let told = 0;
    setGentleTeller(() => void told++);
    withChoice('t.must', () => {}, { gently: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(told).toBe(0);
    expect(asked).toEqual(['t.must']);
  });
});

describe('Answer all the questions the usual way', () => {
  beforeEach(() => {
    _resetChoicesForTests();
    registerChoice(def('t.a'));
    registerChoice(def('t.b', { default: 'b' }));
    registerChoice(def('t.answered'));
    registerChoice(def('t.must', { mustAsk: true }));
    registerChoice(def('t.pref', { silent: true }));
  });

  it('sets each question to its default, and leaves answered, silent and must-ask ones alone', () => {
    setChoice('t.answered', 'b');
    expect(setUsualAnswers()).toEqual(['t.a', 't.b']);
    expect(rememberedChoice('t.a')).toBe('a');
    expect(rememberedChoice('t.b')).toBe('b');
    expect(rememberedChoice('t.answered')).toBe('b');
    expect(rememberedChoice('t.must')).toBeUndefined();
    expect(rememberedChoice('t.pref')).toBeUndefined();
  });

  it('keeps every choice listed, and each can still be changed or forgotten', () => {
    const before = allChoices().map((c) => c.id);
    setUsualAnswers();
    expect(allChoices().map((c) => c.id)).toEqual(before);
    setChoice('t.a', 'b');
    expect(rememberedChoice('t.a')).toBe('b');
    setChoice('t.a', undefined);
    expect(rememberedChoice('t.a')).toBeUndefined();
  });

  it('makes withChoice act at once, asking nothing', () => {
    let asked = 0;
    setChoiceAsker(async () => (asked++, null));
    setUsualAnswers();
    let got = '';
    withChoice('t.a', (v) => void (got = v));
    expect(got).toBe('a');
    expect(asked).toBe(0);
  });
});
