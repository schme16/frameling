// @vitest-environment jsdom
// The quest card's own state: tucked away and brought back, dragged and remembered for the quest, and the commands for both.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/quests';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { cardForQuest, cardForStep, cardState, pinCard, toggleTuck, tuckCard, unpinCard } from '../../src/quests/cardState';
import { clearPraise, feedback } from '../../src/quests/feedback';
import { QuestBar } from '../../src/quests/QuestBar';
import { registerQuest } from '../../src/quests/registry';
import { engine, playQuest } from '../../src/quests/runtime';
import type { Quest } from '../../src/quests/types';
import { vectorDoc } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../../src/quests/QuestLayer', () => ({ mountQuestLayer: () => {} }));

const quest: Quest = {
  id: 'card-test',
  title: 'Card test',
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

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  resetStore(vectorDoc());
  feedback.set((f) => ({ ...f, praise: null }));
  cardForQuest(null);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<QuestBar />));
  act(() => void playQuest('card-test'));
});
afterEach(() => {
  act(() => engine.stop());
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

const card = () => host.querySelector('[data-quest="bar"]') as HTMLElement | null;
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('the quest card state', () => {
  it('starts out as the whole card, placed, with nothing dragged or tucked', () => {
    expect(card()?.dataset.card).toBe('card');
    expect(cardState.get()).toMatchObject({ quest: 'card-test', pinned: null, tucked: false });
    expect(card()?.style.left).not.toBe('');
  });

  it('tucks to the small bar and comes back with one press each way', () => {
    click(host.querySelector('.qb-tuck')!);
    expect(card()?.dataset.card).toBe('bar');
    expect(card()?.textContent).toContain('Card test');
    click(host.querySelector('.qb-tuck')!);
    expect(card()?.dataset.card).toBe('card');
  });

  it('comes back by itself when the next step begins', () => {
    tuckCard(true);
    act(() => { store().setUi({ tool: 'brush' }); store().setUi({ tool: 'pencil' }); });
    expect(cardState.get().tucked).toBe(false);
  });

  it('remembers a dragged place through the steps of the quest, and forgets it for another quest', () => {
    act(() => pinCard({ left: 300.4, top: 120.6 }));
    expect(cardState.get().pinned).toEqual({ left: 300, top: 121 });
    act(() => { store().setUi({ tool: 'brush' }); store().setUi({ tool: 'pencil' }); });
    expect(cardState.get().pinned).toEqual({ left: 300, top: 121 });
    act(() => cardForQuest('another'));
    expect(cardState.get().pinned).toBeNull();
  });

  it('keeps the place when the same quest is picked up again', () => {
    act(() => pinCard({ left: 50, top: 60 }));
    act(() => cardForQuest('card-test'));
    expect(cardState.get().pinned).toEqual({ left: 50, top: 60 });
  });

  it('puts the card where it was dragged to', () => {
    act(() => pinCard({ left: 200, top: 150 }));
    expect(card()?.style.left).toBe('200px');
    expect(card()?.style.top).toBe('150px');
    act(() => unpinCard());
    expect(card()?.style.left).not.toBe('200px');
  });

  it('is brought back by a new Great work card too', () => {
    tuckCard(true);
    act(() => void feedback.set((f) => ({ ...f, praise: { key: 99, text: 'Nice', did: 'Did it.' } })));
    expect(cardState.get().tucked).toBe(false);
    act(() => clearPraise());
  });

  it('has a command to tuck it and bring it back, and one to let it choose again', () => {
    expect(cardState.get().tucked).toBe(false);
    act(() => void getCommand('quests.tuckCard')!.run());
    expect(cardState.get().tucked).toBe(true);
    act(() => toggleTuck());
    expect(cardState.get().tucked).toBe(false);
    act(() => pinCard({ left: 10, top: 10 }));
    act(() => void getCommand('quests.cardHome')!.run());
    expect(cardState.get().pinned).toBeNull();
  });

  it('cardForStep leaves a card that is already out alone', () => {
    const before = cardState.get();
    cardForStep();
    expect(cardState.get()).toBe(before);
  });
});
