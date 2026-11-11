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

export type Shape = StrokeShape | FillShape | PathShape;

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
