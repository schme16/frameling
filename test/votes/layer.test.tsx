// @vitest-environment jsdom
// What the screen shows: the live panel, the result in plain words, the box that writes a vote, and that the panel has
// nothing on it that does anything with the result.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { audience, installAudience, setAudienceOn, submitAudience } from '../../src/audience';
import { VoteLayer, clock, resultLine, secondsLeft } from '../../src/votes/VoteLayer';
import { _resetVotesForTests, closeVote, endVote, flushVotes, startVote } from '../../src/votes/state';
import { closeVoteSetup, openVoteSetup } from '../../src/votes/setupState';
import { registerVoteAction } from '../../src/votes/actions';
import { outcomeOf } from '../../src/votes/tally';
import { toasts } from '../../src/ui/toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installAudience();

describe('the words of a result', () => {
  const v = (counts: number[]) => ({ options: ['Red', 'Blue', 'Green'], counts, total: counts.reduce((a, b) => a + b, 0), outcome: outcomeOf(counts) });
  it('says who won, a tie, or that nobody voted', () => {
    expect(resultLine(v([1, 5, 2]))).toBe('Blue wins with 5 votes of 8.');
    expect(resultLine(v([0, 1, 0]))).toBe('Blue wins with 1 vote of 1.');
    expect(resultLine(v([3, 3, 1]))).toBe('A tie: Red and Blue, 3 votes each.');
    expect(resultLine(v([0, 0, 0]))).toBe('No votes came in.');
  });
  it('reads a clock', () => {
    expect(clock(65)).toBe('1:05');
    expect(clock(0)).toBe('0:00');
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
  });
});

let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="votes.${id}"]`);
const text = (id: string) => q(id)?.textContent;
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(async () => {
  setChoiceAsker(null);
  localStorage.clear();
  setChoice('audience.strictness', 'balanced');
  _resetVotesForTests();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<VoteLayer />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  closeVote();
  closeVoteSetup();
});

describe('the panel', () => {
  it('shows nothing with no vote, then live counts, then the result with a Close and nothing else to press', async () => {
    expect(q('panel')).toBeNull();
    await act(async () => void startVote({ question: 'Which colour next?', options: ['Red', 'Blue'], seconds: null }));
    expect(text('question')).toBe('Which colour next?');
    expect(text('total')).toBe('0 votes');
    expect(q('end')).toBeTruthy();
    await act(async () => {
      flushVotes();
      endVote();
    });
    expect(q('end')).toBeNull();
    expect(text('resultLine')).toBe('No votes came in.');
    // The only button on a result is Close: nothing applies, uses or sets anything.
    const buttons = [...host.querySelectorAll('.vt-panel button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Close']);
    await act(async () => q('close')!.click());
    expect(q('panel')).toBeNull();
  });
});

describe('the box that writes a vote', () => {
  it('will not start without a question and two options, and says why', async () => {
    await act(async () => openVoteSetup());
    expect(text('setup.why')).toContain('question');
    expect((q('setup.start') as HTMLButtonElement).disabled).toBe(true);
    expect(q('setup.option.3')).toBeNull();
    await act(async () => q('setup.add')!.click());
    expect(q('setup.option.3')).toBeTruthy();
  });
  it('starts the vote, turning audience features on, and remembers only how long', async () => {
    registerVoteAction();
    const set = async (id: string, value: string) => {
      const el = q(id) as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await act(async () => openVoteSetup());
    await set('setup.question', 'Next?');
    await set('setup.option.1', 'Red');
    await set('setup.option.2', 'Blue');
    expect(audience.isOn()).toBe(false);
    await act(async () => q('setup.start')!.click());
    await settle();
    // The master switch is the streamer's: a vote says it cannot reach anybody and offers the switch, never flips it.
    expect(audience.isOn()).toBe(false);
    expect(q('question')).toBeNull();
    const ask = toasts.get().find((x) => x.action?.id === 'votes-switch-on')!;
    expect(ask.message).toContain('nobody can vote yet');
    await act(async () => ask.action!.run());
    await settle();
    expect(audience.isOn()).toBe(true);
    expect(text('question')).toBe('Next?');
    expect(q('setup.start')).toBeNull();
    expect(submitAudience('vote.cast', { option: 1, voter: 'x' }).ok).toBe(true);
    const kept = Object.entries(localStorage).filter(([k]) => k.includes('votes'));
    expect(kept.length).toBe(1);
    expect(kept[0][1]).not.toMatch(/Next|Red|Blue/);
    setAudienceOn(false);
  });
});
