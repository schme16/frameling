// @vitest-environment jsdom
// Automatic crash reports go without anyone reading them, so they carry the computer's details only after a yes to a
// question asked once, early. Bare when unanswered, bare when refused, full when allowed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoCarriesMachine, shouldAsk } from '../../src/beta/autoMachine';

describe('who decides', () => {
  it('only a remembered yes lets the details go', () => {
    expect(autoCarriesMachine(undefined, true)).toBe(false);
    expect(autoCarriesMachine('no', true)).toBe(false);
    expect(autoCarriesMachine('yes', true)).toBe(true);
    expect(autoCarriesMachine('anything else', true)).toBe(false);
  });

  it('still leaves them out when the person turned off details of this computer', () => {
    expect(autoCarriesMachine('yes', false)).toBe(false);
  });

  it('asks only while it is unanswered, in a build that reports, when nothing else is open', () => {
    const f = { reporting: true, remembered: undefined, harness: false, busy: false };
    expect(shouldAsk(f)).toBe(true);
    expect(shouldAsk({ ...f, remembered: 'no' })).toBe(false);
    expect(shouldAsk({ ...f, remembered: 'yes' })).toBe(false);
    expect(shouldAsk({ ...f, reporting: false })).toBe(false);
    expect(shouldAsk({ ...f, harness: true })).toBe(false);
    expect(shouldAsk({ ...f, busy: true })).toBe(false);
  });
});

describe('the automatic report', () => {
  const sent: Array<{ data: Record<string, unknown> }> = [];
  let prefs: { betaReports: boolean; betaContact: string; betaMachine: boolean };

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    sent.length = 0;
    prefs = { betaReports: true, betaContact: '', betaMachine: true };
    window.history.replaceState({}, '', '/');
    vi.doMock('../../src/beta/send', () => ({ canSend: () => true, sendReport: async (r: { data: Record<string, unknown> }) => void sent.push(r) }));
    vi.doMock('../../src/ui/prefs', () => ({ getPrefs: () => prefs }));
    vi.doMock('../../src/tablet/check/state', () => ({ gatherEnv: async () => ({ appVersion: '1.0.0', platform: 'linux' }) }));
    vi.doMock('../../src/gpu/report', () => ({ refreshReport: async () => ({}) }));
    vi.doMock('../../src/beta/machine', () => ({ machineFacts: () => ({ processor: { model: 'TEST CPU' }, graphics: { card: 'TEST CARD' } }) }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../../src/beta/send');
    vi.doUnmock('../../src/ui/prefs');
    vi.doUnmock('../../src/tablet/check/state');
    vi.doUnmock('../../src/gpu/report');
    vi.doUnmock('../../src/beta/machine');
  });

  /** A problem happens, and the automatic report goes. */
  async function crash(answer: 'yes' | 'no' | undefined): Promise<(typeof sent)[number]> {
    const { registerAutoMachineChoice, AUTO_MACHINE_CHOICE } = await import('../../src/beta/autoMachine');
    const { setChoice } = await import('../../src/core/choices');
    const { startAuto, AUTO_WAIT } = await import('../../src/beta/auto');
    const { noteProblem } = await import('../../src/beta/problems');
    registerAutoMachineChoice();
    if (answer) setChoice(AUTO_MACHINE_CHOICE, answer);
    const stop = startAuto();
    noteProblem('Something failed');
    await vi.advanceTimersByTimeAsync(AUTO_WAIT + 50);
    stop();
    expect(sent).toHaveLength(1);
    return sent[0];
  }

  it('is bare while the question is unanswered', async () => {
    const r = await crash(undefined);
    expect(r.data.machine).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('TEST CPU');
  });

  it('is bare after a no', async () => {
    const r = await crash('no');
    expect(r.data.machine).toBeUndefined();
  });

  it('carries the computer after a yes', async () => {
    const r = await crash('yes');
    expect(r.data.machine).toMatchObject({ processor: { model: 'TEST CPU' }, graphics: { card: 'TEST CARD' } });
  });

  it('is bare after a yes when details of this computer were turned off', async () => {
    prefs.betaMachine = false;
    const r = await crash('yes');
    expect(r.data.machine).toBeUndefined();
  });

  it('is bare again once the answer is forgotten or changed to no', async () => {
    const { registerAutoMachineChoice, AUTO_MACHINE_CHOICE } = await import('../../src/beta/autoMachine');
    const { setChoice } = await import('../../src/core/choices');
    registerAutoMachineChoice();
    setChoice(AUTO_MACHINE_CHOICE, 'yes');
    setChoice(AUTO_MACHINE_CHOICE, 'no');
    const { autoMachineAllowed } = await import('../../src/beta/autoMachine');
    expect(autoMachineAllowed()).toBe(false);
    setChoice(AUTO_MACHINE_CHOICE, 'yes');
    expect(autoMachineAllowed()).toBe(true);
    setChoice(AUTO_MACHINE_CHOICE, undefined);
    expect(autoMachineAllowed()).toBe(false);
  });
});

describe('the question', () => {
  it('has a no by default and when closed, and is always a real sheet', async () => {
    vi.resetModules();
    const { registerAutoMachineChoice, AUTO_MACHINE_CHOICE } = await import('../../src/beta/autoMachine');
    const { getChoiceDef, currentChoice } = await import('../../src/core/choices');
    registerAutoMachineChoice();
    const def = getChoiceDef(AUTO_MACHINE_CHOICE)!;
    expect(def.default).toBe('no');
    expect(def.dismiss).toBe('no');
    expect(def.mustAsk).toBe(true);
    expect(def.options.map((o) => o.value)).toEqual(['yes', 'no']);
    expect(currentChoice(AUTO_MACHINE_CHOICE)).toBe('no');
  });
});
