// Which frames (and boards) the onion skin shows around the current one. Pure, so the canvas and tests agree.
import type { Doc, Id } from '../core/format';
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

/** Frames where a layer that takes part in the onion skin starts a new drawing (its keys), sorted. */
export function onionKeys(doc: Doc): number[] {
  const set = new Set<number>();
  for (const layer of doc.layers) {
    if (!layer.visible || layer.onion === false || layer.kind === 'camera' || layer.kind === 'tilemap') continue;
    for (const c of layer.cels) if (c.start < doc.length) set.add(c.start);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * The frames to ghost, furthest first so the nearest ends up on top. Normally the next few frames each way. With
 * `keysOnly`, held frames are skipped: each step is the next key (where a drawing starts), so a drawing held on twos
 * or threes shows once instead of repeating.
 */
export function onionFrames(doc: Doc, frame: number, onion: Pick<OnionSettings, 'before' | 'after' | 'keysOnly'>): OnionFrame[] {
  const out: OnionFrame[] = [];
  if (onion.keysOnly) {
    const keys = onionKeys(doc);
    // The key the current frame belongs to: ghosts start from the one before it.
    let cur = -1;
    for (const k of keys) if (k <= frame) cur = k;
    const before = keys.filter((k) => k < cur).reverse();
    const after = keys.filter((k) => k > frame);
    for (let i = 0; i < Math.min(onion.before, before.length); i++) out.push({ frame: before[i], side: 'before', dist: i + 1 });
    for (let i = 0; i < Math.min(onion.after, after.length); i++) out.push({ frame: after[i], side: 'after', dist: i + 1 });
  } else {
    for (let k = 1; k <= onion.before; k++) if (frame - k >= 0) out.push({ frame: frame - k, side: 'before', dist: k });
    for (let k = 1; k <= onion.after; k++) if (frame + k < doc.length) out.push({ frame: frame + k, side: 'after', dist: k });
  }
  return out.sort((a, b) => b.dist - a.dist);
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
