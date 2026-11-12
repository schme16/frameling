// @vitest-environment jsdom
// Quill's pen check from end to end: simulated pen events go in through the real dialog, a report file comes out.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PenCheck } from '../../src/tablet/check/PenCheck';
import { DiagnosticsPage } from '../../src/tablet/check/DiagnosticsPage';
import { CHECK_STEPS, CheckRecorder, stepDone, type PenSample, type ReportEnv, type TabletReport } from '../../src/tablet/check/recorder';
import { OFFER_DELAY_MS, checkMemory, noticePen, reduceCheck, resetOffer, setCheckMemory, shouldOffer, startFlow, startPenCheck } from '../../src/tablet/check/state';
import { overlays } from '../../src/ui/overlays';
import { LINES, line } from '../../src/ui/mascot/lines';
import { DEFAULT_PEN, resetPen } from '../../src/tablet/settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const written: { path: string; bytes: Uint8Array }[] = [];
let pickResult: string | null = '/tmp/frameling-tablet-report-2026-11-12.json';
const picked: { suggestedName: string; filters: unknown }[] = [];

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  written.length = 0;
  picked.length = 0;
  pickResult = '/tmp/frameling-tablet-report-2026-11-12.json';
  (window as unknown as { frameling: unknown }).frameling = {
    platform: 'win32',
    versions: { app: '9.9.9', electron: '45.0.0', chrome: '140.0.0.0' },
    files: {
      pickExportFile: async (o: { suggestedName: string; filters: unknown }) => (picked.push(o), pickResult),
      write: async (path: string, bytes: Uint8Array) => (written.push({ path, bytes }), { ok: true }),
    },
  };
  localStorage.clear();
  setCheckMemory({ done: false, declined: false });
  resetOffer();
  resetPen();
  overlays.set({ palette: false, prefs: null, help: null, sheet: null, about: false });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { frameling?: unknown }).frameling;
  vi.useRealTimers();
});

interface Fire {
  type?: string;
  x?: number;
  y?: number;
  pressure?: number;
  buttons?: number;
  button?: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  t?: number;
  pointerType?: string;
  coalesced?: number;
}

/** A pen event as the browser would send it, with every pen field set. */
function pointer(f: Fire): Event {
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const e = new Ctor(f.type ?? 'pointermove', { bubbles: true, cancelable: true, clientX: f.x ?? 100, clientY: f.y ?? 100, buttons: f.buttons ?? 0, button: f.button ?? 0 });
  const props: Record<string, unknown> = {
    pointerType: f.pointerType ?? 'pen',
    pointerId: 3,
    pressure: f.pressure ?? 0,
    tiltX: f.tiltX ?? 0,
    tiltY: f.tiltY ?? 0,
    twist: f.twist ?? 0,
    width: 1,
    height: 1,
    timeStamp: f.t ?? 0,
    getCoalescedEvents: () => Array.from({ length: f.coalesced ?? 0 }, (_, i) => ({ ...e, clientX: f.x, clientY: f.y, buttons: f.buttons ?? 0, button: f.button ?? 0, pressure: f.pressure ?? 0, pointerType: f.pointerType ?? 'pen', tiltX: f.tiltX ?? 0, tiltY: f.tiltY ?? 0, twist: f.twist ?? 0, timeStamp: (f.t ?? 0) - (f.coalesced! - 1 - i) * 4, type: f.type ?? 'pointermove' })),
    getPredictedEvents: () => [{}, {}],
  };
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v, configurable: true });
  return e;
}

const pad = () => host.querySelector<HTMLElement>('[data-testid=check-pad]')!;
const fire = (f: Fire) => act(() => void pad().dispatchEvent(pointer(f)));
const says = () => host.querySelector('[data-testid=quill-says]')!.textContent!;
const step = () => host.querySelector('.tb-check-steps li[data-state=now] span')?.textContent;
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === name)!;

let t = 1000;
const next = (dt = 8) => (t += dt);

