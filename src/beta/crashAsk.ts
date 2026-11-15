/**
 * After a crash, a dazed Quill is there on the next start and asks whether to send the crash notes.
 *
 * He asks, you decide. Nothing goes until you press Send, and you can read every word first (the same report text
 * the Diagnostics panel shows). The desktop side spots the crash (src/main/crashMarker.ts); this is what the page
 * does with it. Three rules, held by the tests:
 * 1. Once per crash, and never after a clean quit.
 * 2. A build with no way to send never offers to: Quill says what happened and leaves it there.
 * 3. "No thanks" can be remembered, and then he stays away (the command still works whenever you want it).
 */
import { registerChoice, rememberedChoice } from '../core/choices';
import { anyOverlayOpen, overlays } from '../ui/overlays';
import { createStore } from '../ui/mini';
import { getPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { gatherEnv } from '../tablet/check/state';
import type { RunFacts, CrashNotes, FramelingApi } from '../preload/api';
import { refreshReport } from '../gpu/report';
import { machineFacts, type MachineFacts } from './machine';
import { buildReport, type IngestReport } from './report';
import { canSend } from './send';
import { choiceWord } from '../words/choices';

/** The choice that remembers a No thanks. */
export const CRASH_CHOICE = 'beta.crashOffer';

export type CrashAction =
  /** Nothing to show. */
  | { kind: 'none' }
  /** The palette command, and the last run closed properly: say so. */
  | { kind: 'nothing' }
  /** Quill meets you and asks whether to send the notes. */
  | { kind: 'ask' }
  /** Quill says what happened and leaves it there (a build with no way to send). */
  | { kind: 'tell' }
  /** The command, in a build that can send but whose reports are switched off in Preferences. */
  | { kind: 'off' };

export interface CrashFacts {
  /** The desktop side found a crash from last time (and still has its notes). */
  crash: boolean;
  /** Quill has already turned up for it. */
  offered: boolean;
  /** This build carries a way to send reports. */
  canSend: boolean;
  /** Let me send reports to the makers: on in a beta build, off otherwise. */
  switchOn: boolean;
  /** The remembered answer: `no` is a remembered No thanks. */
  remembered?: string;
  /** The palette command: whatever was said before, ask again. */
  force?: boolean;
}

/** What to do about a crash, in each case. Pure. */
export function crashAction(f: CrashFacts): CrashAction {
  if (!f.crash) return { kind: f.force ? 'nothing' : 'none' };
  if (!f.force && (f.offered || f.remembered === 'no')) return { kind: 'none' };
  if (!f.canSend) return { kind: 'tell' };
  if (!f.switchOn) return { kind: f.force ? 'off' : 'none' };
  return { kind: 'ask' };
}

/** A crash older than this is not met by Quill on his own (he'd be turning up for something long forgotten). The command still can. */
export const FRESH_DAYS = 7;
export const isFresh = (notes: CrashNotes, now: number = Date.now()): boolean => now - notes.startedAt < FRESH_DAYS * 86_400_000;

/** Below this, the computer had little room left, which is what the system's out-of-memory stop looks like from outside. */
export const LOW_FREE_MB = 400;

/** How the crash is put in the report's first line. With the facts it can be truer: a restart, or no memory left. */
export function sayHow(how: CrashNotes['how'], facts?: RunFacts): string {
  if (how === 'window') return 'The drawing window crashed during the last run.';
  const stopped = how === 'both' ? 'The drawing window crashed, and Frameling then stopped without closing properly.' : 'Frameling stopped without closing properly last time.';
  if (facts?.restarted) return `${stopped} The computer restarted or lost power after that, so that may be the cause.`;
  if (facts?.lowestFreeMB !== undefined && facts.lowestFreeMB < LOW_FREE_MB) return `${stopped} The computer was nearly out of memory, so the system may have stopped it.`;
  return stopped;
}

/** The facts, as a line or two a person can read. Empty when there are none (an older run, or one that stopped at once). */
export function sayFacts(f?: RunFacts): string {
  if (!f) return '';
  const parts: string[] = [];
  if (f.ranMinutes !== undefined) parts.push(`It had been open about ${f.ranMinutes} minute${f.ranMinutes === 1 ? '' : 's'}.`);
  if (f.peakMB !== undefined) parts.push(`At its biggest Frameling used about ${f.peakMB} MB.`);
  if (f.lowestFreeMB !== undefined) parts.push(`The computer had as little as ${f.lowestFreeMB} MB free.`);
  return parts.join(' ');
}

/** What a crash report needs from the computer's details: where and on what, not how the pen or the tools were set up. */
const CRASH_ENV_KEYS = ['appVersion', 'electron', 'chrome', 'platform', 'session', 'devicePixelRatio', 'screen', 'now'];
export const crashEnv = (env: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(CRASH_ENV_KEYS.filter((k) => k in env).map((k) => [k, env[k]]));

/**
 * The report for a crash. Built from the notes and what this computer is, and nothing else: no drawing, no file names,
 * no words anyone typed. Pure, so the dialog can show exactly what would go.
 */
export function crashReport(notes: CrashNotes, env: Record<string, unknown>, contact?: string, machine?: MachineFacts | null): IngestReport {
  const headline = sayHow(notes.how, notes.facts);
  const r = buildReport({ note: headline, contact, where: 'after a crash', env: crashEnv(env), problems: notes.events, machine });
  return {
    ...r,
    kind: 'crash',
    // The headline is the title and summary; the text adds only what the headline doesn't say.
    text: sayFacts(notes.facts),
    version: notes.version || r.version,
    platform: notes.platform || r.platform,
    data: { ...r.data, crash: { how: notes.how, startedAt: new Date(notes.startedAt).toISOString(), version: notes.version, platform: notes.platform, ...(notes.facts ? { facts: notes.facts } : {}) } },
  };
}

export type CrashDialog = { mode: 'ask' | 'tell'; notes: CrashNotes; report: IngestReport } | null;

/** What the dialog shows. Null when it is closed. */
export const crashDialog = createStore<CrashDialog>(null);

// While Quill is up, other offers (an interface size, say) wait their turn.
crashDialog.subscribe(() => overlays.set((o) => (!!o.crashOffer === !!crashDialog.get() ? o : { ...o, crashOffer: !!crashDialog.get() })));

/** Registers the choice that Preferences > Behaviour lists, so a remembered No thanks can be changed. */
export function registerCrashChoice(): void {
  registerChoice<'ask' | 'no'>({
    id: CRASH_CHOICE,
    title: choiceWord('choice.beta.crashOffer.title'),
    question: choiceWord('choice.beta.crashOffer.question'),
    category: 'Diagnostics',
    default: 'ask',
    silent: true,
    help: 'crash-notes',
    options: [
      { value: 'ask', label: choiceWord('choice.beta.crashOffer.ask.label'), detail: choiceWord('choice.beta.crashOffer.ask.detail') },
      { value: 'no', label: choiceWord('choice.beta.crashOffer.no.label'), detail: choiceWord('choice.beta.crashOffer.no.detail') },
    ],
  });
}

type AppBridge = NonNullable<FramelingApi['app']>;
const bridge = (): Partial<AppBridge> | undefined => (typeof window === 'undefined' ? undefined : (window as { frameling?: FramelingApi }).frameling?.app);

async function lastCrash(): Promise<{ notes: CrashNotes; offered: boolean } | null> {
  try {
    return (await bridge()?.getLastCrash?.()) ?? null;
  } catch {
    return null;
  }
}

/** Looks at what the desktop side found and does what `crashAction` says. `force` is the palette command. */
export async function considerCrash(o: { force?: boolean } = {}): Promise<void> {
  const last = await lastCrash();
  const action = crashAction({
    crash: !!last && (!!o.force || isFresh(last.notes)),
    offered: !!last?.offered,
    canSend: canSend(),
    switchOn: getPrefs().betaReports,
    remembered: rememberedChoice(CRASH_CHOICE),
    force: o.force,
  });
  if (action.kind === 'none') return;
  if (action.kind === 'nothing') {
    toast('Nothing to send: Frameling closed properly the last time it was used.', { kind: 'info' });
    return;
  }
  if (action.kind === 'off') {
    toast('Reports to the makers are switched off. You can turn them on in Preferences, Diagnostics.', { kind: 'info' });
    return;
  }
  // Something else is open (the welcome sheet, another question): the next start asks again, and the command can.
  if (!o.force && (anyOverlayOpen() || crashDialog.get())) return;
  const notes = last!.notes;
  const env = (await gatherEnv()) as unknown as Record<string, unknown>;
  // The processor and graphics go in only when the person left that on, and show in the "Read what would go" box.
  const machine = getPrefs().betaMachine ? machineFacts(await refreshReport()) : null;
  crashDialog.set({ mode: action.kind, notes, report: crashReport(notes, env, getPrefs().betaContact, machine) });
  bridge()?.crashOffered?.();
}

let started = false;

/** The check on start-up: once, after the first-run hello and when nothing is open. Safe to call more than once. */
export function startCrashWatch(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const first = async (tries: number) => {
    if (!getPrefs().onboarded || anyOverlayOpen()) {
      if (tries < 40) setTimeout(() => void first(tries + 1), 3000);
      return;
    }
    await considerCrash();
  };
  setTimeout(() => void first(0), 1500);
}
