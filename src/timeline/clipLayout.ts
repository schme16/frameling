/**
 * How a clip chip is drawn in the clips lane. A chip is never wider than its frames, so neighbours never overlap
 * (clips that share frames are the one exception, and the picked one stays on top). Short ones give up their
 * name first, then their icon: the name is in the tooltip and the accessible label.
 */
import type { Clip } from '../core/format';

/** Room the name needs, with the way-it-plays icons. */
export const CHIP_FULL_W = 44;
/** Room one icon needs. Narrower than this is a plain coloured bar. */
export const CHIP_ICON_W = 22;

export type ChipMode = 'full' | 'icon' | 'bar';

export interface ChipBox {
  left: number;
  width: number;
  mode: ChipMode;
  /** Width of each resize edge. 0 on a bar: there is no room to grab an edge apart from the chip (zoom in to resize it). */
  edge: number;
}

export function chipMode(width: number): ChipMode {
  return width >= CHIP_FULL_W ? 'full' : width >= CHIP_ICON_W ? 'icon' : 'bar';
}

/** Where one clip's chip goes: exactly over its own frames, with a one pixel gap each side. */
export function chipBox(c: Pick<Clip, 'start' | 'end'>, cw: number): ChipBox {
  const width = Math.max(2, (c.end - c.start + 1) * cw - 2);
  const mode = chipMode(width);
  return { left: c.start * cw + 1, width, mode, edge: mode === 'full' ? 6 : mode === 'icon' ? 4 : 0 };
}
