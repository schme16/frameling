// @vitest-environment jsdom
// The page's half of the window-close question: it registers with the desktop side, shows the dialog, tells it when it is
// up, answers, and takes the dialog down when the desktop side withdraws the question.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCloseQuestions } from '../../src/io/closeQuestion';
import { saveAsking, setSaveAskMounted, answerSave } from '../../src/io/saveAsk';
import type { SaveChoice } from '../../src/shared/saveQuestion';

type Handler = (q: { name: string; neverSaved: boolean }, shown: () => void, onWithdraw: (fn: () => void) => void) => Promise<SaveChoice>;

function install() {
  let handler: Handler | null = null;
  const off = vi.fn();
  (window as unknown as { frameling: unknown }).frameling = { files: {}, app: { onCloseQuestion: (h: Handler) => ((handler = h), off) } };
  return { call: (...a: Parameters<Handler>) => handler!(...a), off };
}

afterEach(() => {
  setSaveAskMounted(false);
  answerSave('cancel');
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('the page answering the window close', () => {
  it('shows the dialog, says when it is up, and returns the answer', async () => {
    const d = install();
    startCloseQuestions();
    setSaveAskMounted(true);
    const shown = vi.fn();
    const p = d.call({ name: 'Ball', neverSaved: false }, () => shown(saveAsking.get()?.name), () => {});
    // The dialog component calls onShown once it is on the page.
    saveAsking.get()!.onShown!();
    expect(shown).toHaveBeenCalledWith('Ball');
    answerSave('discard');
    await expect(p).resolves.toBe('discard');
  });

  it('with no dialog on the page it rejects, so the desktop side uses the system box', async () => {
    const d = install();
    startCloseQuestions();
    await expect(d.call({ name: 'Ball', neverSaved: false }, () => {}, () => {})).rejects.toThrow();
  });

  it('a withdrawn question takes the dialog down and counts as Cancel for it', async () => {
    const d = install();
    startCloseQuestions();
    setSaveAskMounted(true);
    let withdraw = () => {};
    const p = d.call({ name: 'Ball', neverSaved: true }, () => {}, (fn) => (withdraw = fn));
    expect(saveAsking.get()).not.toBeNull();
    withdraw();
    await expect(p).resolves.toBe('cancel');
    expect(saveAsking.get()).toBeNull();
  });

  it('does nothing in a plain browser', () => {
    expect(() => startCloseQuestions()()).not.toThrow();
  });
});
