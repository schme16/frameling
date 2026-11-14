/**
 * Selecting on a vector layer: the bit you went round, or the whole shape.
 *
 * Dragging a box (or a lasso) over part of a shape has two reasonable answers. **Just the bit** picks the points and
 * edges inside it, so you can move one corner and the shape stretches. **The whole shape** picks anything the drag
 * touches, so you move the thing instead of reshaping it. Asked the first time, remembered, and Ctrl swaps it for one
 * drag. The decision is pure (`pickScoped`) so it can be tested without a canvas.
 *
 * A picked bit lives here, not in the document: `PartMap` says which points of which shapes are picked, and it only
 * counts while the selection it was made for is still the selection (like the merge layer's pending cut).
 */
import type {
  FillShape,
  Id,
  PathShape,
  PathPoint,
  Shape,
  StrokeShape,
} from "../core/format";
import { registerChoice, currentChoice, setChoice } from "../core/choices";
import { registerCommands } from "../core/registry";
import { toast } from "../ui/toast";
import { store } from "../core/store";
import {
  apply,
  rectContainsPoint,
  rectsIntersect,
  shapeBounds,
  transformShape,
  type Matrix,
  type Pt,
  type Rect,
} from "../canvas/geometry";
import {
  polygonGeom,
  shapeInsideArea,
  shapeTouchesArea,
} from "../geometry/merge";

export type VectorScope = "parts" | "whole";

export const SCOPE_CHOICE = "select.vectorScope";

registerChoice<VectorScope>({
  id: SCOPE_CHOICE,
  title: "Selecting part of a shape",
  question:
    "You've dragged round only part of a shape. Should Frameling pick just the bit you went round (so you can move one corner), or the whole shape? Hold Ctrl while you drag to get the other one for a go. You can change this any time in Preferences.",
  options: [
    {
      value: "parts",
      label: "Just the bit I went round",
      detail:
        "Only the points and edges inside your drag are picked. Move them and the shape stretches, so you can nudge one corner and leave the rest.",
      did: "Picked just the bit you went round.",
    },
    {
      value: "whole",
      label: "The whole shape",
      detail:
        "Any shape your drag touches is picked all of it. Move it and it goes as one piece, so you are arranging, not reshaping.",
      did: "Picked the whole shape.",
    },
  ],
  default: "whole",
  dismiss: "whole",
  category: "Drawing",
  help: "tool-select",
});

/** The way to pick right now with no key held: what you answered, or the whole shape. */
export const vectorScope = (): VectorScope =>
  currentChoice<VectorScope>(SCOPE_CHOICE);

registerCommands([
  {
    id: "select.scope",
    label: "Selecting picks just the bit I went round",
    category: "Edit",
    description:
      "Dragging a box or lasso over part of a vector shape picks only the points inside it, so you can move one corner. Turn it off to pick the whole shape. Ctrl swaps it for one drag.",
    help: "tool-select",
    keywords: [
      "select",
      "selection",
      "marquee",
      "lasso",
      "whole shape",
      "parts",
      "points",
      "corner",
      "direct select",
      "partial",
      "touches",
    ],
    checked: () => vectorScope() === "parts",
    run: () => {
      const next = otherScope(vectorScope());
      setChoice(SCOPE_CHOICE, next);
      toast(
        next === "parts"
          ? "Selecting now picks just the bit you drag round. Hold Ctrl to pick the whole shape for one drag."
          : "Selecting now picks the whole shape. Hold Ctrl to pick just the bit for one drag.",
      );
    },
  },
]);

/** The other way, for the drag where Ctrl (Cmd on a Mac) is held. */
export const otherScope = (s: VectorScope): VectorScope =>
  s === "parts" ? "whole" : "parts";

/** The way a drag picks: the setting, or the other one while Ctrl is held. */
export const scopeFor = (setting: VectorScope, swap: boolean): VectorScope =>
  swap ? otherScope(setting) : setting;

// ---------------------------------------------------------------- the area dragged

/** What a drag covers: a box, or the inside of a lasso. */
export interface Area {
  /** The shape reaches into the area (what picking the whole shape goes by). */
  touches(s: Shape): boolean;
  /** A point is inside the area. */
  holds(p: Pt): boolean;
  /** The whole shape is inside the area. */
  wraps(s: Shape): boolean;
}

