// The pen check's memory and flow: whether it has been done, when to offer it, where it is up to, and saving the report.
import { createStore, readRaw, writeJson } from '../../ui/mini';
import { overlays } from '../../ui/overlays';
import { desktop } from '../../io/desktop';
import { getPen } from '../settings';
import { CHECK_STEPS, reportFileName, type CheckStepId, type ReportEnv, type TabletReport } from './recorder';

// ---------------------------------------------------------------- remembering

export const CHECK_KEY = 'frameling.penCheck.v1';

export interface CheckMemory {
  /** A finished report was saved. Then the check is never offered again by itself. */
  done: boolean;
  /** "Don't ask again" was chosen. The check is still there in Preferences, Diagnostics. */
  declined: boolean;
}

export const checkMemory = createStore<CheckMemory>(((): CheckMemory => {
  const r = readRaw<Partial<CheckMemory>>(CHECK_KEY, {});
  return { done: r.done === true, declined: r.declined === true };
})());

export function setCheckMemory(patch: Partial<CheckMemory>): void {
  const next = { ...checkMemory.get(), ...patch };
  checkMemory.set(next);
  writeJson(CHECK_KEY, next);
}

// ---------------------------------------------------------------- offering

/** Offered once per run of the app: "Not now", or closing it half way, waits for the next time a pen shows up. */
let offered = false;
let timer: ReturnType<typeof setTimeout> | 0 = 0;
export const OFFER_DELAY_MS = 900;

/** For tests. */
export function resetOffer(): void {
  offered = false;
  if (timer) clearTimeout(timer);
  timer = 0;
}

let strokeOn: () => boolean = () => false;
/** The canvas says whether a stroke (or any drag) is on, so the offer never lands in the middle of one. */
export function setStrokeProbe(fn: (() => boolean) | null): void {
  strokeOn = fn ?? (() => false);
}

/** Whether a stroke (or any drag) is on right now. */
export const strokeIsOn = (): boolean => strokeOn();

/** Quill's offer is wanted: a pen has been seen, the check was never finished or turned down, and nothing else is open. */
export function shouldOffer(): boolean {
  const m = checkMemory.get();
  const o = overlays.get();
  return !offered && !m.done && !m.declined && !o.penCheck && !o.palette && !o.prefs && !o.help && !o.sheet && !o.about && !o.onboarding;
}

/**
 * The canvas calls this for pen events when no stroke is on, so the offer never lands mid line. If something else is open
 * it tries again with the next pen event.
 */
export function noticePen(): void {
  if (offered || timer || !shouldOffer()) return;
  timer = setTimeout(() => {
    timer = 0;
    // A pen hovered, then pressed, and the stroke is still going: the next lift asks again.
    if (strokeOn() || !shouldOffer()) return;
    offered = true;
    overlays.set((o) => ({ ...o, penCheck: 'offer' }));
  }, OFFER_DELAY_MS);
}

/** Opens the check by hand (Preferences, Diagnostics): straight into the steps. */
export function startPenCheck(): void {
  offered = true;
  overlays.set((o) => ({ ...o, penCheck: 'run', prefs: null, palette: false }));
}

export function closePenCheck(): void {
  overlays.set((o) => ({ ...o, penCheck: undefined }));
}

// ---------------------------------------------------------------- where it is up to

export type CheckPhase = 'offer' | 'run' | 'save' | 'saved';

export interface CheckFlow {
  phase: CheckPhase;
  /** Which step is on, while running. */
  step: number;
  done: CheckStepId[];
  skipped: CheckStepId[];
  /** The last save did not happen (cancelled, or it failed). */
  saveProblem: 'cancelled' | 'failed' | null;
}

export type CheckAction =
  | { type: 'accept' }
  | { type: 'stepDone'; id?: CheckStepId }
  | { type: 'skip'; id?: CheckStepId }
  | { type: 'saveFailed'; why: 'cancelled' | 'failed' }
  | { type: 'saved' };

