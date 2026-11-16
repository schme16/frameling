// What the audience may do with the jar: drop a prompt in. That is all. There is no action that reads the jar, shows
// a prompt or pulls one out, so nothing a viewer sends can put words on screen: only the streamer's own pull does.
// It never touches the drawing (no `touchesDrawing`).
import { refusal, registerAudienceAction, type Refusal } from '../audience';
import { currentChoice } from '../core/choices';
import { addToJar, noteFull, wouldAdd } from './jar';
import { cleanPrompt, paceLeft, paceMs } from './logic';

export const ADD_ACTION = 'jar.add';

/** When the last prompt went in, for the pause every prompt shares. Not who sent it: nothing here knows that. */
let lastAddAt: number | null = null;

/** Says no, with why, to a prompt that cannot go in now. Null when it can. `now` is a parameter so a test can choose. */
export function turnAway(text: string, now: number, last: number | null, waitMs: number, jarSays: (t: string) => string = wouldAdd): Refusal | null {
  if (jarSays(text) === 'full') return refusal('full');
  const left = paceLeft(now, last, waitMs);
  return left > 0 ? refusal('channel-wait', { reason: 'cooldown', retryInMs: left }) : null;
}

export function registerJarActions(): void {
  lastAddAt = null;
  registerAudienceAction<{ text: string }>({
    id: ADD_ACTION,
    label: 'Add a prompt to the jar',
    kind: 'jar',
    // Each prompt is only counted into a jar nobody but the streamer sees, so the gate's shared cooldown (and its limit of a
    // few actions a minute) would turn a busy chat away. The jar paces itself instead, with the pause from Preferences.
    cooldown: 0,
    bulk: true,
    parse: (raw): { text: string } | Refusal | null => {
      const p = cleanPrompt(raw);
      if (!p) return refusal('no-prompt');
      const no = turnAway(p.text, Date.now(), lastAddAt, paceMs(currentChoice('promptjar.pace')));
      if (no?.detail === 'full') noteFull();
      return no ?? p;
    },
    // A repeat is quietly ignored. A full jar is turned away in `parse`, with the reason.
    run: ({ text }) => {
      const r = addToJar(text);
      if (r === 'added') lastAddAt = Date.now();
      else if (r === 'full') throw new Error('The prompt jar is full.');
    },
  });
}
