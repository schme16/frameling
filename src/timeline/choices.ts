// Timeline behaviours people like differently. Asked the first time, then remembered (Preferences > Behaviour).
import { registerChoice } from '../core/choices';
import { choiceWord } from '../words/choices';

export type NewKeyChoice = 'blank' | 'copy';
export type HoldChoice = 'push' | 'cover';
export type FrameScopeChoice = 'all' | 'layer';
export type NewKeyHoldChoice = 'until-next' | 'one-frame';
export type TidyEndChoice = 'tidy' | 'keep';

registerChoice<NewKeyChoice>({
  id: 'timeline.newKey',
  title: choiceWord('choice.timeline.newKey.title'),
  question: choiceWord('choice.timeline.newKey.question'),
  options: [
    { value: 'blank', label: choiceWord('choice.timeline.newKey.blank.label'), did: choiceWord('choice.timeline.newKey.blank.did'), detail: choiceWord('choice.timeline.newKey.blank.detail') },
    { value: 'copy', label: choiceWord('choice.timeline.newKey.copy.label'), did: choiceWord('choice.timeline.newKey.copy.did'), detail: choiceWord('choice.timeline.newKey.copy.detail') },
  ],
  default: 'blank',
  category: 'Timeline',
  help: 'timeline-frames',
});

registerChoice<HoldChoice>({
  id: 'timeline.holdLonger',
  title: choiceWord('choice.timeline.holdLonger.title'),
  question: choiceWord('choice.timeline.holdLonger.question'),
  options: [
    { value: 'push', label: choiceWord('choice.timeline.holdLonger.push.label'), did: choiceWord('choice.timeline.holdLonger.push.did'), detail: choiceWord('choice.timeline.holdLonger.push.detail') },
    { value: 'cover', label: choiceWord('choice.timeline.holdLonger.cover.label'), did: choiceWord('choice.timeline.holdLonger.cover.did'), detail: choiceWord('choice.timeline.holdLonger.cover.detail') },
  ],
  default: 'push',
  category: 'Timeline',
  help: 'timeline-frames',
});

registerChoice<FrameScopeChoice>({
  id: 'timeline.frameScope',
  title: choiceWord('choice.timeline.frameScope.title'),
  question: choiceWord('choice.timeline.frameScope.question'),
  options: [
    { value: 'all', label: choiceWord('choice.timeline.frameScope.all.label'), did: choiceWord('choice.timeline.frameScope.all.did'), detail: choiceWord('choice.timeline.frameScope.all.detail') },
    { value: 'layer', label: choiceWord('choice.timeline.frameScope.layer.label'), did: choiceWord('choice.timeline.frameScope.layer.did'), detail: choiceWord('choice.timeline.frameScope.layer.detail') },
  ],
  default: 'all',
  category: 'Timeline',
  help: 'timeline-frames',
});

// A preference, not a question: holding until the next drawing is what nearly everyone expects.
registerChoice<NewKeyHoldChoice>({
  id: 'timeline.newKeyHold',
  title: choiceWord('choice.timeline.newKeyHold.title'),
  question: choiceWord('choice.timeline.newKeyHold.question'),
  options: [
    { value: 'until-next', label: choiceWord('choice.timeline.newKeyHold.until-next.label'), detail: choiceWord('choice.timeline.newKeyHold.until-next.detail') },
    { value: 'one-frame', label: choiceWord('choice.timeline.newKeyHold.one-frame.label'), detail: choiceWord('choice.timeline.newKeyHold.one-frame.detail') },
  ],
  default: 'until-next',
  category: 'Timeline',
  help: 'drawings-carry-on',
  silent: true,
});

/** "Hold longer" choice in the words the edit code uses. */
export const clashFor = (c: HoldChoice): 'push' | 'trim' => (c === 'cover' ? 'trim' : 'push');

// Asked the first time an edit leaves empty frames on the end. Taking them off is the default, so that is what
// happens where there is no way to ask; closing the question without picking still keeps the length, since closing a
// question should never throw frames away.
registerChoice<TidyEndChoice>({
  id: 'timeline.tidyEnd',
  title: choiceWord('choice.timeline.tidyEnd.title'),
  question: choiceWord('choice.timeline.tidyEnd.question'),
  options: [
    { value: 'tidy', label: choiceWord('choice.timeline.tidyEnd.tidy.label'), did: choiceWord('choice.timeline.tidyEnd.tidy.did'), detail: choiceWord('choice.timeline.tidyEnd.tidy.detail') },
    { value: 'keep', label: choiceWord('choice.timeline.tidyEnd.keep.label'), did: choiceWord('choice.timeline.tidyEnd.keep.did'), detail: choiceWord('choice.timeline.tidyEnd.keep.detail') },
  ],
  default: 'tidy',
  dismiss: 'keep',
  category: 'Timeline',
  help: 'timeline-tidy-end',
});

export type OnionClipsChoice = 'inside' | 'across';

// The onion skin shows the frames around the one you are on. At the end of a clip the next frame belongs to another
// animation, so by default it stops there. Told, with a Change button, the first time a clip's edge hides a ghost.
registerChoice<OnionClipsChoice>({
  id: 'timeline.onionClips',
  title: choiceWord('choice.timeline.onionClips.title'),
  question: choiceWord('choice.timeline.onionClips.question'),
  options: [
    { value: 'inside', label: choiceWord('choice.timeline.onionClips.inside.label'), did: choiceWord('choice.timeline.onionClips.inside.did'), detail: choiceWord('choice.timeline.onionClips.inside.detail') },
    { value: 'across', label: choiceWord('choice.timeline.onionClips.across.label'), did: choiceWord('choice.timeline.onionClips.across.did'), detail: choiceWord('choice.timeline.onionClips.across.detail') },
  ],
  default: 'inside',
  category: 'Timeline',
  help: 'timeline-onion',
});
