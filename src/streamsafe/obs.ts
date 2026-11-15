// Going live with OBS: the real wiring. Registers the "when OBS stops" choice, makes the one controller from the real
// desktop bridge, the preferences, Stream-safe and the toast, and follows the "Going live with OBS" preference.
// The decisions are in obsLogic.ts, the controller in obsLink.ts. Off until switched on, and never an error when OBS is not there.
import { useSyncExternalStore } from 'react';
import { registerChoice, withChoice } from '../core/choices';
import { streamSafe, subscribeStreamSafe } from '../core/streamSafe';
import { desktop } from '../io/desktop';
import { getPrefs, setPrefs, subscribePrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { choiceWord } from '../words/choices';
import { ObsLink } from './obsLink';
import type { ObsState } from './obsLogic';

export const STOP_CHOICE = 'stream.golive.stop';

// Asked once, when OBS stops after Frameling switched Stream-safe on: the person may still be sharing their screen, so
// nothing is switched off silently. The usual answer when nobody can be asked is to leave it on.
registerChoice({
  id: STOP_CHOICE,
  title: choiceWord('choice.stream.golive.stop.title'),
  question: choiceWord('choice.stream.golive.stop.question'),
  category: 'Sharing your screen',
  help: 'obs-golive',
  default: 'keep',
  dismiss: 'keep',
  highlight: 'off',
  options: [
    { value: 'off', label: choiceWord('choice.stream.golive.stop.off.label'), detail: choiceWord('choice.stream.golive.stop.off.detail'), did: choiceWord('choice.stream.golive.stop.off.did') },
    { value: 'keep', label: choiceWord('choice.stream.golive.stop.keep.label'), detail: choiceWord('choice.stream.golive.stop.keep.detail'), did: choiceWord('choice.stream.golive.stop.keep.did') },
    { value: 'wait', label: choiceWord('choice.stream.golive.stop.wait.label'), detail: choiceWord('choice.stream.golive.stop.wait.detail'), once: true },
  ],
});

/** The one controller. */
export const obs = new ObsLink({
  bridge: desktop()?.obs ?? null,
  address: () => getPrefs().obsAddress,
  isSafe: streamSafe,
  setSafe: (on) => setPrefs({ streamSafe: on }),
  onSafe: subscribeStreamSafe,
  offerOff: (run) => withChoice<'off' | 'keep' | 'wait'>(STOP_CHOICE, (v) => run(v === 'off')),
  say: (text) => toast(text, { kind: 'info', quill: null }),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

/** For a component: draws again when the link changes. */
export const useObsState = (): ObsState => useSyncExternalStore(obs.subscribe, () => obs.state, () => obs.state);

/** Turns going live with OBS on or off (the preference, which the controller follows). */
export function setObsLink(on: boolean): void {
  if (on && !obs.available) {
    toast("Going live with OBS works in the Frameling desktop app.", { kind: 'info', quill: null });
    return;
  }
  setPrefs({ obsLink: on });
}

let started = false;
/** Starts following the preferences. Safe to call more than once. */
export function startObsLink(): void {
  if (started) return;
  started = true;
  obs.attach();
  let linked = getPrefs().obsLink;
  let address = getPrefs().obsAddress;
  if (linked) obs.enable({ quiet: true });
  subscribePrefs(() => {
    const p = getPrefs();
    if (p.obsLink !== linked) {
      linked = p.obsLink;
      if (linked) obs.enable();
      else obs.disable();
    }
    if (p.obsAddress !== address) {
      address = p.obsAddress;
      obs.addressChanged();
    }
  });
}
