/**
 * "Pack artboards into one atlas": every frame of every chosen artboard on one picture, with a JSON atlas whose
 * animations are the artboards (and their clips, as "artboard/clip"). Pure: rendered frames in, picture and JSON out.
 */
import type { Clip } from '../core/format';
import type { RawImage } from '../io/png';
import { buildAtlas, buildCells, composeSheet, layoutCells, playing, layoutPacked, type Animation, type Cell } from '../export/sheet';

export interface ArtboardFrames {
  name: string;
  frames: RawImage[];
  clips: Clip[];
}

export interface PackOptions {
  fps: number;
  scale: number;
  /** Cut away see-through edges and pack frames tightly (missing = yes). */
  trim?: boolean;
  padding?: number;
  pot?: boolean;
  maxSide: number;
  /** The picture's file name, for the JSON. */
  image: string;
}

export function packArtboardAtlas(sets: ArtboardFrames[], o: PackOptions): { image: RawImage; json: ReturnType<typeof buildAtlas>; names: string[] } | { problem: string } {
  if (!sets.length) return { problem: 'Pick at least one artboard.' };
  const cells: Cell[] = [];
  const cellOfFrame: number[] = [];
  const names: string[] = [];
  const animations: Animation[] = [];
  const trim = o.trim !== false;
  for (const set of sets) {
    const first = cellOfFrame.length;
    const own = buildCells(set.frames, { trim, dedupe: true });
    const base = cells.length;
    own.cells.forEach((c, i) => {
      cells.push(c);
      names.push(own.cells.length > 1 ? `${set.name}/${i}` : set.name);
    });
    for (const k of own.cellOfFrame) cellOfFrame.push(base + k);
    const n = set.frames.length;
    animations.push({ name: set.name, fps: o.fps, loop: true, frames: Array.from({ length: n }, (_, i) => first + i) });
    for (const c of set.clips) {
      const a = Math.max(0, Math.min(c.start, c.end));
      const b = Math.min(n - 1, Math.max(c.start, c.end));
      if (a > b) continue;
      animations.push({ name: `${set.name}/${c.name}`, fps: o.fps, loop: c.loop, ...playing(Array.from({ length: b - a + 1 }, (_, i) => first + a + i), c) });
    }
  }
  const layout = trim ? layoutPacked(cells, { padding: o.padding ?? 1, pot: o.pot, maxSide: o.maxSide }) : layoutCells(cells, { padding: o.padding ?? 1, pot: o.pot });
  if (!layout || layout.width > o.maxSide || layout.height > o.maxSide) return { problem: `Everything together doesn't fit on one ${o.maxSide} pixel picture. Try a smaller size, or fewer artboards.` };
  const image = composeSheet(cells, layout);
  const json = buildAtlas({ image: o.image, layout, cells, cellOfFrame, animations, fps: o.fps, scale: o.scale, frameCount: cellOfFrame.length, names, style: 'hash' });
  return { image, json, names };
}
