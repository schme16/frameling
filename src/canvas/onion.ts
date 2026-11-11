// Which frames the onion skin shows around the current one. Pure, so the canvas and tests agree.
import type { Doc } from '../core/format';
import type { OnionSettings } from '../core/store';

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