export const startFlow = (phase: CheckPhase = 'run'): CheckFlow => ({ phase, step: 0, done: [], skipped: [], saveProblem: null });

export function reduceCheck(f: CheckFlow, a: CheckAction): CheckFlow {
  const id = CHECK_STEPS[f.step];
  const advance = (patch: Partial<CheckFlow>): CheckFlow => (f.step + 1 >= CHECK_STEPS.length ? { ...f, ...patch, phase: 'save' } : { ...f, ...patch, step: f.step + 1 });
  switch (a.type) {
    case 'accept':
      return f.phase === 'offer' ? { ...f, phase: 'run' } : f;
    // An action for a step that is no longer the current one (a fast burst of events) changes nothing.
    case 'stepDone':
      return f.phase === 'run' && id && (!a.id || a.id === id) && !f.done.includes(id) ? advance({ done: [...f.done, id] }) : f;
    case 'skip':
      return f.phase === 'run' && id && (!a.id || a.id === id) ? advance({ skipped: [...f.skipped, id] }) : f;
    case 'saveFailed':
      return f.phase === 'save' ? { ...f, saveProblem: a.why } : f;
    case 'saved':
      return f.phase === 'save' ? { ...f, phase: 'saved', saveProblem: null } : f;
  }
}

// ---------------------------------------------------------------- the report's surroundings and saving it

/** What this computer and Frameling are, for the report. Nothing personal: no names, no paths. */
export async function gatherEnv(now: Date = new Date()): Promise<ReportEnv> {
  const api = desktop() ?? (typeof window !== 'undefined' ? (window as { frameling?: { platform?: string; session?: ReportEnv['session']; versions?: { app: string; electron: string; chrome: string } } }).frameling : undefined);
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  let hid: ReportEnv['hid'] = { available: false, devices: [] };
  try {
    const h = (nav as unknown as { hid?: { getDevices(): Promise<{ vendorId: number; productId: number; productName: string }[]> } } | undefined)?.hid;
    if (h?.getDevices) hid = { available: true, devices: (await h.getDevices()).map((d) => ({ vendorId: d.vendorId, productId: d.productId, productName: d.productName })) };
  } catch {
    // Not allowed here.
  }
  const pe = typeof PointerEvent !== 'undefined' ? PointerEvent.prototype : undefined;
  return {
    appVersion: api?.versions?.app ?? '',
    electron: api?.versions?.electron ?? '',
    chrome: api?.versions?.chrome ?? '',
    platform: api?.platform ?? 'web',
    session: api?.session,
    userAgent: nav?.userAgent ?? '',
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    screen: { width: typeof screen !== 'undefined' ? screen.width : 0, height: typeof screen !== 'undefined' ? screen.height : 0 },
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    support: {
      pointerEvents: typeof PointerEvent !== 'undefined',
      coalesced: !!pe && 'getCoalescedEvents' in pe,
      predicted: !!pe && 'getPredictedEvents' in pe,
      altitudeAzimuth: !!pe && 'altitudeAngle' in pe,
    },
    hid,
    settings: getPen(),
    now,
  };
}

export type SaveResult = 'saved' | 'cancelled' | 'failed';

/** Shows the Save dialog and writes the report. In a plain browser tab it downloads the file instead. */
export async function saveReport(report: TabletReport): Promise<SaveResult> {
  const name = reportFileName(new Date(report.createdAt));
  const bytes = new TextEncoder().encode(JSON.stringify(report, null, 2));
  const api = desktop();
  if (api) {
    try {
      const target = await api.files.pickExportFile({ suggestedName: name, filters: [{ name: 'JSON report', extensions: ['json'] }], title: 'Save the pen report' });
      if (!target) return 'cancelled';
      const r = await api.files.write(target, bytes);
      return 'error' in r ? 'failed' : 'saved';
    } catch {
      return 'failed';
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'failed';
  }
}
