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
import type { CrashNotes, FramelingApi } from '../preload/api';
import { refreshReport } from '../gpu/report';
import { machineFacts, type MachineFacts } from './machine';
import { buildReport, type IngestReport } from './report';
import { canSend } from './send';

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

/** How the crash is put in the report's first line. */
export function sayHow(how: CrashNotes['how']): string {
  if (how === 'window') return 'The drawing window crashed during the last run.';
  if (how === 'both') return 'The drawing window crashed, and Frameling then stopped without closing properly.';
  return 'Frameling stopped without closing properly last time.';
}

/**
 * The report for a crash. Built from the notes and what this computer is, and nothing else: no drawing, no file names,
 * no words anyone typed. Pure, so the dialog can show exactly what would go.
 */
export function crashReport(notes: CrashNotes, env: Record<string, unknown>, contact?: string, machine?: MachineFacts | null): IngestReport {
  const r = buildReport({ note: sayHow(notes.how), contact, where: 'after a crash', env, problems: notes.events, machine });
  return {
    ...r,
    kind: 'crash',
    version: notes.version || r.version,
    platform: notes.platform || r.platform,
    data: { ...r.data, crash: { how: notes.how, startedAt: new Date(notes.startedAt).toISOString(), version: notes.version, platform: notes.platform } },
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
    title: 'Quill after a crash',
    question: 'When Frameling crashed last time, shall Quill turn up and offer to send the crash notes? Nothing is ever sent without a press.',
    category: 'Diagnostics',
    default: 'ask',
    silent: true,
    help: 'crash-notes',
    options: [
      { value: 'ask', label: 'Offer to send the notes', detail: 'Quill asks once per crash. You can read the notes before anything goes.' },
      { value: 'no', label: 'No thanks', detail: "Quill stays away after a crash. The command Send the notes from the last crash still works." },
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
