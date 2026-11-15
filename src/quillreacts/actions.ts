// What the audience may make Quill do, registered on the audience gate like every other audience action. All of them
// only move him or put words on the screen, so none says `touchesDrawing`, and none gets a way to reach the document.
//
// One hedgehog, one reaction at a time: the five ordinary ones share the kind `quill`, so after any of them the next
// waits its cooldown (the streamer's strictness scales it), on top of the gate's gap and per-minute limits. A new
// reaction also takes the place of the one still on screen, so there is never a pile of him.
import { currentChoice } from '../core/choices';
import { registerAudienceAction } from '../audience';
import { react, signFlow, type Reaction } from './react';
import { cleanSign } from './sign';

/** The action ids, so the door, the tests and the help all spell them the same way. */
export const REACTION_ACTIONS: { id: string; label: string; which: Reaction; cooldown: number }[] = [
  { id: 'quill.cheer', label: 'Quill cheers', which: 'cheer', cooldown: 6000 },
  { id: 'quill.hop', label: 'Quill hops', which: 'hop', cooldown: 6000 },
  { id: 'quill.snack', label: 'Give Quill a snack', which: 'snack', cooldown: 10_000 },
  { id: 'quill.nuzzle', label: 'Give Quill a cuddle', which: 'nuzzle', cooldown: 10_000 },
  { id: 'quill.wave', label: 'Quill waves hello', which: 'wave', cooldown: 6000 },
];

export const SIGN_ACTION = 'quill.sign';
/** Signs are slow on purpose: each one waits for a yes, and they are the only action that carries chat's words. */
export const SIGN_COOLDOWN = 30_000;

/** The sign's parse: the streamer's choice first (never means never), then the cleaning. */
export function parseSign(raw: unknown): { text: string } | null {
  if (currentChoice('quillreacts.signs') === 'off') return null;
  return cleanSign(raw);
}

export function registerReactionActions(): void {
  for (const a of REACTION_ACTIONS) {
    registerAudienceAction({ id: a.id, label: a.label, kind: 'quill', cooldown: a.cooldown, run: () => void react(a.which) });
  }
  registerAudienceAction<{ text: string }>({
    id: SIGN_ACTION,
    label: 'Quill holds up a sign',
    kind: 'quill-sign',
    cooldown: SIGN_COOLDOWN,
    parse: parseSign,
    // Waits for the streamer's yes, so it counts as running until that is answered, and kill ends it.
    run: ({ text }, ctx) => signFlow(text, ctx.signal).then(() => undefined),
  });
}
