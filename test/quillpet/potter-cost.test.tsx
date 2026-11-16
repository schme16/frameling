// @vitest-environment jsdom
// The cost budget for Quill's pottering, as a rule with a test: he potters only while his panel is on screen, and when
// he isn't there is no timer at all. Nothing while the window is unfocused or the page is in the background, nothing
// while the animation plays, one tick a second when it does run, and reduced motion settles him.
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clockRuns, potters, startPotter, type Gate } from '../../src/quillpet/potter';
import { TICK_MS, useQuillClock } from '../../src/quillpet/usePotter';
import { QuillPetPanel } from '../../src/quillpet/QuillPetPanel';
import { FRESH_PET } from '../../src/quillpet/model';
import { setPet } from '../../src/quillpet/store';
import { store } from '../../src/core/store';
import { setQuillSheet } from '../../src/ui/mascot/runtime';
import { resetClaims } from '../../src/ui/mascot/claims';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { FAKE_SHEET } from '../fixtures/quill-sheet';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPEN: Gate = { shown: true, onScreen: true, focused: true, pageHidden: false, playing: false, reduced: false };

describe('the rule', () => {
  it('runs the clock only when he is drawn, on screen, in a focused window, in a visible page, and nothing is playing', () => {
    expect(clockRuns(OPEN)).toBe(true);
    expect(potters(OPEN)).toBe(true);
    for (const off of [{ shown: false }, { onScreen: false }, { focused: false }, { pageHidden: true }, { playing: true }]) {
      expect(clockRuns({ ...OPEN, ...off }), JSON.stringify(off)).toBe(false);
      expect(potters({ ...OPEN, ...off }), JSON.stringify(off)).toBe(false);
    }
  });

  it('reduced motion keeps the clock for how he feels but stops him moving about', () => {
    expect(clockRuns({ ...OPEN, reduced: true })).toBe(true);
    expect(potters({ ...OPEN, reduced: true })).toBe(false);
  });
});

// ---------------------------------------------------------------- the hook, counting real timers

let intervals: Map<unknown, number>;
let setSpy: ReturnType<typeof vi.spyOn>;
let clearSpy: ReturnType<typeof vi.spyOn>;
let hasFocus = true;
let io: { cb: (e: { isIntersecting: boolean }[]) => void } | null = null;
let renders = 0;
let last: ReturnType<typeof useQuillClock> | null = null;

class FakeIO {
  constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
    io = { cb };
  }
  observe() {}
  disconnect() {}
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

function Probe({ shown = true, playing = false, stepping = true }: { shown?: boolean; playing?: boolean; stepping?: boolean }) {
  const within = useRef<HTMLDivElement>(null);
  renders++;
  last = useQuillClock({ shown, playing, within, stepping, ctx: () => ({ hasColours: true, sinceInput: 0 }) });
  return <div ref={within} />;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  intervals = new Map();
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  setSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
    const id = realSet(fn, ms);
    intervals.set(id, ms ?? 0);
    return id;
  }) as typeof setInterval);
  clearSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id: never) => {
    intervals.delete(id);
    realClear(id);
  }) as typeof clearInterval);
  hasFocus = true;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus);
  vi.stubGlobal('IntersectionObserver', FakeIO);
  io = null;
  renders = 0;
  last = null;
  resetPrefs();
  setHidden(false);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetPrefs();
  setHidden(false);
});

const live = () => [...intervals.values()];

