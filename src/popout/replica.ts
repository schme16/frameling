// The second window's side: holds a copy of the drawing, built from what the drawing window sends, and says what to show.
// A patch that does not follow on from the last message (one was missed, or a different drawing came in between) is
// refused and the sender is asked for the whole drawing again.
import { applyPatches, enablePatches } from 'immer';
import type { Doc, Shape } from '../core/format';
import type { Look, LiveDrawing, PixelPatch, ToPopout } from './protocol';

enablePatches();

/** How many pixel pieces may wait for the painter before the second window gives up on them and asks again. */
export const MAX_QUEUED = 240;

export class Replica {
  doc: Doc | null = null;
  look: Look | null = null;
  ink: Shape | readonly Shape[] | null = null;
  /** Pixel pieces waiting for the painter to put on its canvas, in order (null ends the pixels in progress). */
  pixelQueue: (PixelPatch | null)[] = [];
  live: LiveDrawing | null = null;
  /** Counts up on every message that could change the picture, so the painter knows when to draw again. */
  version = 0;
  private seq = -1;

  /** True when the sender should send the whole drawing again. */
  apply(m: ToPopout): boolean {
    switch (m.t) {
      case 'doc':
        this.doc = m.doc;
        this.seq = m.seq;
        this.ink = null;
        this.live = null;
        this.pixelQueue = [null];
        break;
      case 'patch': {
        if (!this.doc || m.seq !== this.seq + 1) return true;
        try {
          this.doc = applyPatches(this.doc, m.patches);
        } catch {
          this.doc = null;
          return true;
        }
        this.seq = m.seq;
        break;
      }
      case 'look':
        this.look = m.look;
        break;
      case 'ink':
        this.ink = m.ink;
        break;
      case 'live':
        this.live = m.live;
        break;
      case 'pixels':
        // A new start makes what came before pointless; the queue never grows past one start and what follows it.
        if (m.patch?.start || !m.patch) this.pixelQueue = [];
        this.pixelQueue.push(m.patch);
        // The painter is not keeping up (a hidden window): drop the pile and ask for a fresh start.
        if (this.pixelQueue.length > MAX_QUEUED) {
          this.pixelQueue = [null];
          return true;
        }
        break;
    }
    this.version++;
    return false;
  }

  /** Nothing to show yet. */
  get empty(): boolean {
    return !this.doc || !this.look;
  }
}
