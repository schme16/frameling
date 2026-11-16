// @vitest-environment jsdom
// The drawing window's end of the board, with the real stores: what is actually in the view that goes to the board. The
// rules under test: a private board gets the secret word, the guesses and every waiting prompt in full; a board that is not
// private gets none of those words anywhere in the message, until the streamer reads them.
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, setChoice } from '../../src/core/choices';
import { registerCommands } from '../../src/core/registry';
import { guessCommands } from '../../src/guess/commands';
import { promptJarCommands } from '../../src/promptjar/commands';
import { votesCommands } from '../../src/votes/commands';
import { _resetGuessForTests, closeRound, startRound, flushRound, currentRound } from '../../src/guess/state';
import { addToJar, dropFromMemory, pullSlip, jar } from '../../src/promptjar/jar';
import { closeVote, flushVotes, startVote } from '../../src/votes/state';
import { currentView, privacyFacts, setApart } from '../../src/streamboard/link';
import { ONSTREAM_CHOICE } from '../../src/streamboard/privacy';
import { registerStreamboardChoices } from '../../src/streamboard/choices';
import { audienceChoices } from '../../src/audience/choices';
import { registerChoice } from '../../src/core/choices';

const json = () => JSON.stringify(currentView());

beforeEach(() => {
  _resetChoicesForTests();
  registerStreamboardChoices();
  for (const c of audienceChoices) registerChoice(c);
  registerCommands([...guessCommands, ...promptJarCommands, ...votesCommands]);
  setApart(false);
  closeRound();
  closeVote();
  dropFromMemory();
  _resetGuessForTests();
});

const setUp = () => {
  addToJar('a dragon on a bike');
  addToJar('a very tiny boat');
  startRound({ word: 'elephant', seconds: null, ending: 'first' });
  const r = currentRound()!;
  const p = r.prepare('giraffe', 'ann', undefined, { names: false });
  if (typeof p !== 'string') r.cast(p);
  flushRound();
  startVote({ question: 'Which colour?', options: ['Red', 'Blue'], seconds: null });
  flushVotes();
};

describe('a private board', () => {
  it('shows the vote, the word, the guesses and every waiting prompt in full', () => {
    setChoice('audience.view', 'capture');
    setUp();
    const v = currentView();
    expect(v.privacy.private).toBe(true);
    expect(v.vote?.question).toBe('Which colour?');
    expect(v.vote?.options.map((o) => o.text)).toEqual(['Red', 'Blue']);
    expect(v.guess?.word).toBe('elephant');
    expect(v.guess?.rows.map((r) => r.text)).toEqual(['giraffe']);
    expect(v.jar?.slips.map((s) => s.text)).toEqual(['a dragon on a bike', 'a very tiny boat']);
  });
  it('is private on one screen only when the board is on the other one', () => {
    setChoice('audience.view', 'display');
    setUp();
    expect(currentView().privacy.private).toBe(false);
    expect(json()).not.toMatch(/elephant|dragon/);
    setApart(true);
    expect(currentView().privacy.private).toBe(true);
    expect(currentView().guess?.word).toBe('elephant');
    setApart(false);
    expect(json()).not.toMatch(/elephant|dragon/);
  });
});

describe('a board that is not private', () => {
  it.each(['screen', 'display', undefined])('has no secret, no guess and no waiting prompt in the message (answer %s)', (answer) => {
    setChoice('audience.view', answer);
    setUp();
    const text = json();
    expect(text).not.toMatch(/elephant|giraffe|dragon|tiny boat/);
    const v = currentView();
    expect(v.guess?.word).toBeNull();
    expect(v.guess?.guesses).toBe(1);
    expect(v.jar?.count).toBe(2);
    expect(v.jar?.slips.every((s) => s.covered && s.text === null)).toBe(true);
  });
  it('still shows the vote: it is the streamer\'s own words, and it is on stream anyway', () => {
    setChoice('audience.view', 'screen');
    setUp();
    expect(currentView().vote?.question).toBe('Which colour?');
  });
  it('a board put on stream on purpose covers even when the answer says capture', () => {
    setChoice('audience.view', 'capture');
    setChoice(ONSTREAM_CHOICE, 'onstream');
    setUp();
    expect(privacyFacts().onStream).toBe(true);
    expect(json()).not.toMatch(/elephant|giraffe|dragon/);
  });
  it('the pulled prompt in hand stays covered here too', () => {
    setChoice('audience.view', 'screen');
    setUp();
    pullSlip(jar.get().slips[0].id);
    const v = currentView();
    expect(v.prompt?.covered).toBe(true);
    expect(json()).not.toContain('dragon');
  });
});
