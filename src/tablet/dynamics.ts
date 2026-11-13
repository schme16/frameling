// What a pen's pressure and tilt do to a mark, per tool, as the person chose in Pen and tablet and in the tool's options.
// Every drawing tool asks here, so they all agree.
import type { BrushSettings } from '../core/format';
import type { ToolPointer } from '../core/registry';
import { leanOf } from './tilt';
import { getPen, type PenTool, type ToolPen } from './settings';

/** The smallest a mark gets at the lightest touch, as a share of its set size. */
export const LIGHTEST_SIZE = 0.15;
/** The faintest a line gets at the lightest touch. */
export const LIGHTEST_OPACITY = 0.15;
/** The most leaning can do: a mark at twice the size you set. A vector stroke cannot carry more than that. */
export const MAX_TILT_SIZE = 2;
/** How quickly leaning gets there, with the tilt amount at 100. */
export const MAX_TILT_GROWTH = 2;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const toolPen = (id: PenTool): ToolPen => getPen().tools[id];

/** How big a mark is for the press, 0.15 to 1 of the set size. 1 when pressure is off or the device has none. */
export function pressureSize(id: PenTool, e: ToolPointer): number {
  return toolPen(id).size && e.hasPressure ? LIGHTEST_SIZE + (1 - LIGHTEST_SIZE) * clamp01(e.pressure) : 1;
}

/** How much bigger leaning makes a mark: 1 upright, up to double when it lies over. 1 when tilt is off or the device has none. */
export function tiltSize(id: PenTool, e: Pick<ToolPointer, 'tiltX' | 'tiltY'>): number {
  if (!toolPen(id).tilt || e.tiltX === undefined || e.tiltY === undefined) return 1;
  return Math.min(MAX_TILT_SIZE, 1 + leanOf(e.tiltX, e.tiltY) * (getPen().pen.tiltAmount / 100) * MAX_TILT_GROWTH);
}

/** Both together: the multiplier for a tool's size. */
export function sizeFactor(id: PenTool, e: ToolPointer): number {
  return pressureSize(id, e) * tiltSize(id, e);
}

/** How solid a line is for the press, 0.15 to 1. 1 when pressure-opacity is off or the device has none. */
export function opacityFactor(id: PenTool, e: ToolPointer): number {
  return toolPen(id).opacity && e.hasPressure ? LIGHTEST_OPACITY + (1 - LIGHTEST_OPACITY) * clamp01(e.pressure) : 1;
}

/** How much paint goes down, 0.25 to 1.75 times the usual. 1 when pressure-flow is off or the device has none. */
export function flowFactor(id: PenTool, e: ToolPointer): number {
  return toolPen(id).flow && e.hasPressure ? 0.25 + 1.5 * clamp01(e.pressure) : 1;
}

export interface VectorDynamics {
  /** The brush to draw with: pressure or tilt can need a livelier thinning than the one set. */
  brush: BrushSettings;
  /** The point's pressure value for the line's width (0.5 is the middle). */
  width(e: ToolPointer): number;
  /** The share of full strength for this sample, when opacity follows pressure; otherwise undefined. */
  opacity?(e: ToolPointer): number;
}

/** How a vector brush or pencil stroke turns pen samples into widths and opacity. */
export function vectorDynamics(id: 'brush' | 'pencil', brush: BrushSettings, first?: ToolPointer): VectorDynamics {
  const tp = { ...toolPen(id) };
  // Leaning only matters for a pen that reports it: a mouse stroke stays as it was.
  if (first && first.tiltX === undefined) tp.tilt = false;
  // The brush's own "pressure changes thickness" switch decides its width; the pencil's is in Pen and tablet.
  const byPressure = id === 'brush' ? brush.thinning !== 0 : tp.size;
  // The pencil's own thinning is gentle, so pressure gets a livelier one when its switch is on.
  const thinning = id === 'pencil' && tp.size && brush.thinning < 0.5 ? 0.6 : brush.thinning;
  if (tp.tilt) {
    // Leaning has to change how big the mark is, the way it does on a pixel layer. A stroke carries one brush and a
    // 0 to 1 value per point, and at full thinning that value *is* the width: 0.5 draws the size you set, 1 draws
    // double. So the size multiplier goes straight in, and pressure still does what it did, on top of it.
    const press = (e: ToolPointer) => (byPressure && e.hasPressure ? (0.5 - thinning * (0.5 - clamp01(e.pressure))) / 0.5 : 1);
    return {
      brush: { ...brush, thinning: 1 },
      width: (e) => clamp01(0.5 * press(e) * tiltSize(id, e)),
      opacity: tp.opacity ? (e) => opacityFactor(id, e) : undefined,
    };
  }
  return {
    brush: thinning === brush.thinning ? brush : { ...brush, thinning },
    width: (e) => clamp01(byPressure && e.hasPressure ? e.pressure : 0.5),
    opacity: tp.opacity ? (e) => opacityFactor(id, e) : undefined,
  };
}
