// Registers the geometry area's commands, panels, tools and help topics: the paint bucket.
import '../tools/fill';

export { fillRegion, pathsOverlap, rasteriseBarrier, maskScale } from './fill';
export type { FillResult, FillRegionOptions, Rect } from './fill';
export { floodFillPixels, parseColor } from './pixel-fill';
