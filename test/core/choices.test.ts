import { beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, askMeAgain, choose, currentChoice, forgetAnswers, isWeary, planAsk, registerChoice, rememberedChoice, setChoice, setChoiceAsker, setChoiceDeferral, setGentleTeller, setUsualAnswers, usualAnswerIds, WEARY_AFTER, wearyAnswer, withChoice } from '../../src/core/choices';

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

describe('closing a question twice', () => {
  const risky = { ...def, id: 't.risky', mustAsk: true };
  const careful = { ...def, id: 't.careful', default: 'copy', dismiss: 'blank' };
  let asked = 0;
  const closeIt = () => setChoiceAsker(async () => (asked++, null));

  beforeEach(() => {
    _resetChoicesForTests();
    registerChoice(def);
    asked = 0;
    registerChoice(risky);
    registerChoice(careful);
  });

  it('asks again after one close, and stops after two', async () => {
    closeIt();
    expect(await choose('t.n')).toBe('blank');
    expect(await choose('t.n')).toBe('blank');
    expect(asked).toBe(2);
    expect(await choose('t.n')).toBe('blank');
    expect(asked).toBe(2);
  });

  it('remembers nothing, so Preferences still says Ask me', async () => {
    closeIt();
    await choose('t.n');
    await choose('t.n');
    await choose('t.n');
    expect(rememberedChoice('t.n')).toBeUndefined();
  });

  it('uses what closing does (the dismiss answer), never the default, when they differ', async () => {
    closeIt();
    await choose('t.careful');
    await choose('t.careful');
    expect(await choose('t.careful')).toBe('blank');
    expect(wearyAnswer(careful)).toBe('blank');
    expect(wearyAnswer(def)).toBe('blank');
  });

  it('never stops asking a question that can lose work', async () => {
    closeIt();
    for (let i = 0; i < 5; i++) await choose('t.risky');
    expect(asked).toBe(5);
  });

  it('an answer in between starts the count again', async () => {
    closeIt();
    await choose('t.n');
    setChoiceAsker(async () => (asked++, { value: 'copy', remember: false }));
    expect(await choose('t.n')).toBe('copy');
    closeIt();
    await choose('t.n');
    await choose('t.n');
    expect(asked).toBe(4);
    await choose('t.n');
    expect(asked).toBe(4);
  });

  it('counts each question on its own', async () => {
    closeIt();
    await choose('t.n');
    await choose('t.n');
    await choose('t.careful');
    expect(asked).toBe(3);
  });

  it('through withChoice it does the answer and tells the person, with a way to change it', async () => {
    closeIt();
    await choose('t.n');
    await choose('t.n');
    const told: string[] = [];
    setGentleTeller((d, v, run, _undo, notRemembered) => {
      told.push(`${d.id}:${v}:${notRemembered}`);
      run(v);
    });
    const got: string[] = [];
    withChoice('t.n', (v) => got.push(v));
    expect(got).toEqual(['blank']);
    expect(told).toEqual(['t.n:blank:true']);
    expect(rememberedChoice('t.n')).toBeUndefined();
    expect(asked).toBe(2);
    setGentleTeller(null);
  });

  it('is a pure rule: planAsk, isWeary', () => {
    const facts = { remembered: false, canAsk: true, silent: false, matters: true, gently: false, mustAsk: false, canTell: true };
    expect(planAsk({ ...facts, weary: true })).toBe('weary');
    expect(planAsk({ ...facts, weary: true, mustAsk: true })).toBe('sheet');
    expect(planAsk({ ...facts, weary: true, remembered: true })).toBe('remembered');
    expect(planAsk({ ...facts, weary: true, gently: true })).toBe('weary');
    expect(planAsk(facts)).toBe('sheet');
    expect(isWeary(1, { mustAsk: false })).toBe(false);
    expect(isWeary(WEARY_AFTER, { mustAsk: false })).toBe(true);
    expect(isWeary(9, { mustAsk: true })).toBe(false);
    expect(isWeary(9, undefined)).toBe(false);
  });

  it('Ask me again puts the question back', async () => {
    closeIt();
    await choose('t.n');
    await choose('t.n');
    await choose('t.n');
    expect(asked).toBe(2);
    askMeAgain('t.n');
    await choose('t.n');
    expect(asked).toBe(3);
  });
});

describe('the usual answers for everything', () => {
  beforeEach(() => {
    _resetChoicesForTests();
    registerChoice(def);
  });

  it('counts what it would answer, leaving out answered and must-ask ones, and Undo forgets just those', () => {
    registerChoice({ ...def, id: 'u.a' });
    registerChoice({ ...def, id: 'u.b' });
    registerChoice({ ...def, id: 'u.c', mustAsk: true });
    setChoice('u.b', 'copy');
    expect(usualAnswerIds().sort()).toEqual(['t.n', 'u.a']);
    const set = setUsualAnswers();
    expect(set.sort()).toEqual(['t.n', 'u.a']);
    expect(rememberedChoice('u.a')).toBe('blank');
    expect(rememberedChoice('u.c')).toBeUndefined();
    expect(usualAnswerIds()).toEqual([]);
    forgetAnswers(set);
    expect(rememberedChoice('u.a')).toBeUndefined();
    expect(rememberedChoice('u.b')).toBe('copy');
    expect(usualAnswerIds().sort()).toEqual(['t.n', 'u.a']);
  });
});