export function boxArea(r: Rect): Area {
  return {
    touches: (s) => rectsIntersect(shapeBounds(s), r),
    holds: (p) => rectContainsPoint(r, p.x, p.y),
    wraps: (s) => {
      const b = shapeBounds(s);
      return (
        b.x >= r.x &&
        b.y >= r.y &&
        b.x + b.w <= r.x + r.w &&
        b.y + b.h <= r.y + r.h
      );
    },
  };
}

/** Whether a point is inside a closed outline (the even-odd rule, which is how a lasso that crosses itself counts). */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function lassoArea(pts: readonly Pt[]): Area {
  const geom = polygonGeom(pts as Pt[]);
  return {
    touches: (s) => shapeTouchesArea(s, geom),
    holds: (p) => pointInPolygon(p, pts),
    wraps: (s) => shapeInsideArea(s, geom),
  };
}

// ---------------------------------------------------------------- points of a shape

/** Which points of which shapes are picked, as `sub.index` keys. A shape missing from it is picked whole. */
export type PartMap = Map<Id, Set<string>>;

type Pointy = StrokeShape | FillShape | PathShape;
const hasPoints = (s: Shape): s is Pointy =>
  s.type === "stroke" || s.type === "fill" || s.type === "path";
export const keyOf = (sub: number, i: number): string => `${sub}.${i}`;

/** Every point a shape can be picked by, with the key it goes under. */
export function shapePoints(s: Shape): { key: string; x: number; y: number }[] {
  if (s.type === "stroke")
    return s.points.map((p, i) => ({ key: keyOf(0, i), x: p.x, y: p.y }));
  if (s.type === "fill" || s.type === "path")
    return s.paths.flatMap((sp, si) =>
      sp.points.map((p, i) => ({ key: keyOf(si, i), x: p.x, y: p.y })),
    );
  return [];
}

export interface ScopedPick {
  /** The shapes picked. */
  ids: Id[];
  /** The shapes only partly picked, with their points. The rest of `ids` come whole. */
  parts: PartMap;
  /**
   * The two ways would give different answers for this drag: some shape it touches is not all inside it. When this is
   * false there is nothing to ask, because either answer picks the same.
   */
  differs: boolean;
}

/**
 * What a drag picks. `scope` 'whole' takes every shape the area touches (grouped ones come along, via `expand`).
 * 'parts' takes the points inside it, and a shape with no points of its own (text, a symbol) only when it is
 * wholly inside. `points` is false on a merge layer, where a piece is cut out by the layer instead.
 */
export function pickScoped(
  shapes: readonly Shape[],
  area: Area,
  scope: VectorScope,
  opts: { points?: boolean; expand?: (ids: Id[]) => Id[] } = {},
): ScopedPick {
  const usePoints = opts.points !== false;
  const touched = shapes.filter((s) => area.touches(s));
  const wholeIds = (opts.expand ?? ((x: Id[]) => x))(touched.map((s) => s.id));
  const parts: PartMap = new Map();
  const taken = new Set<Id>();
  let differs = false;
  for (const s of touched) {
    // Is all of this shape inside the area, so that either way picks all of it?
    let complete: boolean;
    let keys: Set<string> | null = null;
    if (usePoints && hasPoints(s)) {
      const pts = shapePoints(s);
      keys = new Set(pts.filter((p) => area.holds(p)).map((p) => p.key));
      complete = pts.length > 0 && keys.size === pts.length;
    } else {
      complete = area.wraps(s);
    }
    if (!complete) differs = true;
    if (scope === "parts" && usePoints) {
      if (complete) taken.add(s.id);
      else if (keys && keys.size) {
        taken.add(s.id);
        parts.set(s.id, keys);
      }
    }
  }
  const ids =
    scope === "whole" || !usePoints
      ? wholeIds
      : shapes.filter((s) => taken.has(s.id)).map((s) => s.id);
  return {
    ids,
    parts: scope === "whole" || !usePoints ? new Map() : parts,
    differs,
  };
}

/** Puts new picks on top of the old (Shift+drag): the points of a shape add up, and a shape picked whole stays whole. */
export function addPicks(
  base: PartMap,
  baseIds: readonly Id[],
  next: PartMap,
): PartMap {
  const out: PartMap = new Map();
  const whole = new Set(baseIds.filter((id) => !base.has(id)));
  for (const [id, keys] of base) out.set(id, new Set(keys));
  for (const [id, keys] of next) {
    if (whole.has(id)) continue;
    const have = out.get(id);
    if (have) for (const k of keys) have.add(k);
    else out.set(id, new Set(keys));
  }
  return out;
}

