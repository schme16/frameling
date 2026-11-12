// Export starts the way the sprite is built: frames on boards go out as one sprite, sprites on a sheet are packed
// together. Decided once for each document, so a choice made in the dialog sticks.
import type { Doc, Id } from '../core/format';
import { currentArtboardExport, setArtboardExport, type ArtboardExportMode } from '../artboards/export';
import { hasArtboards } from '../artboards/model';
import { isPixelDoc, wayOf } from './way';

const done = new Set<Id>();

/** The export mode a way starts on (null = leave it), for a sprite with several boards. */
export function modeForWay(doc: Doc): ArtboardExportMode | null {
  if (!isPixelDoc(doc) || !hasArtboards(doc)) return null;
  const way = wayOf(doc);
  return way === 'boards' ? 'joined' : way === 'sheet' ? 'atlas' : null;
}

/** Sets the artboard export row to fit the way, the first time Export opens on this document. */
export function followWay(doc: Doc): void {
  if (done.has(doc.id)) return;
  done.add(doc.id);
  const mode = modeForWay(doc);
  if (mode) setArtboardExport({ mode, ids: null });
}

const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;

/**
 * The footer line for a pixel sprite sheet, in the words of the sheet: how many frames, on how many sprites, and how
 * big each frame is. `plan` is what the dialog plans for the open board (or the joined film), `ab` the artboard plan.
 */
export function sheetFooter(doc: Doc, mode: ArtboardExportMode, ab: { frames: number; size: { width: number; height: number } | null } | null, plan: { count: number; width: number; height: number }): string {
  const sprites = currentArtboardExport(doc).ids?.length ?? doc.artboards?.length ?? 1;
  if (mode === 'atlas' && ab) return `${n(ab.frames, 'frame')} on ${n(sprites, 'sprite')}, one sheet`;
  if (mode === 'joined' && ab?.size) return `${n(ab.frames, 'frame')}, one sprite, ${ab.size.width} × ${ab.size.height} px each`;
  return `${n(plan.count, 'frame')}, one sprite, ${plan.width} × ${plan.height} px each`;
}
