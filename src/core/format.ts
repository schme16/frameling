/**
 * The Frameling document format, version 1.
 *
 * This file is the contract every part of the app builds on (canvas, tools, timeline, export, files), and it will
 * become the shared format package Interactives reads. Keep it free of DOM and Electron imports: plain data only.
 *
 * Units: positions are document pixels (the stage is `width` x `height`, origin top-left). Time is whole frames at
 * `fps`; frame 0 is the first frame.
 */

export const FORMAT_VERSION = 1;
export type Id = string;

/** A colour as CSS hex (`#rrggbb` or `#rrggbbaa`). */
export type Color = string;

export interface Doc {
  format: 'frameling';
  version: number;
  id: Id;
  name: string;
  /** Stage size in document pixels. */
  width: number;
  height: number;
  /** Frames per second. */
  fps: number;
  /** Total length in frames (at least 1). Playback and export run from 0 to length - 1 unless a clip says otherwise. */
  length: number;
  /** Stage colour, or null for transparent. */
  background: Color | null;
  /** Layers, bottom first: index 0 is drawn first (furthest back). */
  layers: Layer[];
  /** Every drawing, by id. Cels point at them, and several cels can share one drawing. */
  drawings: Record<Id, Drawing>;
  /** Named frame ranges (idle, run, jump). Sprite sheets, Godot and Interactives use these as animations. */
  clips: Clip[];
  /** Named moments (footstep, hit). Become events in game engines and Interactives. */
  markers: Marker[];
  /** The document's colour swatches. */
  swatches: Swatch[];
  /** The pixel art palette: an ordered list of colours in ramps (optional; missing = the starter palette). */
  palette?: DocPalette;
  /** Reusable drawings with their own timelines, by id (missing = none). See `SymbolDef`. */
  symbols?: Record<Id, SymbolDef>;
  /**
   * Set while a symbol is open for editing in place: the stack of symbols entered, innermost last. While it's set,
   * `layers` and `length` are the open symbol's, and each entry keeps what it replaced. Never saved (see rootDoc).
   */
  editing?: EditFrame[];
}

export type LayerKind = 'vector' | 'pixel';

export interface BaseLayer {
  id: Id;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0 to 1. */
  opacity: number;
  /** Show this layer's frames around the current one in the onion skin (missing = yes). */
  onion?: boolean;
  /**
   * Cels on this layer, sorted by `start`, never overlapping. A frame with no cel covering it is empty.
   */
  cels: Cel[];
}

export interface VectorLayer extends BaseLayer {
  kind: 'vector';
  /**
   * How new shapes meet old ones (missing = 'object'). 'object': each shape stays separate. 'merge': ungrouped shapes
   * cut and join each other, so the layer behaves like one flat painting.
   */
  drawMode?: 'object' | 'merge';
}

export interface PixelLayer extends BaseLayer {
  kind: 'pixel';
  /** Document pixels per art pixel (a whole number, 1 or more). A 256x256 stage with pixelSize 8 is a 32x32 grid. */
  pixelSize: number;
  /** Palette lock: everything painted on this layer snaps to the nearest palette colour (missing = off). */
  paletteLock?: boolean;
}

export type Layer = VectorLayer | PixelLayer;

/**
 * One drawing held on a layer for `length` frames (its exposure: 1 = "on ones", 2 = "on twos").
 */
export interface Cel {
  id: Id;
  start: number;
  length: number;
  drawingId: Id;
  /** In-betweens from this key to the next one on the layer, when the next one starts right where this ends. */
  tween?: Tween;
}

export type Drawing = VectorDrawing | PixelDrawing;

export interface VectorDrawing {
  id: Id;
  kind: 'vector';
  /** Painted in order: index 0 is at the back. */
  shapes: Shape[];
}

/**
 * A pixel drawing: an RGBA grid the size of the layer's art grid (`ceil(doc.width / pixelSize)` by
 * `ceil(doc.height / pixelSize)`). In memory `pixels` is the raw RGBA bytes. In a saved file it is stored as a PNG.
 * Edits replace the array (never mutate it in place), so undo and caches can compare by reference.
 */
