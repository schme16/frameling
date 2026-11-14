// Restart: the order (ask about unsaved work, save, then open again), that Cancel or a failed save cancels it, the case
// where this copy can't open itself again (nothing is closed and it says so), what to open, and the window and view
// that come back.
import { describe, expect, it } from 'vitest';
import { closeStep } from '../../src/main/closeQuestion';
import { cleanView, createRestarter, fitWindow, readState, relaunchPlan, STATE_MAX_AGE_MS, type RelaunchFacts, type RestartState } from '../../src/main/restart';
import type { SaveChoice } from '../../src/shared/saveQuestion';

const facts = (o: Partial<RelaunchFacts> = {}): RelaunchFacts => ({ platform: 'linux', packaged: true, appImage: '', portableFile: '', exists: () => true, ...o });

/** The desktop side with a pretend window: quitting asks the question like the close button does, saves, then quits for real. */
function rig(o: { dirty?: boolean; answer?: SaveChoice; saveWorks?: boolean; facts?: Partial<RelaunchFacts> } = {}) {
  const log: string[] = [];
  const written: RestartState[] = [];
  const dirty = o.dirty ?? true;
  const r = createRestarter({
    plan: () => relaunchPlan(facts(o.facts)),
    quit: () => {
      log.push('quit asked');
      void (async () => {
        if (dirty) {
          log.push('question');
          const step = closeStep(o.answer ?? 'save');
          if (step === 'stay-open') return r.cancelled();
          if (step === 'save-then-close') {
            log.push('save');
            if (o.saveWorks === false) return r.cancelled();
          } else log.push('put the work aside');
        }
        log.push('window closed');
        r.quitting();
        log.push('quit');
      })();
    },
    state: (view) => ({ at: 1000, file: '/art/walk.frameling', view, window: null }),
    writeState: (s) => {
      log.push('state written');
      written.push(s);
    },
    relaunch: (p) => void log.push(`relaunch ${p ?? 'itself'}`),
  });
  return { r, log, written, settle: () => new Promise((res) => setTimeout(res, 0)) };
}

describe('save first, then relaunch', () => {
  it('asks, saves, closes, then writes where to come back to and relaunches, in that order', async () => {
    const t = rig();
    expect(t.r.request({ frame: 7 })).toEqual({ ok: true });
    await t.settle();
    expect(t.log).toEqual(['quit asked', 'question', 'save', 'window closed', 'state written', 'relaunch itself', 'quit']);
    expect(t.written[0].view).toEqual({ frame: 7 });
  });

  it("Don't save still relaunches, after the work is put aside", async () => {
    const t = rig({ answer: 'discard' });
    t.r.request();
    await t.settle();
    expect(t.log.indexOf('put the work aside')).toBeLessThan(t.log.indexOf('relaunch itself'));
  });

  it('nothing unsaved: no question, straight to relaunch', async () => {
    const t = rig({ dirty: false });
    t.r.request();
    await t.settle();
    expect(t.log).toEqual(['quit asked', 'window closed', 'state written', 'relaunch itself', 'quit']);
  });

  it('Cancel stays open and never relaunches, and a later plain close is only a close', async () => {
    const t = rig({ answer: 'cancel' });
    t.r.request();
    await t.settle();
    expect(t.log).toEqual(['quit asked', 'question']);
    expect(t.r.wanted).toBe(false);
    t.r.quitting();
    expect(t.log).not.toContain('relaunch itself');
  });

  it('a save that fails stays open and never relaunches', async () => {
    const t = rig({ saveWorks: false });
    t.r.request();
    await t.settle();
    expect(t.log).toEqual(['quit asked', 'question', 'save']);
    t.r.quitting();
    expect(t.log).not.toContain('relaunch itself');
  });

  it('an ordinary quit does not relaunch', () => {
    const t = rig();
    t.r.quitting();
    expect(t.log).toEqual([]);
  });

  it('a failed write of the state still relaunches (back without the exact spot)', () => {
    const log: string[] = [];
    const r = createRestarter({
      plan: () => ({ ok: true, execPath: null }),
      quit: () => {},
      state: () => ({ at: 1, file: null, view: {}, window: null }),
      writeState: () => {
        throw new Error('disk full');
      },
      relaunch: () => void log.push('relaunch'),
    });
    r.request();
    r.quitting();
    expect(log).toEqual(['relaunch']);
  });
});

