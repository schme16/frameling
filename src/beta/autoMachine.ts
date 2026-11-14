/**
 * Whether the reports a beta build sends by itself may say what this computer is.
 *
 * Those reports go without anyone reading them first, so they carry the processor, memory and graphics card only if the
 * person said yes, once, in a question put early (not while something is crashing). Until it is answered, or when the
 * answer is no, they stay bare. A report sent by hand is different: it is read first and has its own tick box.
 *
 * The decision is in plain functions so the tests can hold it. The question itself is an ordinary ask-once choice, so it
 * is listed in Preferences > Behaviour and can be changed there, and from the Diagnostics page.
 */
import { choose, registerChoice, rememberedChoice } from '../core/choices';
import { anyOverlayOpen, overlays } from '../ui/overlays';
import { getPrefs } from '../ui/prefs';
import { choiceWord } from '../words/choices';
import { canSend } from './send';

export const AUTO_MACHINE_CHOICE = 'beta.autoMachine';

export type AutoMachineAnswer = 'yes' | 'no';

/**
 * Whether an automatic report carries the machine details. Only a remembered yes counts, so an unanswered question, a
 * closed dialog and a no all leave it bare. The tick box for hand-sent reports is honoured too: someone who turned
 * "Include details of this computer" off has said they do not want them anywhere.
 */
export function autoCarriesMachine(remembered: string | undefined, includeDetails: boolean): boolean {
  return remembered === 'yes' && includeDetails;
}

/** The answer as it stands now. */
export const autoMachineAllowed = (): boolean => autoCarriesMachine(rememberedChoice(AUTO_MACHINE_CHOICE), getPrefs().betaMachine);

export interface AskFacts {
  /** This build carries a way to send, and reports are switched on: otherwise nothing could ever be sent by itself. */
  reporting: boolean;
  remembered: string | undefined;
  /** One of our own test runs, which never sends. */
  harness: boolean;
  /** Something else is open (the welcome sheet, another question), so this one waits. */
  busy: boolean;
}

/** Whether to put the question now. Only when it matters, and only once it is answered for good. */
export const shouldAsk = (f: AskFacts): boolean => f.reporting && f.remembered === undefined && !f.harness && !f.busy;

export function registerAutoMachineChoice(): void {
  registerChoice<AutoMachineAnswer>({
    id: AUTO_MACHINE_CHOICE,
    title: choiceWord('choice.beta.autoMachine.title'),
    question: choiceWord('choice.beta.autoMachine.question'),
    category: 'Diagnostics',
    // Never a yes by default: an unanswered question and a closed dialog both mean no.
    default: 'no',
    dismiss: 'no',
    highlight: 'no',
    // Always a sheet that stops and asks: "answer everything the usual way" must not make this call for someone.
    mustAsk: true,
    help: 'beta-reports',
    options: [
      { value: 'yes', label: choiceWord('choice.beta.autoMachine.yes.label'), detail: choiceWord('choice.beta.autoMachine.yes.detail') },
      { value: 'no', label: choiceWord('choice.beta.autoMachine.no.label'), detail: choiceWord('choice.beta.autoMachine.no.detail') },
    ],
  });
}

const underHarness = (): boolean => typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/** Puts the question if it is due. Resolves whatever the answer was (a closed dialog is a no for now, and not remembered). */
export async function askAutoMachineIfDue(): Promise<void> {
  const due = shouldAsk({
    reporting: canSend() && getPrefs().betaReports,
    remembered: rememberedChoice(AUTO_MACHINE_CHOICE),
    harness: underHarness(),
    busy: anyOverlayOpen(),
  });
  if (due) await choose<AutoMachineAnswer>(AUTO_MACHINE_CHOICE);
}

/** How soon after start-up the question comes, once the window has settled and the first sheet has had its moment. */
export const ASK_AFTER = 8000;

/** Asks early: a few seconds after start, and again whenever a sheet that was in the way closes. Gives back the way to stop. */
export function watchAutoMachine(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = (ms: number): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void askAutoMachineIfDue();
    }, ms);
  };
  later(ASK_AFTER);
  const off = overlays.subscribe(() => {
    if (!anyOverlayOpen()) later(2500);
  });
  return () => {
    off();
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