/** Drives every step the way a person with a full-featured pen would. */
function doEverything(): void {
  // hover
  for (let i = 0; i < 8; i++) fire({ x: 100 + i, y: 100, t: next() });
  // pressure ramp, light to hard
  fire({ type: 'pointerdown', buttons: 1, pressure: 0.05, t: next() });
  for (let i = 1; i <= 20; i++) fire({ buttons: 1, pressure: i / 20, x: 100 + i * 5, t: next() });
  fire({ type: 'pointerup', pressure: 0, t: next() });
  // tilt left then right
  for (let i = 0; i < 6; i++) fire({ buttons: 0, tiltX: -40, tiltY: 10, t: next() });
  for (let i = 0; i < 6; i++) fire({ buttons: 0, tiltX: 40, tiltY: -10, t: next() });
  // twist
  fire({ type: 'pointerdown', buttons: 1, pressure: 0.5, t: next() });
  for (let i = 0; i < 8; i++) fire({ buttons: 1, pressure: 0.5, twist: i * 30, t: next() });
  fire({ type: 'pointerup', t: next() });
  // eraser end (hovering with the eraser bit), then each barrel button
  fire({ buttons: 32, t: next() });
  fire({ buttons: 3, t: next() });
  fire({ buttons: 5, t: next() });
}

describe('the notebook', () => {
  const env = (): ReportEnv => ({
    appVersion: '1.0.0',
    electron: '45.0.0',
    chrome: '140.0.0.0',
    platform: 'win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140',
    devicePixelRatio: 1.25,
    screen: { width: 1920, height: 1080 },
    maxTouchPoints: 10,
    support: { pointerEvents: true, coalesced: true, predicted: true, altitudeAzimuth: true },
    hid: { available: true, devices: [] },
    settings: DEFAULT_PEN,
    now: new Date('2026-11-12T10:00:00Z'),
  });
  const s = (o: Partial<PenSample>): PenSample => ({ type: 'pointermove', pointerType: 'pen', pointerId: 1, pressure: 0, button: -1, buttons: 0, timeStamp: 0, ...o });

  it('each step is done by exactly what it asks for', () => {
    const r = new CheckRecorder(DEFAULT_PEN.pen);
    r.start('hover');
    for (let i = 0; i < 5; i++) r.push(s({ timeStamp: i }));
    expect(r.currentDone()).toBe(false);
    r.push(s({ timeStamp: 6 }));
    expect(r.currentDone()).toBe(true);
    r.start('pressure');
    for (let i = 0; i < 8; i++) r.push(s({ buttons: 1, pressure: 0.5, timeStamp: i }));
    expect(r.currentDone()).toBe(false);
    for (const p of [0.1, 0.3, 0.7, 0.9]) r.push(s({ buttons: 1, pressure: p }));
    expect(r.currentDone()).toBe(true);
    r.start('eraser');
    r.push(s({ buttons: 1, button: 0 }));
    expect(r.currentDone()).toBe(false);
    r.push(s({ buttons: 32 }));
    expect(r.currentDone()).toBe(true);
    expect(stepDone('keys', r.now()!)).toBe(false);
  });

  it('puts the Linux session (Wayland or X11) in the report when it is known', () => {
    const r = new CheckRecorder(DEFAULT_PEN.pen);
    const session = { type: 'wayland', desktop: 'GNOME', wayland: true, x11: true, ozone: 'x11' };
    const rep = r.report({ ...env(), platform: 'linux', session });
    expect(rep.system.session).toEqual(session);
  });

  it('writes a complete report with every range, code and rate', () => {
    const r = new CheckRecorder(DEFAULT_PEN.pen);
    for (const id of CHECK_STEPS) r.start(id);
    r.start('scribble');
    for (let i = 0; i < 60; i++) {
      r.push(s({ type: i ? 'pointermove' : 'pointerdown', buttons: 1, button: i ? -1 : 0, pressure: i / 60, tiltX: i - 30, tiltY: 5, twist: i * 4, altitudeAngle: 1.2, azimuthAngle: 0.5, timeStamp: 100 + i * 10, clientX: i, clientY: i }), { coalesced: 4, coalescedTimes: [0, 1, 2, 3].map((k) => 100 + i * 10 + k * 2.5), predicted: 2, predictedAsked: true });
    }
    r.push(s({ buttons: 32 }));
    r.key('F13', 'F13');
    r.wheel();
    r.finish('scribble', 'done');
    const rep = r.report(env());
    expect(rep).toMatchObject({ kind: 'frameling-tablet-report', version: 1, createdAt: '2026-11-12T10:00:00.000Z' });
    expect(rep.app).toEqual({ version: '1.0.0', electron: '45.0.0', chrome: '140.0.0.0' });
    expect(rep.system.platform).toBe('win32');
    expect(rep.system.session).toBeUndefined();
    expect(rep.devices.pointerTypes.pen).toBeGreaterThan(50);
    expect(rep.pressure.min).toBe(0);
    expect(rep.pressure.max).toBeCloseTo(0.983, 2);
    expect(rep.pressure.histogram).toHaveLength(10);
    expect(rep.pressure.curve).toHaveLength(11);
    expect(rep.tilt.tiltX).toEqual({ min: -30, max: 29 });
    expect(rep.tilt.altitude.min).toBeCloseTo(1.2);
    expect(rep.tilt.azimuth.max).toBeCloseTo(0.5);
    expect(rep.twist.max).toBe(236);
    expect(rep.buttons.eraserDetected).toBe(true);
    expect(rep.buttons.buttonsBitmasks['1']).toBeGreaterThan(50);
    expect(rep.buttons.eventCodes['pointerdown:0']).toBe(1);
    expect(rep.rate.maxCoalescedPerEvent).toBe(4);
    expect(rep.rate.estimatedHz).toBe(400);
    expect(rep.rate.moveEventsPerSecond).toBeGreaterThan(90);
    expect(rep.predicted).toMatchObject({ maxPredictedPerEvent: 2, askedOnMoves: 59 });
    expect(rep.keys).toEqual({ count: 1, wheelEvents: 1, seen: [{ key: 'F13', code: 'F13' }] });
    expect(rep.steps.map((x) => x.id)).toEqual(CHECK_STEPS);
    expect(rep.steps.find((x) => x.id === 'scribble')?.status).toBe('done');
    expect(rep.trace.samples.length).toBeGreaterThan(10);
    expect(rep.trace.columns).toHaveLength(rep.trace.samples[0].length);
    expect(() => JSON.stringify(rep)).not.toThrow();
  });

  it('points at Windows Ink when only mouse events came, and at a fixed pressure', () => {
    const mouse = new CheckRecorder(DEFAULT_PEN.pen);
    mouse.start('hover');
    for (let i = 0; i < 20; i++) mouse.push(s({ pointerType: 'mouse', buttons: 1, pressure: 0.5 }));
    expect(mouse.report(env()).hints.join(' ')).toMatch(/Windows Ink/);
    const flat = new CheckRecorder(DEFAULT_PEN.pen);
    flat.start('pressure');
    for (let i = 0; i < 20; i++) flat.push(s({ buttons: 1, pressure: 0.5 }));
    expect(flat.report(env()).hints.join(' ')).toMatch(/Pressure never changed/);
  });
});

