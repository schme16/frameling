// The onion skin and clips. The choice ("Onion skin at the end of a clip") is the one source; the canvas reads it from
// `ui.onion.acrossClips` so it never has to ask. The first time a clip's edge actually hides a ghost, a toast says the
// ghosts stay inside the clip, with a Change button (the choices system's gentle ask).
import { currentChoice, onChoiceChange, rememberedChoice, withChoice } from '../core/choices';
import { onionTrimmed } from '../canvas/onion';
import { store, type State } from '../core/store';
import { inHarness } from '../pixel/harness';
import type { OnionClipsChoice } from './choices';

export const ONION_CLIPS = 'timeline.onionClips';

/** Puts the answer where the canvas reads it. */
export function syncOnionScope(): void {
  const across = currentChoice<OnionClipsChoice>(ONION_CLIPS) === 'across';
  if (!!store().get().ui.onion.acrossClips === across) return;
  store().setUi((ui) => ({ onion: { ...ui.onion, acrossClips: across || undefined } }));
}

/** Whether to say it now: the onion skin is on and still, and a clip's edge is hiding a ghost, and nobody has answered. */
export function shouldTellOnionScope(s: Pick<State, 'doc' | 'ui'>, told: boolean): boolean {
  if (told || rememberedChoice(ONION_CLIPS) !== undefined) return false;
  const { doc, ui } = s;
  return ui.onion.enabled && !ui.playing && !doc.editing?.length && onionTrimmed(doc, ui.frame, ui.onion);
}

/** Wires the choice to the canvas and tells the first time it matters. Returns what undoes it. */
export function installOnionScope(): () => void {
  syncOnionScope();
  let told = false;
  let last = -1;
  const off = store().subscribe(() => {
    const s = store().get();
    // Only on a move of the playhead: that is when a ghost goes missing under the pen.
    if (s.ui.frame === last) return;
    last = s.ui.frame;
    if (inHarness() || !shouldTellOnionScope(s, told)) return;
    told = true;
    withChoice<OnionClipsChoice>(ONION_CLIPS, () => syncOnionScope(), { gently: { undo: () => undefined } });
  });
  const offChoice = onChoiceChange((id) => id === ONION_CLIPS && syncOnionScope());
  return () => {
    off();
    offChoice();
  };
}
