// "Do you stream?": the one question that decides whether the streaming tools stay in the lists. New people answer it in
// the first-run hello ("Streaming it live" is one of its cards). Everybody who finished the hello before it asked gets
// Quill's offer once, a little after Frameling opens: yes keeps everything, no tucks the streaming tools away. Closing
// the question counts as an answer for good, so it never comes back. The answer is a remembered choice, so it is listed
// in Preferences > Behaviour and changing it there does what it says. Nothing is deleted either way.
import { askAgain, canAsk, onChoiceChange, registerChoice, rememberedChoice, setChoice, type ChoiceDef } from '../core/choices';
import { isFirstRun } from '../ui/onboarding/state';
import { readRaw, writeJson } from '../ui/mini';
import { anyOverlayOpen } from '../ui/overlays';
import { getPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { choiceWord } from '../words/choices';
import { onFeaturesChange } from './host';
import { STREAM_FEATURES } from './streamIds';
import { setStreaming, streamingCount, STREAMING_NAME } from './streamFamily';

export const STREAM_OFFER_ID = 'streaming.offer';
const KEY = 'frameling.streamOffer.v1';

const offerChoice: ChoiceDef<'yes' | 'no'> = {
  id: STREAM_OFFER_ID,
  title: choiceWord('choice.streaming.offer.title'),
  question: choiceWord('choice.streaming.offer.question'),
  options: [
    { value: 'yes', label: choiceWord('choice.streaming.offer.yes.label'), detail: choiceWord('choice.streaming.offer.yes.detail'), did: choiceWord('choice.streaming.offer.yes.did') },
    { value: 'no', label: choiceWord('choice.streaming.offer.no.label'), detail: choiceWord('choice.streaming.offer.no.detail'), did: choiceWord('choice.streaming.offer.no.did') },
  ],
  // Nothing changes unless somebody says no: the usual way, closing the question and "answer them all the usual way" all keep everything.
  default: 'yes',
  dismiss: 'yes',
  category: 'Streaming',
  quill: true,
  help: 'features',
};

/** Puts the question in the list of remembered choices. Done when this loads; a test that clears the choices calls it again. */
export const registerStreamOfferChoice = (): void => registerChoice(offerChoice);
registerStreamOfferChoice();

/** Whether the offer has been dealt with (answered, closed, or no longer needed). Kept in the browser's storage, so it is once per person. */
export const streamOfferDone = (): boolean => readRaw<boolean>(KEY, false) === true;
export const markStreamOfferDone = (): void => writeJson(KEY, true);
/** For tests. */
export const resetStreamOffer = (): void => writeJson(KEY, false);

export interface OfferFacts {
  onboarded: boolean;
  /** This is the run the hello is on (or just was): it has its own question, so wait. */
  helloThisRun: boolean;
  done: boolean;
  /** An answer is remembered already (from the hello, or from Preferences > Behaviour). */
  answered: boolean;
  /** How many of the streaming features are on. */
  on: number;
  /** How many streaming features there are. */
  total: number;
}

/**
 * What to do about the offer right now. `ask` puts the question; `wait` leaves it for later; `retire` never asks (it is
 * answered already, there is nothing left to tuck, or the person has already switched some off themselves, which says
 * they have found the Features page and made their own choice).
 */
export function offerAction(f: OfferFacts): 'ask' | 'wait' | 'retire' {
  if (f.done) return 'wait';
  if (!f.onboarded || f.helloThisRun) return 'wait';
  if (f.answered || f.on === 0 || f.on < f.total) return 'retire';
  return 'ask';
}

const facts = (): OfferFacts => ({
  onboarded: getPrefs().onboarded,
  helloThisRun: helloAtStart,
  done: streamOfferDone(),
  answered: rememberedChoice(STREAM_OFFER_ID) !== undefined,
  on: streamingCount(),
  total: STREAM_FEATURES.length,
});

/** Tucks the streaming tools away, saying so, with a way back. Returns how many went. */
export function tuckStreaming(): number {
  const went = setStreaming(false);
  if (went.length) {
    toast(`Tucked away the ${STREAMING_NAME.toLowerCase()}, so there's less in your way. Any of it comes back in Preferences > Streaming.`, {
      kind: 'info',
      duration: 12_000,
      action: { label: 'Bring them back', id: 'streaming-undo', run: () => bringStreamingBack() },
    });
  }
  return went.length;
}

/** Brings the whole family back, and remembers that the answer is yes. */
export function bringStreamingBack(): number {
  return setStreaming(true).length;
}

// However a streaming tool comes back (the palette, Features, Turn every feature back on), "Do you stream?" is yes again, so Preferences says what is true.
onFeaturesChange((e) => {
  if (!STREAM_FEATURES.includes(e.id)) return;
  const said = rememberedChoice(STREAM_OFFER_ID);
  if (e.on && said === 'no') setChoice(STREAM_OFFER_ID, 'yes');
  else if (!e.on && said !== 'no' && streamingCount() === 0) setChoice(STREAM_OFFER_ID, 'no');
});

// Changing the answer in Preferences > Behaviour does what it says.
onChoiceChange((id, value) => {
  if (id !== STREAM_OFFER_ID) return;
  if (value === 'no') tuckStreaming();
  else if (value === 'yes' && streamingCount() === 0) setStreaming(true);
});

/**
 * Records what the first-run hello learned, so the offer never repeats it. `picked` is whether Streaming it live was
 * a card picked; `answered` is whether any card was (no picks is a skipped question, which the offer picks up later).
 */
export function noteHelloAnswer(o: { picked: boolean; answered: boolean }): void {
  if (!o.answered) return;
  markStreamOfferDone();
  if (o.picked) setChoice(STREAM_OFFER_ID, 'yes');
  else if (streamingCount() === 0) setChoice(STREAM_OFFER_ID, 'no');
}

let started = false;
/** The hello opened on this start, so the offer waits for the next one. */
let helloAtStart = false;

/** Looks at whether the offer is due and puts it if so. When something else has the screen it tries again in a few seconds, for a while. */
export async function considerStreamOffer(tries = 0): Promise<'asked' | 'retired' | 'waiting'> {
  const act = offerAction(facts());
  if (act === 'retire') {
    markStreamOfferDone();
    return 'retired';
  }
  if (act === 'wait') return 'waiting';
  // Something else has the screen (a dialog, a lesson): try again in a few seconds, for a while.
  if (anyOverlayOpen() || !canAsk(STREAM_OFFER_ID)) {
    if (tries < 40) setTimeout(() => void considerStreamOffer(tries + 1), 5000);
    return 'waiting';
  }
  // Closing the question counts as an answer for good: it is marked done before it is put.
  markStreamOfferDone();
  const r = await askAgain(STREAM_OFFER_ID);
  if (r) setChoice(STREAM_OFFER_ID, r.value);
  return 'asked';
}

/**
 * Starts the watch: a little after Frameling opens, the offer is put once if it is due. Safe to call more than once.
 * Left alone with ?debug, so the screenshot scripts stay the same.
 */
export function startStreamOffer(): void {
  if (started || typeof window === 'undefined') return;
  try {
    if (new URLSearchParams(location.search).has('debug')) return;
  } catch {
    // No location (tests).
  }
  started = true;
  helloAtStart = isFirstRun();
  setTimeout(() => void considerStreamOffer(), 9000);
}