describe('the flow', () => {
  it('goes step by step, a skip counts, and after the last step it is time to save', () => {
    let f = reduceCheck(startFlow('offer'), { type: 'accept' });
    expect(f.phase).toBe('run');
    f = reduceCheck(f, { type: 'stepDone' });
    f = reduceCheck(f, { type: 'skip' });
    expect(f).toMatchObject({ step: 2, done: ['hover'], skipped: ['pressure'] });
    for (let i = 2; i < CHECK_STEPS.length; i++) f = reduceCheck(f, { type: 'skip' });
    expect(f.phase).toBe('save');
    f = reduceCheck(f, { type: 'saveFailed', why: 'cancelled' });
    expect(f).toMatchObject({ phase: 'save', saveProblem: 'cancelled' });
    expect(reduceCheck(f, { type: 'saved' }).phase).toBe('saved');
  });
});

describe('offering the check', () => {
  it('appears once a pen is noticed, only when nothing else is open, and only once a run', () => {
    vi.useFakeTimers();
    overlays.set((o) => ({ ...o, palette: true }));
    noticePen();
    vi.advanceTimersByTime(OFFER_DELAY_MS + 10);
    expect(overlays.get().penCheck).toBeUndefined();
    overlays.set((o) => ({ ...o, palette: false }));
    noticePen();
    vi.advanceTimersByTime(OFFER_DELAY_MS + 10);
    expect(overlays.get().penCheck).toBe('offer');
    overlays.set((o) => ({ ...o, penCheck: undefined }));
    noticePen();
    vi.advanceTimersByTime(OFFER_DELAY_MS + 10);
    expect(overlays.get().penCheck).toBeUndefined();
  });
  it('never appears once a report was saved, or when asked not to', () => {
    setCheckMemory({ done: true });
    expect(shouldOffer()).toBe(false);
    setCheckMemory({ done: false, declined: true });
    expect(shouldOffer()).toBe(false);
  });
});

