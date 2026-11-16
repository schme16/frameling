// @vitest-environment jsdom
// The question sheet: Learn more steps the sheet aside so the help can be read, Escape comes back to the question with
// nothing answered on the way, a second question waits its turn, and the usual-answers button says what it will do.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetChoicesForTests, choose, registerChoice, rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { applyUsualAnswers, asking, ChoiceDialog, helpTarget, putQuestion, usualAnswersLabel } from '../../src/ui/ChoiceDialog';
import { closeHelp, overlays } from '../../src/ui/overlays';
import { clearToasts, toasts } from '../../src/ui/toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const mk = (id: string, extra = {}) =>
  registerChoice({ id, title: `Q ${id}`, question: `Question ${id}?`, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a', category: 'Test', ...extra });
const sheet = () => host.querySelector<HTMLElement>('.ui-choice-wrap')!;
const settle = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  _resetChoicesForTests();
  setChoiceAsker(putQuestion);
  localStorage.clear();
  clearToasts();
  closeHelp();
  asking.set(() => null);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<ChoiceDialog />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Learn more', () => {
  it('steps the sheet aside while the help is open, and brings it back the way it was', async () => {
    mk('l.one', { help: 'behaviour#dialogs' });
    let answer: string | undefined;
    void choose('l.one').then((v) => (answer = v));
    await settle();
    // Pick B, then read the help.
    act(() => host.querySelector<HTMLElement>('[data-testid="choice.l.one.b"]')!.click());
    act(() => host.querySelector<HTMLElement>('[data-testid="choice.l.one.help"]')!.click());
    expect(overlays.get().help).toEqual({ topic: 'behaviour', anchor: 'dialogs', query: undefined });
    expect(sheet().style.display).toBe('none');
    // Closing the help (what Escape does) brings the same question back, still on B, and nothing was answered.
    act(() => closeHelp());
    expect(sheet().style.display).toBe('');
    expect(host.querySelector('[data-testid="choice.l.one.b"]')!.getAttribute('aria-checked')).toBe('true');
    await settle();
    expect(answer).toBeUndefined();
    expect(rememberedChoice('l.one')).toBeUndefined();
    expect(asking.get()?.def.id).toBe('l.one');
  });

  it('splits a topic and its heading', () => {
    expect(helpTarget('behaviour#dialogs')).toEqual(['behaviour', 'dialogs']);
    expect(helpTarget('timeline-tidy-end')).toEqual(['timeline-tidy-end', undefined]);
  });
});

describe('two questions at once', () => {
  it('the second waits its turn instead of replacing the first', async () => {
    mk('w.one');
    mk('w.two');
    const got: string[] = [];
    void choose('w.one').then((v) => got.push(`one:${v}`));
    void choose('w.two').then((v) => got.push(`two:${v}`));
    await settle();
    expect(asking.get()?.def.id).toBe('w.one');
    act(() => host.querySelector<HTMLElement>('[data-testid="choice.w.one.ok"]')!.click());
    await settle();
    expect(asking.get()?.def.id).toBe('w.two');
    act(() => host.querySelector<HTMLElement>('[data-testid="choice.w.two.ok"]')!.click());
    await settle();
    expect(got).toEqual(['one:a', 'two:a']);
    expect(asking.get()).toBeNull();
  });
});

describe('the usual answers for everything', () => {
  it('says how many it will answer, and only the first sheet carries it', async () => {
    mk('u.one');
    mk('u.two');
    mk('u.three', { mustAsk: true });
    void choose('u.one');
    await settle();
    const btn = host.querySelector<HTMLElement>('[data-testid="choice.usual"]')!;
    expect(btn.textContent).toBe('Answer all 2 questions the usual way and stop asking');
    expect(usualAnswersLabel(1)).toBe('Answer all 1 question the usual way and stop asking');
    // Meeting a sheet counts: the next one has no button.
    act(() => host.querySelector<HTMLElement>('[data-testid="choice.u.one.ok"]')!.click());
    await settle();
    void choose('u.two');
    await settle();
    expect(host.querySelector('[data-testid="choice.usual"]')).toBeNull();
  });

  it('answers them, says so, and Undo puts the questions back', () => {
    mk('u.one');
    mk('u.two');
    mk('u.three', { mustAsk: true });
    setChoice('u.two', 'b');
    expect(applyUsualAnswers()).toBe(1);
    expect(rememberedChoice('u.one')).toBe('a');
    const t = toasts.get()[0];
    expect(t.message).toBe('Answered 1 question the usual way. Nothing will ask now.');
    expect(t.action?.label).toBe('Undo');
    act(() => t.action!.run());
    expect(rememberedChoice('u.one')).toBeUndefined();
    expect(rememberedChoice('u.two')).toBe('b');
  });
});
