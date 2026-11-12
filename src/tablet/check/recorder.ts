// The pen check's notebook: what Frameling sees from a pen, step by step, and the report that comes out of it. No
// DOM and no React, so the whole thing can be driven by simulated events in tests.
import { penPress } from '../buttons';
import { mapPressure } from '../curve';
import { altitudeOf, azimuthOf } from '../tilt';
import type { PenDevice } from '../settings';

export type CheckStepId = 'hover' | 'pressure' | 'tilt' | 'twist' | 'eraser' | 'barrel1' | 'barrel2' | 'scribble' | 'keys';
export const CHECK_STEPS: CheckStepId[] = ['hover', 'pressure', 'tilt', 'twist', 'eraser', 'barrel1', 'barrel2', 'scribble', 'keys'];

/** The parts of a pointer event the check reads. A real PointerEvent fits, and so does a plain object in a test. */
export interface PenSample {
  type: string;
  pointerType: string;
  pointerId?: number;
  pressure: number;
  button: number;
  buttons: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  tangentialPressure?: number;
  width?: number;
  height?: number;
  timeStamp: number;
  clientX?: number;
  clientY?: number;
}

export interface Range {
  min: number | null;
  max: number | null;
}

const widen = (r: Range, v: number): void => {
  if (r.min === null || v < r.min) r.min = v;
  if (r.max === null || v > r.max) r.max = v;
};
const range = (): Range => ({ min: null, max: null });

/** What was seen while one step was on. */
export interface StepStats {
  /** Pen events seen, hovering and touching. */
  pen: number;
  hover: number;
  contact: number;
  /** Mouse and finger events, which a pen should not be sending. */
  other: number;
  pressure: Range;
  pressureValues: number[];
  tiltX: Range;
  tiltY: Range;
  twist: Range;
  twistValues: number[];
  eraser: number;
  barrel1: number;
  barrel2: number;
  /** Time of the first and last touching event, in ms. */
  firstContact: number | null;
  lastContact: number | null;
  keys: number;
  wheels: number;
}

const blankStats = (): StepStats => ({
  pen: 0, hover: 0, contact: 0, other: 0,
  pressure: range(), pressureValues: [],
  tiltX: range(), tiltY: range(), twist: range(), twistValues: [],
  eraser: 0, barrel1: 0, barrel2: 0,
  firstContact: null, lastContact: null, keys: 0, wheels: 0,
});

/** True when the step's own job has been done, from what was seen during it. */
export function stepDone(id: CheckStepId, s: StepStats): boolean {
  switch (id) {
    case 'hover':
      return s.hover >= 6;
    case 'pressure':
      return s.contact >= 6 && s.pressure.min !== null && s.pressure.max !== null && s.pressure.min <= 0.35 && s.pressure.max >= 0.65 && new Set(s.pressureValues).size >= 4;
    case 'tilt':
      return s.pen >= 4 && s.tiltX.min !== null && s.tiltX.max !== null && s.tiltX.min <= -15 && s.tiltX.max >= 15;
    case 'twist':
      return s.contact >= 4 && s.twist.min !== null && s.twist.max !== null && s.twist.max - s.twist.min >= 45 && new Set(s.twistValues).size >= 4;
    case 'eraser':
      return s.eraser >= 1;
    case 'barrel1':
      return s.barrel1 >= 1;
    case 'barrel2':
      return s.barrel2 >= 1;
    case 'scribble':
      return s.contact >= 30 && s.firstContact !== null && s.lastContact !== null && s.lastContact - s.firstContact >= 400;
    case 'keys':
      return s.keys + s.wheels >= 1;
  }
}

export type StepStatus = 'done' | 'skipped' | 'not-reached';

export interface ReportEnv {
  appVersion: string;
  electron: string;
  chrome: string;
  /** The desktop shell's platform name ("win32", "darwin", "linux"), or "web". */
  platform: string;
  /** Linux: the desktop session (Wayland or X11) and the window system Chromium chose, when known. */
  session?: { type: string; desktop: string; wayland: boolean; x11: boolean; ozone: string };
  userAgent: string;
  devicePixelRatio: number;
  screen: { width: number; height: number };
  maxTouchPoints: number;
  /** What the browser supports, found by looking, not assuming. */
  support: { pointerEvents: boolean; coalesced: boolean; predicted: boolean; altitudeAzimuth: boolean };
  /** Devices Chromium would name without asking (those already allowed). Pens are usually not among them. */
  hid: { available: boolean; devices: { vendorId: number; productId: number; productName: string }[] };
  /** Frameling's own pen settings at the time. */
  settings: unknown;
  now: Date;
}

