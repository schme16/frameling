// @vitest-environment jsdom
// What the screen shows: the live panel with blanks and no word, the reveal in plain words, the box that starts a round
// (word dots under Stream-safe), and that the word is in the page only in the start box and the reveal.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { setStreamSafe } from '../../src/core/streamSafe';
import { REVEAL_MS } from '../../src/audience/spoilers';
import { audience, installAudience, setAudienceOn, submitAudience } from '../../src/audience';
import { GuessLayer, WARMTH_WORDS, clock, resultLine, secondsLeft } from '../../src/guess/GuessLayer';
import { _resetGuessForTests, closeRound, endRound, flushRound, peekUntil, startRound } from '../../src/guess/state';
import { closeGuessSetup, openGuessSetup } from '../../src/guess/setupState';
import { registerGuessAction } from '../../src/guess/actions';
import { clearToasts } from '../../src/ui/toast';
import { addToJar, emptyJar, jar } from '../../src/promptjar/jar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installAudience();
registerGuessAction();

describe('the words of a result', () => {
  const v = (winner: { name: string | null; afterMs: number } | null, solvers: number, players: number) => ({ winner, solvers, players, reason: 'solved' as const });
  it('says who got it and how long it took, or that nobody did', () => {
    expect(resultLine(v({ name: 'Ann', afterMs: 23_000 }, 1, 5))).toBe('Ann got it in 23 seconds.');
    expect(resultLine(v({ name: null, afterMs: 65_000 }, 1, 5))).toBe('Someone got it in 1 minute 5 seconds.');
    expect(resultLine(v({ name: 'Ann', afterMs: 4000 }, 3, 9))).toBe('Ann got it in 4 seconds. 2 more got it too.');
    expect(resultLine(v(null, 0, 4))).toBe('Nobody got it.');
    expect(resultLine(v(null, 0, 0))).toBe('Nobody guessed.');
  });
  it('reads a clock and names the warmth', () => {
    expect(clock(65)).toBe('1:05');
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
    expect(WARMTH_WORDS.hot).toBe('Hot');
  });
});

