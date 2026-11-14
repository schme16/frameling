/**
 * Kinds of shape that are not the drawing basics (strokes, fills, paths and symbol instances). Text and particles are
 * the first: each registers a kind, and the renderer, posing, selection and the file reader ask the registry instead
 * of importing them. A kind stays registered for good, even while its feature is switched off, so a drawing that holds
 * one still looks right, exports and saves. (What turning a feature off hides is its tools, panels and commands.)
 *
 * Plain lookups by type name, made once per shape. Nothing here does work per pixel.
 */
import type { Doc, Id, Shape } from './format';
import type { Ctx2D } from './render';
import type { PosedInstance } from './symbols';

export interface ShapeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What posing a moving shape can ask for: the pictures of a symbol, frame by frame. */
export interface PoseEnv {
  /** The symbol's drawings as one posed instance at each of its frames, and how long it is. Null when there is no such symbol (or it is too deep). */
  symbol(symbolId: Id): { length: number; at: (frame: number) => PosedInstance | null } | null;
}

export interface ShapeKind<S extends Shape = Shape> {
  /** The `type` of the shapes it handles. */
  type: S['type'];
  /** Draws the shape (opacity and all) onto the canvas. `drawInstance` draws a posed symbol, for sprites made of one. */
  draw(g: Ctx2D, s: S, drawInstance: (g: Ctx2D, i: PosedInstance) => void): void;
  /** Grows a box over everything it can paint (see `drawingBox` in render.ts). */
  extend(s: S, grow: (x: number, y: number, r?: number) => void): void;
  /** The box it covers, for selecting and moving it. */
  bounds(s: S): ShapeBox;
  /** Is the point on it? `tol` is how far off still counts, in document pixels. */
  hit(s: S, x: number, y: number, tol: number): boolean;
  /** A new shape moved about by the matrix [a, b, c, d, e, f]. */
  transform(s: S, m: readonly [number, number, number, number, number, number]): S;
  /** True when it changes from frame to frame by itself (animated text, particles). */
  moving?(s: S): boolean;
  /** The shape as it looks `local` frames after its key began. Called for every shape of the kind. */
  pose?(doc: Doc, s: S, local: number, env: PoseEnv): S;
  /** Reads one from a file: checked, with sensible defaults. Null when it is too damaged to keep. */
  read(raw: Record<string, unknown>): S | null;
}

const kinds = new Map<string, ShapeKind>();

/** Registers a kind (once, when its folder loads). A later one with the same type replaces the earlier. */
export function registerShapeKind<S extends Shape>(k: ShapeKind<S>): void {
  kinds.set(k.type, k as unknown as ShapeKind);
}

/** The kind for a type of shape, or undefined for the drawing basics and for a type nobody registered. */
export const shapeKind = (type: string): ShapeKind | undefined => kinds.get(type);

export const hasShapeKind = (type: string): boolean => kinds.has(type);

/** For tests: forget every kind. */
export function _resetShapeKindsForTests(): void {
  kinds.clear();
}

/** The shape's kind, for a shape that is none of the drawing basics. */
export function kindOf(s: Shape): ShapeKind | undefined {
  return s.type === 'stroke' || s.type === 'fill' || s.type === 'path' || s.type === 'instance' ? undefined : kinds.get(s.type);
}

/** A shape of a registered kind (not a stroke, fill, path or instance). */
export const isKindShape = (s: Shape): boolean => !!kindOf(s);
