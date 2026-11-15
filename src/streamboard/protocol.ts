// What the board and the drawing window say to each other over the message port. Plain data only.
import type { BoardView } from './model';
import type { Layout } from './layout';

/** From the drawing window to the board. */
export type ToBoard =
  | { t: 'view'; view: BoardView }
  /** One plain sentence for the strip at the bottom: why a button did nothing, or what a press did. */
  | { t: 'said'; text: string; ok: boolean };

/** From the board to the drawing window. */
export type FromBoard =
  | { t: 'hello' }
  | { t: 'press'; tile: string }
  | { t: 'stop' }
  | { t: 'layout'; layout: Layout }
  | { t: 'reset' }
  /** Read the covered prompt, or cover it again. */
  | { t: 'prompt'; do: 'read' | 'cover'; id: number }
  /** Waiting prompts: read one, read them all, cover them again, or choose one to pull into your hand. */
  | { t: 'slip'; do: 'read' | 'pull'; id: number }
  | { t: 'slips'; do: 'read' | 'cover' }
  /** The guesses: read them (when covered) or cover them again. */
  | { t: 'guesses'; do: 'read' | 'cover' }
  /** Start a vote or a round from what was written on the board. The drawing window cleans it again and says why not. */
  | { t: 'vote'; question: string; options: string[]; seconds: number }
  | { t: 'round'; word: string; seconds: number }
  /** Put the board on stream, or keep it private (the switch on the board). */
  | { t: 'onstream'; on: boolean }
  /** Open the "What can your viewers see?" question again. */
  | { t: 'viewers' };