describe('the clock', () => {
  it('ticks once a second while he is on show, and nothing else', async () => {
    await act(async () => root.render(<Probe />));
    expect(live()).toEqual([TICK_MS]);
    expect(TICK_MS).toBe(1000);
    const before = renders;
    for (let i = 0; i < 60; i++) await act(async () => void vi.advanceTimersByTime(1000));
    // A minute is sixty ticks, and a tick is one render.
    expect(renders - before).toBe(60);
    expect(live()).toEqual([TICK_MS]);
  });

  it('has no timer at all when he is not drawn in his house (the pet is off, or something outranks him)', async () => {
    await act(async () => root.render(<Probe shown={false} />));
    expect(live()).toEqual([]);
    expect(setSpy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('has no timer while the animation plays, and picks up again when it stops', async () => {
    await act(async () => root.render(<Probe />));
    expect(live()).toHaveLength(1);
    await act(async () => root.render(<Probe playing />));
    expect(live()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    const before = renders;
    await act(async () => void vi.advanceTimersByTime(30_000));
    expect(renders).toBe(before);
    await act(async () => root.render(<Probe />));
    expect(live()).toEqual([TICK_MS]);
  });

  it('has no timer while the window is unfocused, and none while the page is in the background', async () => {
    await act(async () => root.render(<Probe />));
    await act(async () => void window.dispatchEvent(new Event('blur')));
    expect(live()).toEqual([]);
    const before = renders;
    await act(async () => void vi.advanceTimersByTime(30_000));
    expect(renders).toBe(before);
    await act(async () => void window.dispatchEvent(new Event('focus')));
    expect(live()).toEqual([TICK_MS]);
    await act(async () => setHidden(true));
    expect(live()).toEqual([]);
    await act(async () => setHidden(false));
    expect(live()).toEqual([TICK_MS]);
  });

  it('starts with no timer when the window is already unfocused', async () => {
    hasFocus = false;
    await act(async () => root.render(<Probe />));
    expect(live()).toEqual([]);
  });

  it('has no timer while the panel is scrolled or folded out of sight', async () => {
    await act(async () => root.render(<Probe />));
    expect(io).toBeTruthy();
    await act(async () => io!.cb([{ isIntersecting: false }]));
    expect(live()).toEqual([]);
    await act(async () => io!.cb([{ isIntersecting: true }]));
    expect(live()).toEqual([TICK_MS]);
  });

  it('leaves nothing behind when the panel closes', async () => {
    await act(async () => root.render(<Probe />));
    await act(async () => root.render(<></>));
    expect(live()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not catch up for time spent away: coming back is one second on, not a minute', async () => {
    await act(async () => root.render(<Probe />));
    const first = last!.potter.move;
    await act(async () => void window.dispatchEvent(new Event('blur')));
    await act(async () => void vi.advanceTimersByTime(10 * 60_000));
    expect(last!.potter.move).toBe(first);
    await act(async () => void window.dispatchEvent(new Event('focus')));
    await act(async () => void vi.advanceTimersByTime(TICK_MS));
    expect(last!.potter.move).toBe(first);
  });

  it('settles him with reduced motion: he keeps being told how he feels but never moves', async () => {
    setPrefs({ reduceMotion: true });
    await act(async () => root.render(<Probe />));
    const start = startPotter().move;
    await act(async () => void vi.advanceTimersByTime(120_000));
    expect(last!.moving).toBe(false);
    expect(last!.potter.move.doing).toBe(start.doing);
    expect(last!.potter.move.spot).toBe('middle');
    // Turned off again, he potters.
    await act(async () => setPrefs({ reduceMotion: false }));
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(last!.moving).toBe(true);
    expect(last!.potter.move.words).toBeTruthy();
  });

  it('stays put while something louder has him, though the clock still runs to notice when it stops', async () => {
    await act(async () => root.render(<Probe stepping={false} />));
    const first = last!.potter.move;
    await act(async () => void vi.advanceTimersByTime(120_000));
    expect(last!.potter.move).toBe(first);
    expect(live()).toEqual([TICK_MS]);
  });
});

// ---------------------------------------------------------------- the real panel

describe('the Quill panel', () => {
  beforeEach(() => {
    resetClaims();
    setPet(FRESH_PET);
    setQuillSheet({ ...FAKE_SHEET, url: 'quill.png', width: 128, height: 416 });
    store().setUi({ playing: false });
  });
  afterEach(() => {
    store().setUi({ playing: false });
    resetClaims();
  });

  it('has one timer, ticking once a second, while it is open, and none once it is closed', async () => {
    await act(async () => root.render(<QuillPetPanel />));
    expect(live()).toEqual([TICK_MS]);
    await act(async () => void vi.advanceTimersByTime(30_000));
    expect(live()).toEqual([TICK_MS]);
    await act(async () => root.render(<></>));
    expect(live()).toEqual([]);
  });

  it('has no timer while the animation plays', async () => {
    await act(async () => root.render(<QuillPetPanel />));
    await act(async () => store().setUi({ playing: true }));
    expect(live()).toEqual([]);
    await act(async () => store().setUi({ playing: false }));
    expect(live()).toEqual([TICK_MS]);
  });

  it('has no timer with Show Quill off', async () => {
    setPrefs({ showQuill: false });
    await act(async () => root.render(<QuillPetPanel />));
    expect(live()).toEqual([]);
  });

  it('has no timer in an unfocused window', async () => {
    await act(async () => root.render(<QuillPetPanel />));
    await act(async () => void window.dispatchEvent(new Event('blur')));
    expect(live()).toEqual([]);
  });
});
