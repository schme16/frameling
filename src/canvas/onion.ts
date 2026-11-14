// Which frames (and boards) the onion skin shows around the current one. Pure, so the canvas and tests agree.
import type { Doc, Id } from '../core/format';
import { clipAtFrame, clipSpan, type Span } from '../core/clipScope';
import type { OnionSettings } from '../core/store';
import { rootDoc, type Mat } from '../core/symbols';
import { activeId, artboardsOf, contentOf, findArtboard, hasArtboards, sizeOf } from '../artboards/model';
import { fitPlacement } from '../artboards/fit';

/** One onion frame: the frame, which side it's on, and how far away it is (1 = the nearest). */
export interface OnionFrame {
  frame: number;
  side: 'before' | 'after';
  dist: number;
}

/** What the onion skin reads of the settings. */
type OnionLook = Pick<OnionSettings, 'before' | 'after' | 'keysOnly' | 'acrossClips'>;

/**
 * The frames the onion skin may walk over: the clip the current frame is in. A pose is drawn against its own clip's
 * neighbours, not a limb from the next animation. Nothing limits it (null) when the choice is to cross clips, when the
 * frame is in no clip, or when the file has none.
 */
export function onionSpan(doc: Pick<Doc, 'clips'>, frame: number, across?: boolean): Span | null {
  if (across) return null;
  const c = clipAtFrame(doc, frame);
  return c ? clipSpan(c) : null;
}

/** Frames where a layer that takes part in the onion skin starts a new drawing (its keys), sorted. */
export function onionKeys(doc: Doc, span?: Span | null): number[] {
  const set = new Set<number>();
  for (const layer of doc.layers) {
    if (!layer.visible || layer.onion === false || layer.kind === 'camera' || layer.kind === 'tilemap') continue;
    for (const c of layer.cels) if (c.start < doc.length && (!span || (c.start >= span.start && c.start <= span.end))) set.add(c.start);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * The frames to ghost, furthest first so the nearest ends up on top. Normally the next few frames each way. With
 * `keysOnly`, held frames are skipped: each step is the next key (where a drawing starts), so a drawing held on twos
 * or threes shows once instead of repeating. Both stay inside the clip the frame is in (see `onionSpan`) unless
 * `acrossClips` is set.
 */
export function onionFrames(doc: Doc, frame: number, onion: OnionLook): OnionFrame[] {
  const out: OnionFrame[] = [];
  const span = onionSpan(doc, frame, onion.acrossClips);
  const lo = span ? span.start : 0;
  const hi = span ? Math.min(span.end, doc.length - 1) : doc.length - 1;
  if (onion.keysOnly) {
    const keys = onionKeys(doc, span);
    // The key the current frame belongs to: ghosts start from the one before it.
    let cur = -1;
    for (const k of keys) if (k <= frame) cur = k;
    const before = keys.filter((k) => k < cur).reverse();
    const after = keys.filter((k) => k > frame);
    for (let i = 0; i < Math.min(onion.before, before.length); i++) out.push({ frame: before[i], side: 'before', dist: i + 1 });
    for (let i = 0; i < Math.min(onion.after, after.length); i++) out.push({ frame: after[i], side: 'after', dist: i + 1 });
  } else {
    for (let k = 1; k <= onion.before; k++) if (frame - k >= lo) out.push({ frame: frame - k, side: 'before', dist: k });
    for (let k = 1; k <= onion.after; k++) if (frame + k <= hi) out.push({ frame: frame + k, side: 'after', dist: k });
  }
  return out.sort((a, b) => b.dist - a.dist);
}

/**
 * The ruler's shading for the ghosts: one run of frames each side (every ghost, in keys only), as the canvas shows them,
 * so the ruler never shades a frame that gives no ghost.
 */
export function onionShading(doc: Doc, frame: number, onion: OnionLook): { side: 'before' | 'after'; from: number; to: number }[] {
  const frames = onionFrames(doc, frame, onion);
  if (onion.keysOnly) return frames.map((o) => ({ side: o.side, from: o.frame, to: o.frame }));
  const out: { side: 'before' | 'after'; from: number; to: number }[] = [];
  for (const side of ['before', 'after'] as const) {
    const of = frames.filter((o) => o.side === side).map((o) => o.frame);
    if (of.length) out.push({ side, from: Math.min(...of), to: Math.max(...of) });
  }
  return out;
}

/** Whether a clip's edge is hiding ghosts right now: there would be more of them if the onion skin crossed clips. */
export function onionTrimmed(doc: Doc, frame: number, onion: OnionLook): boolean {
  if (onion.acrossClips) return false;
  return onionFrames(doc, frame, { ...onion, acrossClips: true }).length > onionFrames(doc, frame, onion).length;
}

/** One onion board: the artboard, which side it's on, how far away, the frame of it to show, and how it's fitted. */
export interface OnionBoard {
  id: Id;
  side: 'before' | 'after';
  dist: number;
  /** Which frame of that board to show: its last one for a board before, its first for one after. */
  frame: number;
  /** Stage-space matrix that fits that board's picture into this one (identity when the sizes match). */
  fit: Mat;
}

/**
 * The boards to ghost around the open one, furthest first. Boards count like frames: `before` boards back and `after`
 * boards on, in the order they're listed. A board before shows its last frame (what you cut from) and a board after
 * its first (what you cut to), which is the same drawing either way on a one-drawing board. Variations are skipped:
 * they're another take on a board, not the next one, and a variation stands in for the board it came from.
 */
export function onionBoards(doc: Doc, onion: Pick<OnionSettings, 'before' | 'after' | 'boards'>): OnionBoard[] {
  if (!onion.boards || doc.editing?.length) return [];
  const root = rootDoc(doc);
  if (!hasArtboards(root)) return [];
  const list = artboardsOf(root).filter((a) => !a.variationOf);
  const open = findArtboard(root, activeId(root));
  const anchor = open?.variationOf ?? open?.id;
  const cur = list.findIndex((a) => a.id === anchor);
  if (cur < 0) return [];
  const out: OnionBoard[] = [];
  const add = (a: (typeof list)[number] | undefined, side: 'before' | 'after', dist: number): void => {
    if (!a) return;
    const content = contentOf(root, a.id);
    if (!content) return;
    const { w, h } = sizeOf(root, a);
    const p = fitPlacement(w, h, root.width, root.height, 'bars');
    out.push({ id: a.id, side, dist, frame: side === 'before' ? Math.max(0, content.length - 1) : 0, fit: [p.k, 0, 0, p.k, p.x, p.y] });
  };
  for (let k = 1; k <= onion.before; k++) add(list[cur - k], 'before', k);
  for (let k = 1; k <= onion.after; k++) add(list[cur + k], 'after', k);
  return out.sort((a, b) => b.dist - a.dist);
}
