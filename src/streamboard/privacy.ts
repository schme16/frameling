// Is the Stream control board private? One answer decides it, the one Frameling already asks: "What can your viewers see?"
// (src/audience/spoilers.ts). The board is its own window, so the answer reads three ways:
//   capture  only the capture window is seen: every other window is private, the board too.
//   display  one screen is seen, the one Frameling is on: the board is private when it sits on a different screen.
//   screen   everything may be seen (or not sure, or never answered): the board is not private.
// Whoever puts the board on stream on purpose, as a panel, says so once with a switch on it (never a question), and then it
// is not private whatever the answer was. Pure, so the rules are tested without a screen (test/streamboard/privacy.test.ts).
import { VIEW_CHOICE } from '../audience/spoilers';
import { currentChoice } from '../core/choices';

export const ONSTREAM_CHOICE = 'streamboard.onstream';

/** What is known: the answer to the question, the switch, and whether the board is on a different screen from the drawing window. */
export interface PrivacyFacts {
  answer: string | undefined;
  onStream: boolean;
  /** True when the board is on a screen the drawing window is not on. Unknown counts as false. */
  apart: boolean;
}

/** Why the board is or is not private. The reason picks the words on the board. */
export type PrivacyWhy = 'capture' | 'apart' | 'onstream' | 'same-screen' | 'everything';

export interface Privacy {
  private: boolean;
  why: PrivacyWhy;
}

export function privacyOf(f: PrivacyFacts): Privacy {
  if (f.onStream) return { private: false, why: 'onstream' };
  if (f.answer === 'capture') return { private: true, why: 'capture' };
  if (f.answer === 'display') return f.apart ? { private: true, why: 'apart' } : { private: false, why: 'same-screen' };
  return { private: false, why: 'everything' };
}

/** Whether the board covers secrets and unread words: the opposite of private. */
export const boardCovers = (f: PrivacyFacts): boolean => !privacyOf(f).private;

/** What the board says about itself in one line, in the plain words the streamer reads. */
export function privacyLine(p: Privacy): string {
  switch (p.why) {
    case 'capture':
      return 'Private: your viewers only see the capture window, so everything shows plainly here.';
    case 'apart':
      return 'Private: this is on a screen your viewers do not see, so everything shows plainly here.';
    case 'onstream':
      return 'On stream: your viewers can see this board, so secrets and chat words stay covered.';
    case 'same-screen':
      return 'Covered: this board is on the same screen as your drawing, which your viewers see. Move it to your other screen.';
    default:
      return 'Covered: your viewers might see this board, so secrets and chat words stay covered until you press to read them.';
  }
}

/** The answer a person gave, read live. */
export const viewAnswer = (): string | undefined => currentChoice<string>(VIEW_CHOICE);
export const onStreamNow = (): boolean => currentChoice(ONSTREAM_CHOICE) === 'onstream';
