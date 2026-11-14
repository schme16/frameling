// Asking about unsaved work when the window closes: which answer each path takes, that Cancel really cancels the close,
// and that a page which cannot answer falls back to the system box instead of letting the window go unasked.
import { describe, expect, it } from 'vitest';
import { closeStep, createCloseAsker, DIALOG_WITHIN_MS, holdClose, type CloseQuestionDeps } from '../../src/main/closeQuestion';
import { asSaveChoice, choiceAt, saveChangesQuestion } from '../../src/shared/saveQuestion';
import type { SaveChoice } from '../../src/shared/saveQuestion';

/** A desktop side with a pretend page, system box and clock. */
function rig(opts: { page?: boolean; system?: SaveChoice | 'throws' } = {}) {
  const log: string[] = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  let systemAnswer: (c: SaveChoice) => void = () => {};
  const deps: CloseQuestionDeps = {
    sendToPage: (id) => {
      log.push(`page asked ${id}`);
      return opts.page !== false;
    },
    withdrawFromPage: (id) => void log.push(`page told to drop ${id}`),
    system: () => {
      log.push('system box');
      if (opts.system === 'throws') return Promise.reject(new Error('no box'));
      if (opts.system) return Promise.resolve(opts.system);
      return new Promise<SaveChoice>((r) => (systemAnswer = r));
    },
    setTimer: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => void ((t as { live: boolean }).live = false),
  };
  const asker = createCloseAsker(deps);
  const tick = () => timers.filter((t) => t.live).forEach((t) => ((t.live = false), t.fn()));
  return { asker, log, timers, tick, answerSystem: (c: SaveChoice) => systemAnswer(c) };
}