const REPORT_KIND = 'frameling-tablet-report';
export const REPORT_VERSION = 1;
/** The most raw samples kept in the report's trace. */
const TRACE_MAX = 300;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const round = (v: number | null, d = 3): number | null => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

export class CheckRecorder {
  private steps = new Map<CheckStepId, { status: StepStatus; stats: StepStats }>();
  private current: CheckStepId | null = null;
  private all = blankStats();
  private types: Record<string, number> = {};
  private codes: Record<string, number> = {};
  private masks: Record<string, number> = {};
  private altitude = range();
  private azimuth = range();
  private tangential = range();
  private contactSize = range();
  private pointerIds = new Set<number>();
  private pressureBins = new Array<number>(10).fill(0);
  private firstEventAt: number | null = null;
  // Rate, from the scribble step.
  private moves = 0;
  private coalescedTotal = 0;
  private coalescedMax = 0;
  private gaps: number[] = [];
  private lastSampleAt = new Map<number, number>();
  private predictedEvents = 0;
  private predictedMax = 0;
  private predictedAsked = 0;
  private keyLog: { key: string; code: string }[] = [];
  private wheelCount = 0;
  private trace: (number | string)[][] = [];

  constructor(private pen: PenDevice) {}

  /** Begins a step: what is seen from now on counts for it. */
  start(id: CheckStepId): void {
    this.current = id;
    if (!this.steps.has(id)) this.steps.set(id, { status: 'not-reached', stats: blankStats() });
  }

  private stats(): StepStats | null {
    return this.current ? this.steps.get(this.current)!.stats : null;
  }

  /** The stats of the step that is on now. */
  now(): StepStats | null {
    return this.stats();
  }

  /** True when the step on now has done its job. */
  currentDone(): boolean {
    const s = this.stats();
    return !!this.current && !!s && stepDone(this.current, s);
  }

  finish(id: CheckStepId, status: 'done' | 'skipped'): void {
    const e = this.steps.get(id) ?? { status: 'not-reached' as StepStatus, stats: blankStats() };
    e.status = status;
    this.steps.set(id, e);
  }

  /**
   * One pointer event. `coalesced` is how many samples the browser folded into it (getCoalescedEvents), `predicted`
   * how many it guessed ahead (getPredictedEvents), and `coalescedTimes` the time of each folded sample.
   */
  push(e: PenSample, extra: { coalesced?: number; coalescedTimes?: number[]; predicted?: number; predictedAsked?: boolean } = {}): void {
    this.types[e.pointerType] = (this.types[e.pointerType] ?? 0) + 1;
    if (e.pointerId !== undefined) this.pointerIds.add(e.pointerId);
    const touching = e.type === 'pointerdown' || (e.type === 'pointermove' && (e.buttons & 1) !== 0) || e.type === 'pointerup';
    for (const s of [this.all, this.stats()]) {
      if (!s) continue;
      if (e.pointerType !== 'pen') {
        s.other++;
        continue;
      }
      s.pen++;
      if (touching) {
        s.contact++;
        if (s.firstContact === null) s.firstContact = e.timeStamp;
        s.lastContact = e.timeStamp;
      } else s.hover++;
      const press = penPress(e);
      if (press.eraser) s.eraser++;
      if (press.barrel1) s.barrel1++;
      if (press.barrel2) s.barrel2++;
      if (touching) {
        widen(s.pressure, e.pressure);
        if (s.pressureValues.length < 400) s.pressureValues.push(Math.round(e.pressure * 1000) / 1000);
      }
      if (typeof e.tiltX === 'number') widen(s.tiltX, e.tiltX);
      if (typeof e.tiltY === 'number') widen(s.tiltY, e.tiltY);
      if (typeof e.twist === 'number') {
        widen(s.twist, e.twist);
        if (s.twistValues.length < 400) s.twistValues.push(Math.round(e.twist));
      }
    }
    if (e.pointerType !== 'pen') return;
    if (this.firstEventAt === null) this.firstEventAt = e.timeStamp;
    const code = `${e.type}:${e.button}`;
    this.codes[code] = (this.codes[code] ?? 0) + 1;
    const mask = String(e.buttons);
    this.masks[mask] = (this.masks[mask] ?? 0) + 1;
    if (touching) this.pressureBins[Math.min(9, Math.floor(Math.max(0, e.pressure) * 10))]++;
    if (typeof e.altitudeAngle === 'number') widen(this.altitude, e.altitudeAngle);
    else if (typeof e.tiltX === 'number' && typeof e.tiltY === 'number') widen(this.altitude, altitudeOf(e.tiltX, e.tiltY));
    if (typeof e.azimuthAngle === 'number') widen(this.azimuth, e.azimuthAngle);
    else if (typeof e.tiltX === 'number' && typeof e.tiltY === 'number' && (e.tiltX || e.tiltY)) widen(this.azimuth, azimuthOf(e.tiltX, e.tiltY));
    if (typeof e.tangentialPressure === 'number') widen(this.tangential, e.tangentialPressure);
    if (typeof e.width === 'number') widen(this.contactSize, e.width);
    if (this.trace.length < TRACE_MAX && e.type !== 'pointerrawupdate') {
      this.trace.push([Math.round(e.timeStamp - (this.firstEventAt ?? 0)), e.type, Math.round(e.clientX ?? 0), Math.round(e.clientY ?? 0), round(e.pressure) ?? 0, e.tiltX ?? 0, e.tiltY ?? 0, e.twist ?? 0, e.button, e.buttons]);
    }
    if (e.type === 'pointermove' && touching) {
      this.moves++;
      const n = extra.coalesced ?? 1;
      this.coalescedTotal += n;
      this.coalescedMax = Math.max(this.coalescedMax, n);
      for (const t of extra.coalescedTimes ?? [e.timeStamp]) {
        const id = e.pointerId ?? 0;
        const last = this.lastSampleAt.get(id);
        if (last !== undefined && t > last) this.gaps.push(t - last);
        this.lastSampleAt.set(id, t);
      }
    }
    if (e.type === 'pointermove') {
      if (extra.predictedAsked) this.predictedAsked++;
      if (extra.predicted) {
        this.predictedEvents++;
        this.predictedMax = Math.max(this.predictedMax, extra.predicted);
      }
    }
    if (e.type === 'pointerup' || e.type === 'pointercancel') this.lastSampleAt.delete(e.pointerId ?? 0);
  }

