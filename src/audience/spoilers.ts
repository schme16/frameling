// What to cover on screen, and when. One answer decides it for every streaming screen: "What can your viewers see?"
// Capture the popout capture window alone and the main window is private; capture the screen or the whole app and
// nothing is. Frameling cannot tell which, so it asks once (the choice below) and every screen follows the answer.
// A third answer, one screen, keeps the drawing window covered (it is on that screen) and leaves a second screen to Stream
// control: see src/streamboard/privacy.ts.
// Unanswered counts as "screen", so nothing is out in the open before the question has been put.
//
// This is a different axis from Stream-safe (paths, names and keys). It is about two things a streamer must not have
// on screen by surprise: a secret (the guessing word, a pulled prompt) and words a viewer typed that nobody has read.
import { currentChoice, useChoice } from '../core/choices';

export const VIEW_CHOICE = 'audience.view';

export type ViewersSee = 'screen' | 'display' | 'capture';

/** Cover unless the streamer said their viewers see only the capture window. A pure function of the answer. */
export const coversFor = (answer: string | undefined): boolean => answer !== 'capture';

/** Whether secrets and unread words are covered right now. */
export const covering = (): boolean => coversFor(currentChoice(VIEW_CHOICE));

/** React: the same, re-rendering when the answer changes. */
export const useCovering = (): boolean => coversFor(useChoice(VIEW_CHOICE));

/** How long a typed secret word stays readable after you press the eye, in ms. It goes back to dots by itself. */
export const REVEAL_MS = 6000;

/** What a covered word shows instead: always the same dots, so even how long it is stays private. */
export const COVER_DOTS = '••••••';

/** The one line at the top of the guessing dialog. It says what is true: the word is dots only while somebody might see. */
export function setupIntro(covered: boolean): string {
  return covered
    ? 'Pick a secret word and draw it. Chat guesses, Frameling checks. While you type, the word shows as dots in case your viewers can see this window. Press the eye to check it.'
    : 'Pick a secret word and draw it. Chat guesses, Frameling checks. Your viewers only see the capture window, so the word shows plainly here and stays hidden from them until the reveal.';
}

/** The line under the prompt jar's title. */
export function jarIntro(covered: boolean): string {
  return covered
    ? 'Your audience drops ideas in here. A prompt you pull stays covered until you press to read it.'
    : 'Your audience drops ideas in here. They only show in this window, which your viewers do not see.';
}

/** The small print on a covered prompt. */
export const JAR_COVER_NOTE = 'Covered in case your viewers can see this window. Reading it puts it on screen.';

/** What a toast says in place of words from chat that nobody has read yet. */
export const UNREAD_TOAST = {
  words: 'Chat sent some words for your screen. Read them first.',
  sign: 'Chat sent Quill a sign to hold up. Read it first.',
  message: 'A message came in from your stream tool. Read it first.',
  name: 'Somebody new is here, and Quill would like to say their name. Read it first.',
} as const;

/** The label on the button that reveals them. */
export const READ_IT = 'Read it';

/**
 * Whether a toast holds its words back: it has words to hold, they are being covered, and they have not been read.
 * Pure, so the rule is tested without a screen.
 */
export const holdsBack = (covered: string | undefined, covers: boolean, read: boolean): boolean => !!covered && covers && !read;

/** How long a covered toast waits to be read before it goes, in ms. */
export const UNREAD_WAIT_MS = 30_000;
