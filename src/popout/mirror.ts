// The drawing window's side: watches the store and tells the second window what changed. A whole drawing goes first, then
// only patches (a stroke is a few hundred bytes), and the look (playhead, playing, camera) as a tiny message of its own.
// If anything about the change is not a clean step from what was last sent, the whole drawing is sent again, so the second
// window can never drift. Nothing here touches the DOM or Electron, so it is tested on its own.
import type { Doc } from '../core/format';
import type { InkShapes } from './ink';
import type { DocChange, State } from '../core/store';
import { sameCapture } from './capture';
import type { Look, LiveDrawing, PixelPatch, ToPopout } from './protocol';

export interface MirrorSource {
  get(): State;
  lastChange(): DocChange | null;
}

export const sameLook = (a: Look | null, b: Look): boolean =>
  !!a && a.name === b.name && a.frame === b.frame && a.playing === b.playing && a.activeLayerId === b.activeLayerId && a.camera === b.camera && a.marks === b.marks && a.theme === b.theme && sameCapture(a.capture, b.capture);

export class Mirror {
  private sent: Doc | null = null;
  private seq = 0;
  private look: Look | null = null;
  private ink: InkShapes = null;
  private live: LiveDrawing | null = null;
  /** How many whole drawings and how many patch messages went out (for tests and the perf numbers). */
  sentDocs = 0;
  sentPatches = 0;

  constructor(
    private src: MirrorSource,
    private out: (m: ToPopout) => void,
    private lookOf: (s: State) => Look,
  ) {}

  /** The other side is ready, or says it lost its place: everything again. */
  hello(): void {
    this.sent = null;
    this.look = null;
    this.sync();
    this.out({ t: 'ink', ink: this.ink });
    this.out({ t: 'live', live: this.live });
  }

  /** Call after every store change. Cheap when nothing it cares about moved. */
  sync(): void {
    const s = this.src.get();
    if (s.doc !== this.sent) {
      const c = this.src.lastChange();
      if (this.sent && c && c.from === this.sent && c.to === s.doc) {
        this.out({ t: 'patch', seq: ++this.seq, patches: c.patches });
        this.sentPatches++;
      } else {
        this.out({ t: 'doc', seq: ++this.seq, doc: s.doc });
        this.sentDocs++;
      }
      this.sent = s.doc;
    }
    const look = this.lookOf(s);
    if (!sameLook(this.look, look)) {
      this.look = look;
      this.out({ t: 'look', look });
    }
  }

  /** The stroke in progress (or null). */
  setInk(ink: InkShapes): void {
    if (ink === this.ink) return;
    this.ink = ink;
    this.out({ t: 'ink', ink });
  }

  /** A piece of the pixels being painted (or null when that ends). A patch is new every time, so it always goes. */
  setPixels(patch: PixelPatch | null): void {
    this.out({ t: 'pixels', patch });
  }

  /** A layer's half-done change (or null). */
  setLive(live: LiveDrawing | null): void {
    if (live === this.live) return;
    this.live = live;
    this.out({ t: 'live', live });
  }
}