export interface PixelDrawing {
  id: Id;
  kind: 'pixel';
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export type Shape = StrokeShape | FillShape | PathShape | InstanceShape;

/** A point of a hand-drawn stroke: position, pen pressure (0 to 1, 0.5 when the device has none). */
export interface StrokePoint {
  x: number;
  y: number;
  p: number;
}

export interface BrushSettings {
  /** Diameter at full pressure, in document pixels. */
  size: number;
  /** How much pressure thins the line, -1 to 1 (0 = constant width). */
  thinning: number;
  /** Softens the outline's edges, 0 to 1. */
  smoothing: number;
  /** Evens out the hand's wobble, 0 to 1. */
  streamline: number;
  /** Taper length at the start and end, in document pixels (0 = none). */
  taperStart: number;
  taperEnd: number;
  /** Round or flat ends when not tapered. */
  capStart: boolean;
  capEnd: boolean;
}

/** A brush or pencil stroke, kept as its input points so it can be re-rendered or re-styled losslessly. */
export interface StrokeShape {
  id: Id;
  /** Shapes sharing a group id select and move together, and never merge (missing = not grouped). */
  group?: Id;
  type: 'stroke';
  points: StrokePoint[];
  brush: BrushSettings;
  color: Color;
  opacity: number;
}

/** One closed outline: a list of points, each optionally a cubic bezier from the previous point. */
export interface PathPoint {
  x: number;
  y: number;
  /** Control points of the curve arriving at this point (absent = straight line). */
  c1?: { x: number; y: number };
  c2?: { x: number; y: number };
}

export interface SubPath {
  points: PathPoint[];
  closed: boolean;
}

/**
 * A filled area, as made by the paint bucket. Holes are subpaths inside others; filling uses the even-odd rule.
 */
export interface FillShape {
  id: Id;
  /** Shapes sharing a group id select and move together, and never merge (missing = not grouped). */
  group?: Id;
  type: 'fill';
  paths: SubPath[];
  color: Color;
  opacity: number;
}

/** A geometric shape (rectangle, ellipse, line, polygon, pen path), with an optional fill and stroke. */
export interface PathShape {
  id: Id;
  /** Shapes sharing a group id select and move together, and never merge (missing = not grouped). */
  group?: Id;
  type: 'path';
  paths: SubPath[];
  fill: Color | null;
  stroke: { color: Color; width: number; join: 'round' | 'miter' | 'bevel'; cap: 'round' | 'butt' | 'square' } | null;
  opacity: number;
}

export interface Clip {
  id: Id;
  name: string;
  /** First and last frame, inclusive. */
  start: number;
  end: number;
  loop: boolean;
}

export interface Marker {
  id: Id;
  name: string;
  frame: number;
}

export interface Swatch {
  id: Id;
  name: string;
  color: Color;
}

/**
 * A pixel art palette. Colours are in order; a ramp is a run of neighbours going from dark to light (or light to
 * dark), which is what shading steps along. `ramps` lists where each ramp starts (index into `colors`); missing or
 * empty means the whole palette is one ramp.
 */
export interface DocPalette {
  name: string;
  colors: Color[];
  ramps?: number[];
}

// ---------------------------------------------------------------- symbols and tweens

/**
 * A symbol: a reusable drawing with its own timeline. Its layers use the document's drawings, like the stage's do.
 * Content is in symbol space, which is stage space as it was when the symbol was made, so an instance with the
 * plain transform shows it exactly where it was drawn.
 */
export interface SymbolDef {
  id: Id;
  name: string;
  layers: Layer[];
  /** Length of its own timeline, in frames (at least 1). */
  length: number;
  /** The registration point in symbol space: what an instance's x, y place, and what it turns and scales around. */
  origin: { x: number; y: number };
}

/** Where an instance sits. Angles are degrees. Applied as translate, rotate, skew, scale, around the symbol's origin. */
export interface Transform2D {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  /** Horizontal skew, degrees. */
  skew: number;
}

/** How an instance plays its symbol's timeline: round and round, once then hold the last frame, or one frame only. */
export type PlayMode = 'loop' | 'once' | 'single';

/** A placed copy of a symbol. Lives in a vector drawing like any shape, so select, move and arrange work on it. */
export interface InstanceShape {
  id: Id;
  group?: Id;
  type: 'instance';
  symbolId: Id;
  transform: Transform2D;
  opacity: number;
  /** Colour wash over the whole instance, amount 0 to 1 (missing = none). */
  tint?: { color: Color; amount: number };
  play: PlayMode;
  /** The symbol frame it starts on (0-based). */
  firstFrame: number;
}

/**
 * An easing: a named preset (the same names Interactives uses) or a custom cubic bezier [x1, y1, x2, y2].
 */
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'backIn' | 'backOut' | 'elasticOut' | 'bounceOut' | [number, number, number, number];

/**
 * In-betweens on a key. `kind` leaves room for shape tweens later (missing = 'classic': instances move between the
 * transforms, opacity and tint they have on the two keys).
 */
export interface Tween {
  kind?: 'classic';
  ease: Easing;
  /** Extra whole turns on the way (positive clockwise). */
  spin?: number;
  /** Follow this line on the way (stage coordinates of the layer). */
  path?: MotionPath;
}

export interface MotionPath {
  points: PathPoint[];
  /** Turn to face along the line. */
  orient: boolean;
}

/** One level of editing in place (see Doc.editing). */
export interface EditFrame {
  symbolId: Id;
  /** The instance that was double-clicked, if any, to place the dimmed surroundings. */
  instanceId?: Id;
  /** What `layers`, `length` held before entering. */
  layers: Layer[];
  length: number;
  /** Playhead and active layer outside, to put back on the way out. */
  frame: number;
  activeLayerId: Id | null;
  /** Instance space to outer space, as [a, b, c, d, e, f]. */
  matrix: [number, number, number, number, number, number];
}