let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="guess.${id}"]`);
const text = (id: string) => q(id)?.textContent;
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const typeIn = async (id: string, value: string) => {
  const el = q(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(async () => {
  setChoiceAsker(null);
  localStorage.clear();
  for (const id of ['guess.ending', 'guess.winnerName', 'guess.peek']) setChoice(id, undefined);
  setChoice('audience.strictness', 'balanced');
  // Viewers see only the capture window unless a test says otherwise, so the word is plain in this window.
  setChoice('audience.view', 'capture');
  setStreamSafe(false);
  _resetGuessForTests();
  clearToasts();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<GuessLayer />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  closeRound();
  closeGuessSetup();
  setStreamSafe(false);
  setAudienceOn(false);
});

describe('the panel', () => {
  it('shows nothing with no round, then blanks, people and a warmth, with no word anywhere in the page', async () => {
    expect(q('panel')).toBeNull();
    await act(async () => void startRound({ word: 'zeppelin fish', seconds: null, ending: 'first' }));
    expect(q('blanks')!.querySelectorAll('.gs-tile')).toHaveLength(12);
    expect(q('blanks')!.querySelectorAll('.gs-word')).toHaveLength(2);
    expect(text('players')).toBe('0 people guessing');
    expect(text('warmth')).toContain('Waiting for a guess');
    expect(document.body.textContent).not.toMatch(/zeppelin|fish/i);
    expect(document.body.innerHTML).not.toMatch(/zeppelin/i);
  });

  it('shows a hint letter and nothing more of the word', async () => {
    await act(async () => void startRound({ word: 'zeppelin', seconds: null, ending: 'first' }));
    await act(async () => q('hint')!.click());
    const given = [...q('blanks')!.querySelectorAll('.gs-tile.is-given')].map((e) => e.textContent);
    expect(given).toHaveLength(1);
    expect('zeppelin').toContain(given[0]!);
    expect(document.body.textContent).not.toContain('zeppelin');
  });

  it('counts people and guesses live, and shows the warmth', async () => {
    audience.kill();
    setAudienceOn(true);
    await act(async () => void startRound({ word: 'horse', seconds: null, ending: 'first' }));
    await act(async () => {
      submitAudience('guess.send', { guess: 'house', player: 'a' });
      submitAudience('guess.send', { guess: 'xqzvw', player: 'b' });
      flushRound();
    });
    expect(text('players')).toBe('2 people guessing');
    expect(text('guesses')).toContain('2 guesses so far');
    expect(text('warmth')).toContain('Hot');
    expect(document.body.textContent).not.toMatch(/house|xqzvw/);
  });

  it('only has a Peek button when you allow it, and the word shows only while peeking', async () => {
    await act(async () => void startRound({ word: 'zeppelin', seconds: null, ending: 'first' }));
    expect(q('peek')).toBeNull();
    expect(host.textContent).toContain('stays hidden while the round runs');
    await act(async () => closeRound());
    setChoice('guess.peek', 'allow');
    await act(async () => void startRound({ word: 'zeppelin', seconds: null, ending: 'first' }));
    expect(q('peek')).toBeTruthy();
    expect(q('peeked')).toBeNull();
    await act(async () => q('peek')!.click());
    expect(text('peeked')).toContain('zeppelin');
    await act(async () => peekUntil.set(0));
    expect(q('peeked')).toBeNull();
    expect(document.body.textContent).not.toContain('zeppelin');
  });

  it('when your viewers can see this window there is no Peek button even when allowed', async () => {
    setChoice('guess.peek', 'allow');
    setChoice('audience.view', 'screen');
    await act(async () => void startRound({ word: 'zeppelin', seconds: null, ending: 'first' }));
    expect(q('peek')).toBeNull();
  });

  it('the reveal shows the word, who got it and a Close, and nothing is left on Close', async () => {
    await act(async () => void startRound({ word: 'zeppelin', seconds: null, ending: 'first' }));
    await act(async () => {
      endRound();
      flushRound();
    });
    expect(q('hint')).toBeNull();
    expect(text('answer')!.replace(/ /g, ' ')).toBe('zeppelin');
    expect(text('resultLine')).toBe('Nobody guessed.');
    await act(async () => q('close')!.click());
    expect(q('panel')).toBeNull();
    expect(document.body.textContent).not.toContain('zeppelin');
  });

  it('Another round closes the result and opens the start box', async () => {
    await act(async () => void startRound({ word: 'zeppelin', seconds: null, ending: 'first' }));
    await act(async () => endRound());
    await act(async () => q('again')!.click());
    expect(q('panel')).toBeNull();
    expect(q('setup.word')).toBeTruthy();
  });
});

describe('the box that starts a round', () => {
  it('will not start without a word, and says why', async () => {
    await act(async () => openGuessSetup());
    expect(text('setup.why')).toContain('word');
    expect((q('setup.start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('picks a word for you, shows it in the box, and starts the round with it, remembering only how long', async () => {
    await act(async () => openGuessSetup());
    expect((q('setup.word') as HTMLInputElement).type).toBe('text');
    expect(q('setup.show')).toBeNull();
    await act(async () => q('setup.pick')!.click());
    const picked = (q('setup.word') as HTMLInputElement).value;
    expect(picked.length).toBeGreaterThan(1);
    expect(audience.isOn()).toBe(false);
    await act(async () => q('setup.start')!.click());
    await settle();
    expect(audience.isOn()).toBe(true);
    expect(q('setup.start')).toBeNull();
    expect(q('panel')).toBeTruthy();
    expect(host.textContent).not.toContain(picked);
    const kept = Object.entries(localStorage).filter(([k]) => k.includes('guess'));
    expect(kept.length).toBe(1);
    expect(kept[0][1]).not.toContain(picked);
  });

  it('while your viewers can see this window the word is dots until you press the eye', async () => {
    setChoice('audience.view', 'screen');
    await act(async () => openGuessSetup());
    await typeIn('setup.word', 'zeppelin');
    expect((q('setup.word') as HTMLInputElement).type).toBe('password');
    await act(async () => q('setup.pick')!.click());
    expect(text('setup.note')).toContain('It is covered');
    expect((q('setup.word') as HTMLInputElement).type).toBe('password');
    await act(async () => q('setup.show')!.click());
    expect((q('setup.word') as HTMLInputElement).type).toBe('text');
    await act(async () => q('setup.show')!.click());
    expect((q('setup.word') as HTMLInputElement).type).toBe('password');
  });

  it('is covered before the question has ever been answered, and the intro says what is true', async () => {
    setChoice('audience.view', undefined);
    await act(async () => openGuessSetup());
    expect((q('setup.word') as HTMLInputElement).type).toBe('password');
    expect(q('setup.show')).toBeTruthy();
    expect(host.textContent).toContain('shows as dots');
    expect(host.textContent).not.toContain('hidden from the moment the round starts');
  });

  it('shows the word plainly, with no eye, when viewers see only the capture window', async () => {
    await act(async () => openGuessSetup());
    expect((q('setup.word') as HTMLInputElement).type).toBe('text');
    expect(q('setup.show')).toBeNull();
    expect(host.textContent).toContain('only see the capture window');
  });

  it('the eye lets go again by itself, so a word left showing does not stay on screen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      setChoice('audience.view', 'screen');
      await act(async () => openGuessSetup());
      await typeIn('setup.word', 'zeppelin');
      await act(async () => q('setup.show')!.click());
      expect((q('setup.word') as HTMLInputElement).type).toBe('text');
      await act(async () => void vi.advanceTimersByTime(REVEAL_MS + 100));
      expect((q('setup.word') as HTMLInputElement).type).toBe('password');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the ending and the winner name are set in the box and remembered as choices', async () => {
    await act(async () => openGuessSetup());
    await act(async () => q('setup.ending.timer')!.click());
    await act(async () => q('setup.names')!.click());
    const { currentChoice } = await import('../../src/core/choices');
    expect(currentChoice('guess.ending')).toBe('timer');
    expect(currentChoice('guess.winnerName')).toBe('show');
  });

  it('pulls a word from the prompt jar, and it does not sit in your hand on the jar card', async () => {
    emptyJar();
    await act(async () => openGuessSetup());
    expect((q('setup.jar') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => void addToJar('a frog in a teacup'));
    expect(text('setup.jar')).toContain('(1)');
    await act(async () => q('setup.jar')!.click());
    expect((q('setup.word') as HTMLInputElement).value).toBe('a frog in a teacup');
    expect(jar.get().hand).toBeNull();
    expect(jar.get().slips).toHaveLength(0);
    emptyJar();
  });
});
