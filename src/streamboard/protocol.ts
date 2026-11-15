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
  | { t: 'prompt'; do: 'read' | 'cover'; id: number };