describe('where a restart cannot happen', () => {
  const gone = { platform: 'linux', appImage: '/apps/Frameling.AppImage', exists: () => false };

  it('says so in plain words and closes nothing', async () => {
    const t = rig({ facts: gone });
    const a = t.r.request();
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message).toMatch(/start it again yourself/);
    await t.settle();
    expect(t.log).toEqual([]);
    expect(t.r.wanted).toBe(false);
  });

  it('the plan says no for an AppImage that is gone and a portable build that is gone', () => {
    expect(relaunchPlan(facts(gone)).ok).toBe(false);
    expect(relaunchPlan(facts({ platform: 'win32', portableFile: 'C:\\Apps\\Frameling.exe', exists: () => false })).ok).toBe(false);
  });
});

describe('what to open again', () => {
  it('an AppImage by its own file (its temporary mount goes away), a portable build the same, anything else as it is', () => {
    expect(relaunchPlan(facts({ appImage: '/apps/Frameling.AppImage' }))).toEqual({ ok: true, execPath: '/apps/Frameling.AppImage' });
    expect(relaunchPlan(facts({ platform: 'win32', portableFile: 'C:\\Apps\\Frameling.exe' }))).toEqual({ ok: true, execPath: 'C:\\Apps\\Frameling.exe' });
    expect(relaunchPlan(facts({ platform: 'darwin' }))).toEqual({ ok: true, execPath: null });
    expect(relaunchPlan(facts({ packaged: false, appImage: '/apps/Frameling.AppImage' }))).toEqual({ ok: true, execPath: null });
  });
});

describe('what comes back', () => {
  const now = 1_000_000;
  it('reads a state, keeping only sensible values', () => {
    const s = readState({ at: now - 1000, file: '/a.frameling', view: { frame: 4.7, layerId: 'l1', zoom: 2, panX: 10, panY: -5, junk: 1 }, window: { x: 10, y: 20, width: 1000, height: 700, maximized: true } }, now);
    expect(s).toEqual({ at: now - 1000, file: '/a.frameling', view: { frame: 4, layerId: 'l1', zoom: 2, panX: 10, panY: -5 }, window: { x: 10, y: 20, width: 1000, height: 700, maximized: true, fullScreen: false } });
  });

  it('ignores a leftover that is old, from the future, or not a state', () => {
    expect(readState({ at: now - STATE_MAX_AGE_MS - 1, file: null }, now)).toBeNull();
    expect(readState({ at: now + 10 * 60_000, file: null }, now)).toBeNull();
    expect(readState('nope', now)).toBeNull();
    expect(readState({ file: '/a' }, now)).toBeNull();
  });

  it('drops a bad window and bad view numbers', () => {
    expect(readState({ at: now, file: null, window: { x: 'a', y: 1, width: 5, height: 5 } }, now)?.window).toBeNull();
    expect(cleanView({ frame: -3, zoom: 0, panX: 1 })).toEqual({});
  });

  it('puts the window back where it was while that is on a screen, and only the size when it is not', () => {
    const place = { x: 100, y: 80, width: 1200, height: 800, maximized: false, fullScreen: false };
    const screens = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    expect(fitWindow(place, screens)).toEqual({ x: 100, y: 80, width: 1200, height: 800 });
    expect(fitWindow({ ...place, x: 4000 }, screens)).toEqual({ width: 1200, height: 800 });
    expect(fitWindow({ ...place, x: 4000 }, [...screens, { x: 3840, y: 0, width: 1920, height: 1080 }])).toEqual({ x: 4000, y: 80, width: 1200, height: 800 });
    expect(fitWindow({ ...place, width: 100, height: 100 }, screens)).toMatchObject({ width: 800, height: 560 });
  });
});
