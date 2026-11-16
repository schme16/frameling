// @vitest-environment jsdom
// Coming back to his house, as you would see it. The promise again: a long break gives you more to come back to, the
// room reads as warm after an hour or a year, and nothing on screen counts the days you were out.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setQuillSheet } from '../../src/ui/mascot/runtime';
import { QuillPetPanel } from '../../src/quillpet/QuillPetPanel';
import { dayKey, FRESH_PET, type PetState } from '../../src/quillpet/model';
import { petStore, setPet } from '../../src/quillpet/store';
import { cameBack, claimHello, forgetReturn, GREET_MS, greeting, LATELY_CHOICE, napStore, settleIn } from '../../src/quillpet/welcome';
import { startWatching } from '../../src/quillpet/watch';
import { seeded } from '../../src/quillpet/potter';
import { registerLatelyChoice } from '../../src/quillpet/choices';
import { setChoice } from '../../src/core/choices';
import { line } from '../../src/ui/mascot/lines';
import { setHouseTab } from '../../src/quillpet/house';
import { FAKE_SHEET as S } from '../fixtures/quill-sheet';
import '../../src/renderer/features';
import { ABSENCE_WORDS } from './absence-words';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../src/ui/dock', async (orig) => ({ ...(await orig<typeof import('../../src/ui/dock')>()), showPanel: vi.fn() }));

const DAY = 86400000;
const NOW = Date.now();
const daysAgo = (n: number) => dayKey(NOW - n * DAY);
const THINGS = [
  { id: 'a', name: 'Lighthouse', picture: 'data:image/png;base64,AA', givenAt: new Date(2026, 2, 3).getTime() },
  { id: 'b', name: 'Fish', picture: 'data:image/png;base64,AA', givenAt: NOW - DAY },
];
const pet = (n: number): PetState => ({ ...FRESH_PET, metAt: NOW - 500 * DAY, days: 12, closeness: 30, lastDay: daysAgo(n), things: THINGS, colours: ['#ff0000', '#00aa44'] });

let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  setQuillSheet({ ...S, url: 'quill.png', width: 128, height: 352 });
  forgetReturn();
  registerLatelyChoice();
  setChoice(LATELY_CHOICE, undefined);
  setHouseTab('room');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  forgetReturn();
});

/** Come back after `n` days away and open the room. Gives back everything the room says, bar the one count of days spent together. */
async function comeBackAfter(n: number): Promise<{ text: string; said: string; items: number; mood: string }> {
  setPet(pet(n));
  settleIn(NOW, seeded(4));
  await act(async () => root.render(<QuillPetPanel />));
  const together = host.querySelector('.qp-days');
  const text = [...host.querySelectorAll('.qp-stage, .qp-says, .qp-lately, .qp-colours')].map((e) => e.textContent).join(' | ');
  void together;
  return { text, said: host.querySelector('.qp-says')?.textContent ?? '', items: host.querySelectorAll('.qp-lately-item').length, mood: host.querySelector('.qp-mood')?.textContent ?? '' };
}