  /** A key (an express key on the tablet often sends one). */
  key(key: string, code: string): void {
    for (const s of [this.all, this.stats()]) if (s) s.keys++;
    if (this.keyLog.length < 40 && !this.keyLog.some((k) => k.code === code && k.key === key)) this.keyLog.push({ key, code });
  }

  /** A scroll (a touch ring or dial often sends them). */
  wheel(): void {
    this.wheelCount++;
    for (const s of [this.all, this.stats()]) if (s) s.wheels++;
  }

  /** True once a pen has been seen at all. */
  sawPen(): boolean {
    return this.all.pen > 0;
  }

  /** Friendly pointers on what looks wrong, from what was seen. */
  hints(env: Pick<ReportEnv, 'platform' | 'userAgent'>): string[] {
    const out: string[] = [];
    const windows = env.platform === 'win32' || /Windows/i.test(env.userAgent);
    const a = this.all;
    if (a.pen === 0 && a.other > 0) out.push(windows ? 'No pen events arrived, only mouse or touch ones. On Windows this usually means Windows Ink is turned off in the tablet driver (Wacom Tablet Properties or the Huion driver). Turn it on and restart Frameling.' : 'No pen events arrived, only mouse or touch ones. The tablet may be in mouse mode, or its driver is not sending pen data.');
    if (a.pen > 0 && a.contact > 0 && new Set(a.pressureValues).size <= 1) out.push(windows ? 'Pressure never changed. The driver may be sending a fixed pressure: check that Windows Ink is turned on in the tablet driver.' : 'Pressure never changed while drawing. The driver may be sending a fixed pressure.');
    if (a.pen > 0 && a.tiltX.min === 0 && a.tiltX.max === 0 && a.tiltY.min === 0 && a.tiltY.max === 0) out.push('Tilt always read zero. The pen or its driver may not report tilt, which is normal for some pens.');
    if (a.pen > 0 && a.twist.min === 0 && a.twist.max === 0) out.push('Twist always read zero. Only some pens (the Wacom Art Pen, for one) report barrel rotation.');
    if (a.pen > 0 && a.contact > 0 && a.eraser === 0 && this.steps.get('eraser')?.status === 'skipped') out.push('The eraser end was not tried or has none.');
    return out;
  }