describe('the pen check dialog', () => {
  it('asks, walks through every step on simulated pen events, saves the report, and Quill says the line', async () => {
    await act(async () => root.render(<PenCheck />));
    act(() => overlays.set((o) => ({ ...o, penCheck: 'offer' })));
    expect(says()).toBe(line('pen.check.offer'));
    act(() => button("Let's go").click());
    expect(says()).toContain(line('pen.check.step.hover'));
    expect(step()).toBe('Hover');

    // A mouse does not tick anything off.
    for (let i = 0; i < 10; i++) fire({ pointerType: 'mouse', t: next() });
    expect(step()).toBe('Hover');

    // The pen does: hover, press, lean, twist, then the eraser end and both buttons.
    for (let i = 0; i < 8; i++) fire({ x: 100 + i, t: next() });
    expect(step()).toBe('Press');
    expect(says()).toContain(line('pen.check.step.pressure'));
    fire({ type: 'pointerdown', buttons: 1, pressure: 0.05, t: next() });
    for (let i = 1; i <= 20; i++) fire({ buttons: 1, pressure: i / 20, x: 100 + i * 5, t: next() });
    fire({ type: 'pointerup', t: next() });
    expect(step()).toBe('Lean');
    for (let i = 0; i < 6; i++) fire({ tiltX: -40, tiltY: 10, t: next() });
    for (let i = 0; i < 6; i++) fire({ tiltX: 40, tiltY: -10, t: next() });
    expect(step()).toBe('Twist');
    fire({ type: 'pointerdown', buttons: 1, pressure: 0.5, t: next() });
    for (let i = 0; i < 8; i++) fire({ buttons: 1, pressure: 0.5, twist: i * 30, t: next() });
    fire({ type: 'pointerup', t: next() });
    expect(step()).toBe('Eraser end');
    fire({ buttons: 32, t: next() });
    expect(step()).toBe('Button nearest the tip');
    fire({ buttons: 3, t: next() });
    expect(step()).toBe('Other button');
    fire({ buttons: 5, t: next() });
    expect(step()).toBe('Fast scribble');

    // A fast scribble: a lot of events with folded samples over more than 400 ms.
    fire({ type: 'pointerdown', buttons: 1, pressure: 0.4, t: next() });
    for (let i = 0; i < 40; i++) fire({ buttons: 1, pressure: 0.4, x: 100 + (i % 7) * 9, y: 100 + (i % 5) * 7, coalesced: 3, t: next(14) });
    expect(step()).toBe('Express keys and ring');
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F13', code: 'F13' })));
    expect(says()).toContain(line('pen.check.save'));
    expect(button('Save the report')).toBeTruthy();

    // Cancelling the Save dialog keeps things as they are.
    pickResult = null;
    await act(async () => button('Save the report').click());
    expect(says()).toBe(line('pen.check.cancelled'));
    expect(written).toHaveLength(0);
    expect(checkMemory.get().done).toBe(false);

    // Saving writes the JSON and Quill says his last words.
    pickResult = '/tmp/frameling-tablet-report-2026-11-12.json';
    await act(async () => button('Save the report').click());
    expect(says()).toBe("Here ya go! Shane'll need this to get this tablet thingo sorted out properly (you know he needs all the help he can get).");
    expect(says()).toBe(LINES['pen.check.saved'].text);
    expect(picked[0].suggestedName).toMatch(/^frameling-tablet-report-\d{4}-\d{2}-\d{2}\.json$/);
    expect(written).toHaveLength(1);
    const rep = JSON.parse(new TextDecoder().decode(written[0].bytes)) as TabletReport;
    expect(rep.kind).toBe('frameling-tablet-report');
    expect(rep.app.electron).toBe('45.0.0');
    expect(rep.steps.every((x) => x.status === 'done')).toBe(true);
    expect(rep.pressure.min).toBeLessThan(0.1);
    expect(rep.pressure.max).toBeGreaterThan(0.9);
    expect(rep.tilt.tiltX.min).toBe(-40);
    expect(rep.tilt.tiltX.max).toBe(40);
    expect(rep.twist.max).toBe(210);
    expect(rep.buttons).toMatchObject({ eraserDetected: true, barrel1Detected: true, barrel2Detected: true });
    expect(rep.rate.maxCoalescedPerEvent).toBe(3);
    expect(rep.rate.estimatedHz).toBeGreaterThan(100);
    expect(rep.keys.seen).toEqual([{ key: 'F13', code: 'F13' }]);
    expect(rep.devices.pointerTypes.mouse).toBe(10);

    // Remembered: finished once, never offered again by itself.
    expect(checkMemory.get().done).toBe(true);
    resetOffer();
    expect(shouldOffer()).toBe(false);
    expect(localStorage.getItem('frameling.penCheck.v1')).toContain('"done":true');
  });

  it('a fast burst of events (faster than React redraws) ticks off one step at a time, not several', async () => {
    await act(async () => root.render(<PenCheck />));
    act(() => startPenCheck());
    act(() => {
      const el = pad();
      for (let i = 0; i < 12; i++) el.dispatchEvent(pointer({ x: 100 + i, t: next() }));
      el.dispatchEvent(pointer({ type: 'pointerdown', buttons: 1, pressure: 0.05, t: next() }));
      for (let i = 1; i <= 20; i++) el.dispatchEvent(pointer({ buttons: 1, pressure: i / 20, t: next() }));
    });
    expect(step()).toBe('Lean');
    expect([...host.querySelectorAll('.tb-check-steps li[data-state=done]')].map((li) => li.querySelector('span')!.textContent)).toEqual(['Hover', 'Press']);
  });

  it('skipping marks a step skipped, and closing half way is offered again next time', async () => {
    await act(async () => root.render(<PenCheck />));
    act(() => startPenCheck());
    expect(step()).toBe('Hover');
    act(() => button('Skip this one').click());
    expect(step()).toBe('Press');
    expect(says()).toContain(line('pen.check.skipped'));
    act(() => button('Stop for now').click());
    expect(overlays.get().penCheck).toBeUndefined();
    expect(checkMemory.get().done).toBe(false);
    resetOffer();
    expect(shouldOffer()).toBe(true);
  });

  it('Not now and Do not ask again', async () => {
    await act(async () => root.render(<PenCheck />));
    act(() => overlays.set((o) => ({ ...o, penCheck: 'offer' })));
    act(() => button('Not now').click());
    expect(overlays.get().penCheck).toBeUndefined();
    expect(checkMemory.get().declined).toBe(false);
    act(() => overlays.set((o) => ({ ...o, penCheck: 'offer' })));
    act(() => button("Don't ask again").click());
    expect(checkMemory.get().declined).toBe(true);
  });

  it('a failed save says so and can be tried again', async () => {
    await act(async () => root.render(<PenCheck />));
    act(() => startPenCheck());
    for (let i = 0; i < CHECK_STEPS.length; i++) act(() => button('Skip this one').click());
    (window as unknown as { frameling: { files: { write: unknown } } }).frameling.files.write = async () => ({ error: 'nope' });
    await act(async () => button('Save the report').click());
    expect(says()).toBe(line('pen.check.failed'));
    expect(button('Save the report')).toBeTruthy();
  });
});

describe('Preferences, Diagnostics', () => {
  it('starts the check by hand', async () => {
    await act(async () => root.render(<DiagnosticsPage />));
    expect(host.textContent).toContain(line('pen.check.diagnostics'));
    act(() => button('Check my pen with Quill').click());
    expect(overlays.get().penCheck).toBe('run');
    setCheckMemory({ done: true });
    await act(async () => root.render(<DiagnosticsPage />));
    expect(button('Check my pen again')).toBeTruthy();
  });
});