// ---------------------------------------------------------------- moving only the picked points

/**
 * A shape with only its picked points taken through the matrix. A curve's handles go with the point they hang from,
 * so a corner you move drags its own curves with it and the other end of each curve stays put.
 */
export function movePoints(
  s: Shape,
  m: Matrix,
  keys: ReadonlySet<string>,
): Shape {
  if (s.type === "stroke") {
    return {
      ...s,
      points: s.points.map((p, i) =>
        keys.has(keyOf(0, i)) ? { ...p, ...apply(m, p.x, p.y) } : p,
      ),
    };
  }
  if (s.type !== "fill" && s.type !== "path") return transformShape(s, m);
  const paths = s.paths.map((sp, si) => {
    const n = sp.points.length;
    const points = sp.points.map((p, i): PathPoint => {
      const own = keys.has(keyOf(si, i));
      // The curve leaving the point before this one belongs to that point (stored on this one as c1).
      const from = i === 0 ? (sp.closed ? n - 1 : -1) : i - 1;
      const before = from >= 0 && keys.has(keyOf(si, from));
      if (!own && !before) return p;
      const out: PathPoint = { x: p.x, y: p.y };
      if (own) Object.assign(out, apply(m, p.x, p.y));
      if (p.c1) out.c1 = before ? apply(m, p.c1.x, p.c1.y) : p.c1;
      if (p.c2) out.c2 = own ? apply(m, p.c2.x, p.c2.y) : p.c2;
      return out;
    });
    return { ...sp, points };
  });
  return { ...s, paths } as Shape;
}

/** A shape with its picked points removed (the points of a Delete). Null when nothing usable is left of it. */
export function removePoints(
  s: Shape,
  keys: ReadonlySet<string>,
): Shape | null {
  if (s.type === "stroke") {
    const points = s.points.filter((_, i) => !keys.has(keyOf(0, i)));
    return points.length >= 2 ? { ...s, points } : null;
  }
  if (s.type !== "fill" && s.type !== "path") return null;
  const paths = s.paths
    .map((sp, si) => ({
      ...sp,
      points: sp.points.filter((_, i) => !keys.has(keyOf(si, i))),
    }))
    .filter((sp) => sp.points.length >= (sp.closed ? 3 : 2));
  return paths.length ? ({ ...s, paths } as Shape) : null;
}

/** The corners of the box round the picked points (or the whole shape when it is picked whole). */
export function pickedBounds(
  shapes: readonly Shape[],
  parts: PartMap,
): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const s of shapes) {
    const keys = parts.get(s.id);
    if (!keys) {
      const b = shapeBounds(s);
      take(b.x, b.y);
      take(b.x + b.w, b.y + b.h);
      continue;
    }
    for (const p of shapePoints(s)) if (keys.has(p.key)) take(p.x, p.y);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------- the pick that is on show

interface Held {
  drawingId: Id;
  selection: Id[];
  parts: PartMap;
}
let held: Held | null = null;

/** Remembers which points are picked, for the selection as it is now. An empty map clears it. */
export function setParts(drawingId: Id, parts: PartMap): void {
  held = parts.size
    ? { drawingId, selection: store().get().ui.selection, parts }
    : null;
}

export function clearParts(): void {
  held = null;
}

/** The picked points, while they still go with the selection and the drawing; else none (everything picked is whole). */
export function currentParts(drawingId?: Id): PartMap {
  const h = held;
  if (!h) return new Map();
  const sel = store().get().ui.selection;
  const same =
    sel === h.selection ||
    (sel.length === h.selection.length &&
      sel.every((x, i) => x === h.selection[i]));
  if (!same || (drawingId !== undefined && drawingId !== h.drawingId)) {
    held = null;
    return new Map();
  }
  return h.parts;
}

/** A shape taken through the matrix the way the selection says: only its picked points, or all of it. */
export function transformPicked(
  s: Shape,
  m: Matrix,
  parts: PartMap = currentParts(),
): Shape {
  const keys = parts.get(s.id);
  return keys ? movePoints(s, m, keys) : transformShape(s, m);
}