describe('the words', () => {
  it('are one set: the name in the question, three buttons in order, the never-saved note', () => {
    const q = saveChangesQuestion('Ball', false);
    expect(q.title).toBe('Save changes?');
    expect(q.message).toBe('Save changes to "Ball"?');
    expect(q.buttons).toEqual(['Save', `Don't save`, 'Cancel']);
    expect(q.detail).not.toMatch(/hasn't been saved yet/);
    expect(saveChangesQuestion('Ball', true).detail).toMatch(/hasn't been saved yet/);
    expect(JSON.stringify(q)).not.toMatch(/—/);
  });

  it('answers follow the button order, and anything odd is a Cancel', () => {
    expect([0, 1, 2].map(choiceAt)).toEqual(['save', 'discard', 'cancel']);
    expect(choiceAt(7)).toBe('cancel');
    expect(choiceAt(-1)).toBe('cancel');
    expect(asSaveChoice('discard')).toBe('discard');
    expect(asSaveChoice('unavailable')).toBeNull();
    expect(asSaveChoice(undefined)).toBeNull();
  });
});

describe('holding the close', () => {
  it('holds a close for unsaved work, lets a clean one or an already answered one through', () => {
    expect(holdClose({ approved: false, dirty: true })).toBe(true);
    expect(holdClose({ approved: false, dirty: false })).toBe(false);
    expect(holdClose({ approved: true, dirty: true })).toBe(false);
  });

  it('each answer has one next step, and only Cancel keeps the window open', () => {
    expect(closeStep('save')).toBe('save-then-close');
    expect(closeStep('discard')).toBe('keep-then-close');
    expect(closeStep('cancel')).toBe('stay-open');
  });
});

describe('asking through the page', () => {
  it('hands the question to the page and returns its answer, with no system box', async () => {
    const r = rig();
    const p = r.asker.ask();
    expect(r.asker.open).toBe(true);
    r.asker.shown(1);
    r.asker.answered(1, 'save');
    await expect(p).resolves.toBe('save');
    expect(r.log).toEqual(['page asked 1']);
    expect(r.asker.open).toBe(false);
  });

  it('Cancel is carried back as a Cancel, so the close stays held', async () => {
    const r = rig();
    const p = r.asker.ask();
    r.asker.shown(1);
    r.asker.answered(1, 'cancel');
    expect(closeStep(await p)).toBe('stay-open');
  });

  it("Don't save comes back as discard", async () => {
    const r = rig();
    const p = r.asker.ask();
    r.asker.shown(1);
    r.asker.answered(1, 'discard');
    await expect(p).resolves.toBe('discard');
  });

  it('waits as long as the person likes once the dialog is up', async () => {
    const r = rig();
    const p = r.asker.ask();
    r.asker.shown(1);
    r.tick();
    let done = false;
    void p.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    expect(r.log).toEqual(['page asked 1']);
    r.asker.answered(1, 'cancel');
    await p;
  });

  it('asking again while one is open gives the same question, not a second dialog', async () => {
    const r = rig();
    const a = r.asker.ask();
    const b = r.asker.ask();
    expect(a).toBe(b);
    expect(r.log).toEqual(['page asked 1']);
    r.asker.answered(1, 'save');
    await a;
  });

  it('a made-up answer is not taken as Save or Don\'t save: it goes to the system box', async () => {
    const r = rig({ system: 'cancel' });
    const p = r.asker.ask();
    r.asker.answered(1, 'yes please');
    await expect(p).resolves.toBe('cancel');
    expect(r.log).toContain('system box');
  });
});

describe('when the page cannot answer', () => {
  it('no page to ask: the system box, at once', async () => {
    const r = rig({ page: false, system: 'discard' });
    await expect(r.asker.ask()).resolves.toBe('discard');
    expect(r.log[r.log.length - 1]).toBe('system box');
  });

  it('a page that says it cannot show the dialog: the system box', async () => {
    const r = rig({ system: 'save' });
    const p = r.asker.ask();
    r.asker.answered(1, 'unavailable');
    await expect(p).resolves.toBe('save');
    expect(r.log).toEqual(['page asked 1', 'page told to drop 1', 'system box']);
  });

  it(`a page too slow to show its dialog (${DIALOG_WITHIN_MS} ms): the system box, and the page is told to drop it`, async () => {
    const r = rig({ system: 'cancel' });
    const p = r.asker.ask();
    expect(r.timers).toHaveLength(1);
    expect(r.timers[0].ms).toBe(DIALOG_WITHIN_MS);
    r.tick();
    await expect(p).resolves.toBe('cancel');
    expect(r.log).toEqual(['page asked 1', 'page told to drop 1', 'system box']);
  });

  it('a late answer from the slow page is ignored while the system box has the floor', async () => {
    const r = rig();
    const p = r.asker.ask();
    r.tick();
    r.asker.answered(1, 'discard');
    r.asker.shown(1);
    r.answerSystem('save');
    await expect(p).resolves.toBe('save');
  });

  it('a page that crashes or hangs with the dialog up: the system box', async () => {
    const r = rig({ system: 'cancel' });
    const p = r.asker.ask();
    r.asker.shown(1);
    r.asker.pageLost();
    await expect(p).resolves.toBe('cancel');
    expect(r.log).toEqual(['page asked 1', 'page told to drop 1', 'system box']);
  });

  it('nothing open: losing the page is a no-op', () => {
    const r = rig();
    r.asker.pageLost();
    expect(r.log).toEqual([]);
  });

  it('a system box that fails to open counts as Cancel, never as permission to close', async () => {
    const r = rig({ page: false, system: 'throws' });
    await expect(r.asker.ask()).resolves.toBe('cancel');
  });

  it('after a question is over the next one starts fresh with a new id', async () => {
    const r = rig();
    const a = r.asker.ask();
    r.asker.answered(1, 'cancel');
    await a;
    const b = r.asker.ask();
    expect(r.log).toEqual(['page asked 1', 'page asked 2']);
    r.asker.answered(1, 'save');
    r.asker.answered(2, 'discard');
    await expect(b).resolves.toBe('discard');
  });
});