describe('coming back, as you see it', () => {
  it('a longer break shows more to come back to, never less', async () => {
    const counts: number[] = [];
    for (const n of [1, 4, 12, 40, 400]) {
      act(() => root.render(<></>));
      forgetReturn();
      counts.push((await comeBackAfter(n)).items);
    }
    expect(counts).toEqual([1, 2, 3, 4, 4]);
  });

  it('says the very same warm hello after a day and after a year', async () => {
    const day = await comeBackAfter(1);
    act(() => root.render(<></>));
    forgetReturn();
    const year = await comeBackAfter(400);
    expect(day.said).toBe(line('pet.hello.again'));
    expect(year.said).toBe(day.said);
    expect(year.said).not.toMatch(ABSENCE_WORDS);
    expect(year.said).not.toMatch(/\d/);
  });

  it('and after an hour (the same day) he is just as warm, with nothing to count', async () => {
    setPet({ ...pet(0), lastDay: dayKey(NOW) });
    settleIn(NOW, seeded(4));
    expect(cameBack()).toBe(false);
    await act(async () => root.render(<QuillPetPanel />));
    expect(host.querySelector('.qp-says')?.textContent).toBe(line('pet.hello'));
    expect(host.querySelector('.qp-lately')).toBeNull();
    expect(host.querySelector('.qp-stage')!.textContent).not.toMatch(ABSENCE_WORDS);
  });

  it('nothing on screen counts days, weeks, months or years, after a day or after ten years', async () => {
    for (const n of [1, 9, 400, 3650]) {
      act(() => root.render(<></>));
      forgetReturn();
      const { text } = await comeBackAfter(n);
      expect(text, `after ${n}`).not.toMatch(ABSENCE_WORDS);
      expect(text, `after ${n}`).not.toMatch(/\d+\s*(days?|weeks?|months?|years?|hours?|minutes?)/i);
      // The dates of gifts are fine ("on 3 March"), and the only other numbers are the ones he was given.
      expect(text).not.toMatch(/ago/i);
    }
  });

  it('he is found asleep somewhere new, says where in plain words, and wakes happily for a scratch', async () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      act(() => root.render(<></>));
      forgetReturn();
      setPet(pet(40));
      settleIn(NOW, seeded(seed));
      found = napStore.get().spot !== null;
    }
    expect(found).toBe(true);
    await act(async () => root.render(<QuillPetPanel />));
    expect(host.querySelector('.qp-mood')?.textContent).toMatch(/^Fast asleep (on the windowsill|in the middle of the floor|at the desk|by the bowl)$/);
    await act(async () => void (host.querySelector('.qp-pat') as HTMLElement).click());
    expect(napStore.get().spot).toBeNull();
    expect(host.querySelector('.qp-mood')?.textContent).not.toMatch(/Fast asleep/);
  });

  it('waves hello for a few seconds, and then gets on with things', () => {
    setPet(pet(30));
    settleIn(NOW, seeded(4));
    expect(greeting(1_000)).toBe(true);
    expect(greeting(1_000 + GREET_MS - 1)).toBe(true);
    expect(greeting(1_000 + GREET_MS + 1)).toBe(false);
    expect(greeting(1_000_000_000)).toBe(false);
  });

  it('says hello once a run, so switching tabs does not repeat it', () => {
    setPet(pet(30));
    settleIn(NOW, seeded(4));
    expect(claimHello()).toBe(true);
    expect(claimHello()).toBe(false);
  });

  it('the news is there when the room opens, and is the same every time you look', async () => {
    const first = await comeBackAfter(12);
    expect(first.items).toBe(3);
    act(() => root.render(<></>));
    const again = await comeBackAfter(12);
    expect(again.text).toContain(first.text.split(' | ')[2].slice(0, 20));
  });
});

describe('the order of things when the app starts', () => {
  it('sees you have been out before it notes you are here, so the news and the hello are real', () => {
    setPet(pet(9));
    const stop = startWatching();
    expect(petStore.get().lastDay).toBe(dayKey(Date.now()));
    expect(cameBack()).toBe(true);
    expect(petStore.get().lately?.did.length).toBe(2);
    stop();
  });

  it('a fresh Quill, meeting you for the first time, has nothing to come back to and no hello', () => {
    setPet(FRESH_PET);
    const stop = startWatching();
    expect(cameBack()).toBe(false);
    expect(petStore.get().lately).toBeUndefined();
    stop();
  });

  it('starting twice in a day makes no second lot of news', () => {
    setPet(pet(9));
    const stop = startWatching();
    const first = petStore.get().lately;
    stop();
    forgetReturn();
    const stop2 = startWatching();
    expect(petStore.get().lately).toBe(first);
    stop2();
  });

  it('with "keep the room as it is" chosen there is no news, and he still says hello', () => {
    setChoice(LATELY_CHOICE, 'no');
    setPet(pet(40));
    settleIn(NOW, seeded(4));
    expect(petStore.get().lately).toBeUndefined();
    expect(napStore.get().spot).toBeNull();
    expect(cameBack()).toBe(true);
  });

  it('what settling in hands back is nothing at all, so the break cannot leak out through it', () => {
    setPet(pet(400));
    expect(settleIn(NOW, seeded(4))).toBeUndefined();
  });
});
