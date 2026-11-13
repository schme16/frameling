/**
 * The ways of picking, one tool each.
 *
 * It used to be one Select button with the way hidden inside it as a setting, so the toolbar showed a single icon
 * that changed shape depending on what you last chose, and nobody could tell there were four. Now each way is its
 * own tool, the way the shapes are, and **the tool you picked is the way it picks**: there is no mode to keep in
 * step with the toolbar, because the toolbar is the mode.
 *
 * Vector layers have no magic wand (there are no pixels to match), so that one is pixel only.
 */
export type SelectMode = 'box' | 'lasso' | 'polygon' | 'wand';

export interface SelectWay {
  mode: SelectMode;
  /** The tool id on a vector layer, or null when the way has no meaning there. */
  vector: string | null;
  /** The tool id on a pixel layer. */
  pixel: string;
  label: string;
  icon: string;
  key: string;
  /** Where it sits in the Select group of the rail. */
  at: number;
  blurb: string;
}

export const WAYS: SelectWay[] = [
  { mode: 'box', vector: 'select', pixel: 'pixel-select', label: 'Select', icon: 'select', key: 'v', at: 0, blurb: 'Drag a box round what you want (a marquee).' },
  { mode: 'lasso', vector: 'select-lasso', pixel: 'pixel-select-lasso', label: 'Lasso', icon: 'lasso', key: 'Shift+L', at: 1, blurb: 'Draw round what you want, freehand.' },
  { mode: 'polygon', vector: 'select-polygon', pixel: 'pixel-select-polygon', label: 'Polygon select', icon: 'polygon', key: 'Shift+G', at: 2, blurb: 'Click each corner, then the first one again to close it.' },
  { mode: 'wand', vector: null, pixel: 'pixel-select-wand', label: 'Magic wand', icon: 'wand', key: 'w', at: 3, blurb: 'Click a colour to pick every pixel of it.' },
];

const BY_TOOL = new Map<string, SelectWay>();
for (const w of WAYS) {
  if (w.vector) BY_TOOL.set(w.vector, w);
  BY_TOOL.set(w.pixel, w);
}

/** Every tool id that is a way of selecting. */
export const SELECT_TOOL_IDS = [...BY_TOOL.keys()];

/** Whether this tool is one of the ways of selecting. */
export const isSelectTool = (id: string): boolean => BY_TOOL.has(id);

/** Whether this tool is a way of selecting on a pixel layer. */
export const isPixelSelectTool = (id: string): boolean => WAYS.some((w) => w.pixel === id);

/** The way a tool picks. Anything else falls back to the box, which is what Select has always meant. */
export const modeOfTool = (id: string): SelectMode => BY_TOOL.get(id)?.mode ?? 'box';

/** The tool for a way, on the kind of layer you are on. Null when the way has no meaning there. */
export function toolFor(mode: SelectMode, pixel: boolean): string | null {
  const w = WAYS.find((x) => x.mode === mode);
  if (!w) return null;
  return pixel ? w.pixel : w.vector;
}

/** The same way on the other kind of layer, so switching layers keeps the way you were using. */
export function sameWayOn(toolId: string, pixel: boolean): string | null {
  const w = BY_TOOL.get(toolId);
  return w ? (pixel ? w.pixel : w.vector) : null;
}
