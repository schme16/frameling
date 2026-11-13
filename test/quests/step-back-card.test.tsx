// @vitest-environment jsdom
// Going back a step to try it again, and the Great work card with its Next button.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/quests';
import { resetStore, store } from '../../src/core/store';
import { clearPraise, feedback } from '../../src/quests/feedback';
import { QuestBar } from '../../src/quests/QuestBar';
import { questProgress, registerQuest } from '../../src/quests/registry';
import { engine, playQuest } from '../../src/quests/runtime';
import type { Quest } from '../../src/quests/types';
import { vectorDoc } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../../src/quests/QuestLayer', () => ({ mountQuestLayer: () => {} }));

let root: Root;
let host: HTMLElement;

// Two steps, each done by picking a tool, so a step can be done again after going back.
const quest: Quest = {
  id: 'back-test',
  title: 'Back test',
  summary: 'for the tests',
  minutes: 1,
  icon: 'sparkle',
  steps: [
    { id: 'one', say: 'Pick the brush', did: 'You picked the brush.', done: (c) => c.state.ui.tool === 'brush' },
    { id: 'two', say: 'Pick the pencil', done: (c) => c.state.ui.tool === 'pencil' },
    { id: 'three', say: 'Pick the eraser', done: (c) => c.state.ui.tool === 'eraser' },
  ],
};
registerQuest(quest);

beforeEach(() => {
  resetStore(vectorDoc());
  feedback.set((f) => ({ ...f, praise: null }));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<QuestBar />));
  act(() => void playQuest('back-test'));
});
afterEach(() => {
  act(() => engine.stop());
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const button = (text: string) => [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === text);
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const pick = (tool: string) => act(() => { store().setUi({ tool }); });
const next = () => act(() => clearPraise());

describe('the Great work card', () => {
  it('says what you just did and waits for Next before the following step shows', () => {
    pick('brush');
    expect(questProgress.get().step).toBe(1);
    expect(host.textContent).toContain('You picked the brush.');
    // The next step's words are behind the card until you press Next.
    expect(host.textContent).not.toContain('Pick the pencil');
    click(button('Next')!);
    expect(host.textContent).toContain('Pick the pencil');
  });

  it('counts the step off when it has no words of its own', () => {
    pick('brush');
    next();
    pick('pencil');
    expect(feedback.get().praise?.did).toBeUndefined();
    expect(host.textContent).toContain("That's step 2 of 3 done.");
  });

  it('the last step hands over to the badge card instead', () => {
    pick('brush');
    next();
    pick('pencil');
    next();
    pick('eraser');
    expect(feedback.get().praise).toBeNull();
    expect(feedback.get().celebration).not.toBeNull();
  });
});

describe('going back a step', () => {
  it('has no Back on the first step, and on later ones it lands you on the step before, not yet done', () => {
    expect(button('Back')).toBeUndefined();
    pick('brush');
    next();
    expect(questProgress.get().step).toBe(1);
    expect(button('Back')).toBeDefined();
    click(button('Back')!);
    expect(questProgress.get().step).toBe(0);
    expect(questProgress.get().done['back-test'] ?? []).not.toContain('one');
    expect(host.textContent).toContain('Pick the brush');
  });

  it('waits for you to really do it again, then carries you on by itself', () => {
    pick('brush');
    next();
    click(button('Back')!);
    expect(questProgress.get().step).toBe(0);
    // The brush is still picked, so the step holds: it would be no fun to bounce straight forward again.
    expect(questProgress.get().step).toBe(0);
    pick('pencil');
    expect(questProgress.get().step).toBe(0);
    // Doing it for real carries you forward exactly as the first time.
    pick('brush');
    expect(questProgress.get().step).toBe(1);
  });
});