  /** Everything seen, as the report that gets saved. */
  report(env: ReportEnv): TabletReport {
    const a = this.all;
    const sc = this.steps.get('scribble')?.stats;
    const scribbleSeconds = sc && sc.firstContact !== null && sc.lastContact !== null ? Math.max(0.001, sc.lastContact - sc.firstContact) / 1000 : 0;
    const gap = median(this.gaps);
    const stepsOut = CHECK_STEPS.map((id) => {
      const e = this.steps.get(id);
      return { id, status: e?.status ?? ('not-reached' as StepStatus), seen: e ? summarise(e.stats) : null };
    });
    return {
      kind: REPORT_KIND,
      version: REPORT_VERSION,
      createdAt: env.now.toISOString(),
      app: { version: env.appVersion, electron: env.electron, chrome: env.chrome },
      system: { platform: env.platform, ...(env.session ? { session: env.session } : {}), userAgent: env.userAgent, devicePixelRatio: env.devicePixelRatio, screen: env.screen, maxTouchPoints: env.maxTouchPoints },
      support: env.support,
      devices: {
        pointerTypes: { ...this.types },
        pointerIds: this.pointerIds.size,
        hid: env.hid,
        note: 'Browsers do not say which tablet is plugged in. HID devices are listed only when already allowed.',
      },
      settings: env.settings,
      pressure: {
        min: round(a.pressure.min),
        max: round(a.pressure.max),
        distinctValues: new Set(a.pressureValues).size,
        histogram: [...this.pressureBins],
        curve: Array.from({ length: 11 }, (_, i) => [i / 10, round(mapPressure(i / 10, this.pen))]),
        tangential: { ...this.tangential },
      },
      tilt: { tiltX: { ...a.tiltX }, tiltY: { ...a.tiltY }, altitude: { min: round(this.altitude.min), max: round(this.altitude.max) }, azimuth: { min: round(this.azimuth.min), max: round(this.azimuth.max) } },
      twist: { min: a.twist.min, max: a.twist.max },
      contactSize: { ...this.contactSize },
      buttons: {
        eventCodes: { ...this.codes },
        buttonsBitmasks: { ...this.masks },
        eraserDetected: a.eraser > 0,
        barrel1Detected: a.barrel1 > 0,
        barrel2Detected: a.barrel2 > 0,
      },
      rate: {
        moveEvents: this.moves,
        coalescedSamples: this.coalescedTotal,
        maxCoalescedPerEvent: this.coalescedMax,
        scribbleSeconds: round(scribbleSeconds),
        moveEventsPerSecond: scribbleSeconds > 0 ? round(this.moves / scribbleSeconds, 1) : null,
        samplesPerSecond: scribbleSeconds > 0 ? round(this.coalescedTotal / scribbleSeconds, 1) : null,
        medianSampleGapMs: round(gap, 2),
        estimatedHz: gap ? Math.round(1000 / gap) : null,
      },
      predicted: { askedOnMoves: this.predictedAsked, moveEventsWithPredicted: this.predictedEvents, maxPredictedPerEvent: this.predictedMax },
      keys: { count: a.keys, wheelEvents: this.wheelCount, seen: [...this.keyLog] },
      steps: stepsOut,
      hints: this.hints(env),
      trace: { columns: ['ms', 'type', 'x', 'y', 'pressure', 'tiltX', 'tiltY', 'twist', 'button', 'buttons'], samples: [...this.trace] },
    };
  }
}

function summarise(s: StepStats) {
  return { penEvents: s.pen, hover: s.hover, contact: s.contact, otherPointerEvents: s.other, pressure: { ...s.pressure }, tiltX: { ...s.tiltX }, tiltY: { ...s.tiltY }, twist: { ...s.twist }, eraser: s.eraser, barrel1: s.barrel1, barrel2: s.barrel2, keys: s.keys, wheels: s.wheels };
}

export interface TabletReport {
  kind: typeof REPORT_KIND;
  version: number;
  createdAt: string;
  app: { version: string; electron: string; chrome: string };
  system: { platform: string; session?: ReportEnv['session']; userAgent: string; devicePixelRatio: number; screen: { width: number; height: number }; maxTouchPoints: number };
  support: ReportEnv['support'];
  devices: { pointerTypes: Record<string, number>; pointerIds: number; hid: ReportEnv['hid']; note: string };
  settings: unknown;
  pressure: { min: number | null; max: number | null; distinctValues: number; histogram: number[]; curve: (number | null)[][]; tangential: Range };
  tilt: { tiltX: Range; tiltY: Range; altitude: Range; azimuth: Range };
  twist: Range;
  contactSize: Range;
  buttons: { eventCodes: Record<string, number>; buttonsBitmasks: Record<string, number>; eraserDetected: boolean; barrel1Detected: boolean; barrel2Detected: boolean };
  rate: { moveEvents: number; coalescedSamples: number; maxCoalescedPerEvent: number; scribbleSeconds: number | null; moveEventsPerSecond: number | null; samplesPerSecond: number | null; medianSampleGapMs: number | null; estimatedHz: number | null };
  predicted: { askedOnMoves: number; moveEventsWithPredicted: number; maxPredictedPerEvent: number };
  keys: { count: number; wheelEvents: number; seen: { key: string; code: string }[] };
  steps: { id: CheckStepId; status: StepStatus; seen: ReturnType<typeof summarise> | null }[];
  hints: string[];
  trace: { columns: string[]; samples: (number | string)[][] };
}

export const reportFileName = (now: Date): string => `frameling-tablet-report-${now.toISOString().slice(0, 10)}.json`;
