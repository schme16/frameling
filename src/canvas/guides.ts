// Guides and snapping at run time: drawing the guide lines, the guide being dragged out of a ruler, the lines that
// just snapped, the snap helpers tools call, and the View commands.
import type { Guide } from '../core/format';
import { uid } from '../core/doc';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { addStageOverlay, hint, requestOverlay } from './controller';
import { addLines, bumpSnap, getSnapGaps, getSnapLines, noTargets, setSnapGaps, setSnapLines, setSnapNotes, snapBox, snappedKinds, snapPoint, withGuide, type SnapLine, type SnapTargets } from './snap';
import { activeTargets, snapColourVar, type SnapContext, type SnapTarget } from './snapModel';
import { currentSnapContext } from './snapOps';
import { otherShapes } from './snapShapes';
import { spacingAxis, spacingFor, type Gap, type SpacingHit } from './snapSpacing';
import { cssVar } from './theme';
import { contrast, isHex } from '../ui/themes/color';
import { constrainWithVanishing, isoRatio, snapIso, snapToVanishing, squareLines } from './grid';
import { getViewSettings, setViewSettings, snapPx } from './viewSettings';
import type { Pt, Rect } from './view';

// ---------------------------------------------------------------- the guide being dragged

export interface GuideDrag {
  guide: Guide;
  /** Where it is now (stage pixels), or null while it's over the ruler (letting go there removes it). */
  at: number | null;
  /** True for a guide that was already there (moving), false for a new one. */
  existing: boolean;
}

let drag: GuideDrag | null = null;

export const getGuideDrag = (): GuideDrag | null => drag;

export function startGuideDrag(axis: 'x' | 'y', existing?: Guide): boolean {
  if (getViewSettings().lockGuides) {
    hint('Guides are locked. Unlock them from View > Lock guides.');
    return false;
  }
  if (!getViewSettings().guides) setViewSettings({ guides: true });
  drag = { guide: existing ?? { id: uid('g'), axis, at: 0 }, at: existing ? existing.at : null, existing: !!existing };
  requestOverlay();
  return true;
}

export function moveGuideDrag(at: number | null): void {
  if (!drag) return;
  drag.at = at;
  requestOverlay();
}

/** Lands the dragged guide: added, moved, or (dropped on a ruler) removed. One undo step. */
export function endGuideDrag(): void {
  const d = drag;
  drag = null;
  requestOverlay();
  if (!d) return;
  if (!d.existing && d.at === null) return;
  if (d.existing && d.at === d.guide.at) return;
  const label = d.at === null ? 'Remove guide' : d.existing ? 'Move guide' : 'Add guide';
  store().update(label, (doc) => {
    const next = withGuide(doc.guides, d.guide, d.at);
    if (next.length) doc.guides = next;
    else delete doc.guides;
  });
}

export function cancelGuideDrag(): void {
  drag = null;
  requestOverlay();
}

// ---------------------------------------------------------------- snapping for tools

/** The snap targets in force for the gesture in hand: none when snapping is off or Ctrl (Cmd) is held (see snapModel.ts). */
function active(bypass: boolean, ctx: SnapContext = currentSnapContext()): Set<SnapTarget> {
  const v = getViewSettings();
  return activeTargets(v.snap, v.snapPicks, ctx, bypass, { guides: v.guides, grid: v.grid, perspective: v.perspective });
}

/** Are Shift angle steps on (for lines, rotations and the pixel line)? Not stopped by Ctrl or the master switch. */
export function angleSteps(): boolean {
  return active(false).has('angles');
}

/** What to pull onto: lines, and the boxes of the other shapes for equal gaps. */
interface Pulls {
  t: SnapTargets | null;
  rects: Rect[];
}

/**
 * The lines to pull onto: the page's edges and middle, guides, a showing square grid and other shapes, each if its tick
 * says so, and the other shapes' boxes for equal gaps. `moving` leaves the selected shapes out (they are what's being
 * dragged). With "All layers" off, other shapes are the ones on the open layer only.
 */
function pulls(set: Set<SnapTarget>, moving: boolean): Pulls {
  const t = noTargets();
  const { doc, ui } = store().get();
  const v = getViewSettings();
  if (set.has('page')) addLines(t, 'page', [0, doc.width], [0, doc.height]);
  if (set.has('centre')) addLines(t, 'centre', [doc.width / 2], [doc.height / 2]);
  if (set.has('guides')) {
    const gs = doc.guides ?? [];
    addLines(t, 'guides', gs.filter((g) => g.axis === 'x').map((g) => g.at), gs.filter((g) => g.axis === 'y').map((g) => g.at));
  }
  if (set.has('grid') && v.grid === 'square') {
    const g = squareLines(v.gridSize, doc.width, doc.height);
    addLines(t, 'grid', g.x, g.y);
  }
  let rects: Rect[] = [];
  if (set.has('shapes') || set.has('spacing')) {
    const o = otherShapes(doc, ui.frame, moving ? ui.selection : [], v.snapAllLayers ? null : ui.activeLayerId);
    if (set.has('shapes')) addLines(t, 'shapes', o.lines.x, o.lines.y);
    if (set.has('spacing')) rects = o.boxes;
  }
  return { t: t.x.length || t.y.length ? t : null, rects };
}

/** The line a snap result landed on for one axis, if any. */
const lineOn = (lines: SnapLine[], axis: 'x' | 'y') => lines.find((l) => l.axis === axis);

/**
 * Equal gaps against what line snapping found: a gap wins an axis when no line took it, or when it needs a smaller move.
 * `nudge` is how far the lines already moved the box on that axis. Returns the final moves, the lines left, and the gaps.
 */
function withSpacing(lines: SnapLine[], nudge: { x: number; y: number }, sp: { x: SpacingHit | null; y: SpacingHit | null }): { x: number; y: number; lines: SnapLine[]; gaps: Gap[] } {
  let out = lines;
  const gaps: Gap[] = [];
  const res = { x: nudge.x, y: nudge.y };
  for (const axis of ['x', 'y'] as const) {
    const hit = sp[axis];
    if (!hit) continue;
    if (lineOn(lines, axis) && Math.abs(hit.d) >= Math.abs(nudge[axis])) continue;
    res[axis] = hit.d;
    out = out.filter((l) => l.axis !== axis);
    gaps.push(...hit.gaps);
  }
  return { ...res, lines: out, gaps };
}

/**
 * Equal gaps for a dragged corner `p` of a shape drawn from `from`: along each axis the shape's span on the other axis
 * decides which neighbours count (a point would only see the ones level with the pointer).
 */
export function cornerSpacing(from: Pt, p: Pt, rects: readonly Rect[], tol: number): { x: SpacingHit | null; y: SpacingHit | null } {
  if (!rects.length) return { x: null, y: null };
  const w = Math.abs(p.x - from.x);
  const h = Math.abs(p.y - from.y);
  return {
    x: spacingAxis({ x: p.x, y: Math.min(from.y, p.y), w: 0, h }, 'x', rects, tol),
    y: spacingAxis({ x: Math.min(from.x, p.x), y: p.y, w, h: 0 }, 'y', rects, tol),
  };
}

/**
 * A point pulled onto the lines that are on (shape corners, line ends). `moving`: the selection is what is dragged.
 * `from`: the point is the far corner of a shape drawn from there, so equal gaps look at the whole span.
 */
export function snapPt(p: Pt, zoom: number, bypass: boolean, moving = false, from?: Pt): Pt {
  const set = active(bypass);
  const v = getViewSettings();
  const tol = snapPx() / zoom;
  // An isometric grid pulls points onto its corners.
  if (set.has('grid') && v.grid === 'iso') {
    const q = snapIso(p, v.gridSize, isoRatio(v.isoStyle));
    if (Math.hypot(q.x - p.x, q.y - p.y) <= tol) return showSnap([], ['grid']), q;
  }
  const { t, rects } = pulls(set, moving);
  if (!t && !rects.length) return showSnap([]), p;
  const s = t ? snapPoint(p, t, tol) : { x: p.x, y: p.y, lines: [] as SnapLine[] };
  const sp = from ? cornerSpacing(from, p, rects, tol) : spacingFor({ x: p.x, y: p.y, w: 0, h: 0 }, rects, tol);
  if (!sp.x && !sp.y) return showSnap(s.lines), { x: s.x, y: s.y };
  const m = withSpacing(s.lines, { x: s.x - p.x, y: s.y - p.y }, sp);
  showSnap(m.lines, [], m.gaps);
  return { x: p.x + m.x, y: p.y + m.y };
}

// The perspective direction a line end just snapped to (from the line's start towards a vanishing point), so it can flash.
let ray: { from: Pt; vp: Pt } | null = null;

function showRay(next: { from: Pt; vp: Pt } | null): void {
  if (!ray && !next) return;
  ray = next;
  requestOverlay();
}

/** The vanishing points lines can follow: only while the perspective guides show and that target is on. */
export function vanishingPoints(bypass: boolean): Pt[] {
  if (!active(bypass).has('perspective')) return [];
  return store().get().doc.perspective?.points ?? [];
}

/**
 * The end of a line drawn from `a` (Line tool, pen segments). With perspective lines on, it follows a vanishing
 * point's direction when it comes close; with Shift it takes the nearest of the 45 degree steps and those directions.
 * `constrained` says Shift was dealt with here (so the caller shouldn't snap to 45 degrees again): that includes
 * Shift doing nothing because Angle steps is off.
 */
export function snapLineEnd(a: Pt, b: Pt, zoom: number, bypass: boolean, shift: boolean): { pt: Pt; constrained: boolean } {
  const set = active(bypass);
  const vps = set.has('perspective') ? store().get().doc.perspective?.points ?? [] : [];
  const steps = shift && set.has('angles');
  if (vps.length) {
    if (steps) {
      const c = constrainWithVanishing(a, b, vps);
      showSnap([], [c.index === null ? 'angles' : 'perspective']);
      showRay(c.index === null ? null : { from: a, vp: vps[c.index] });
      return { pt: c.pt, constrained: true };
    }
    const hit = snapToVanishing(a, b, vps, (snapPx() * 1.5) / zoom);
    if (hit) {
      showSnap([], ['perspective']);
      showRay({ from: a, vp: vps[hit.index] });
      return { pt: hit.pt, constrained: shift };
    }
  }
  showRay(null);
  if (steps) return showSnap([], ['angles']), { pt: b, constrained: false };
  return { pt: snapPt(b, zoom, bypass, false, a), constrained: shift };
}

/** A box being dragged by (dx, dy) pulled onto the nearest lines and equal gaps (the selection itself is never a target). */
export function snapMove(box: Rect | null, dx: number, dy: number, zoom: number, bypass: boolean): { dx: number; dy: number } {
  const { t, rects } = box ? pulls(active(bypass), true) : { t: null, rects: [] as Rect[] };
  if (!box || (!t && !rects.length)) return showSnap([]), { dx, dy };
  const tol = snapPx() / zoom;
  const s = t ? snapBox(box, dx, dy, t, tol) : { dx, dy, lines: [] as SnapLine[] };
  const sp = spacingFor({ x: box.x + dx, y: box.y + dy, w: box.w, h: box.h }, rects, tol);
  if (!sp.x && !sp.y) return showSnap(s.lines), { dx: s.dx, dy: s.dy };
  const m = withSpacing(s.lines, { x: s.dx - dx, y: s.dy - dy }, sp);
  showSnap(m.lines, [], m.gaps);
  return { dx: dx + m.x, dy: dy + m.y };
}

/** The lines other artboards offer (edges and middles, on the pasteboard), or null when that target is off. */
export function artboardTargets(others: readonly Rect[], bypass: boolean): SnapTargets | null {
  if (!active(bypass, 'artboard').has('artboards') || !others.length) return null;
  const t = noTargets();
  for (const b of others) addLines(t, 'artboards', [b.x, b.x + b.w / 2, b.x + b.w], [b.y, b.y + b.h / 2, b.y + b.h]);
  return t;
}

/** Lets go of the snap lines (the gesture is over). */
export function clearSnap(): void {
  showSnap([]);
  showRay(null);
}

/** Records what just snapped, for the overlay and the "Snapped to" note. `extra`: kinds with no line to draw. `gaps`: equal gaps to mark. */
export function showSnap(lines: SnapLine[], extra: SnapTarget[] = [], gaps: Gap[] = []): void {
  const old = getSnapLines();
  const oldGaps = getSnapGaps();
  const sameLines = old.length === lines.length && old.every((l, i) => l.axis === lines[i].axis && l.at === lines[i].at && l.kind === lines[i].kind);
  const sameGaps = oldGaps.length === gaps.length && oldGaps.every((g, i) => g.axis === gaps[i].axis && g.from === gaps[i].from && g.to === gaps[i].to && g.at === gaps[i].at);
  const before = snappedKinds().join();
  if (!sameLines) setSnapLines(lines);
  if (!sameGaps) setSnapGaps(gaps);
  if (!sameLines || !sameGaps) requestOverlay();
  setSnapNotes(extra);
  if (!sameLines || !sameGaps || snappedKinds().join() !== before) bumpSnap();
}

// ---------------------------------------------------------------- drawing

function line(g: CanvasRenderingContext2D, axis: 'x' | 'y', at: number, w: number, h: number): void {
  // Long enough to reach the window's edges at any sensible zoom.
  const reach = Math.max(w, h) * 40;
  g.beginPath();
  if (axis === 'x') {
    g.moveTo(at, -reach);
    g.lineTo(at, reach);
  } else {
    g.moveTo(-reach, at);
    g.lineTo(reach, at);
  }
  g.stroke();
}

/** The colour a kind of snap draws in (a theme variable, see canvas.css); the rose of old when a line has no kind. */
function kindColour(kind: SnapTarget | undefined): string {
  return kind ? cssVar(snapColourVar(kind), '#e0455f') : cssVar('--rose', '#ff6f91');
}

/** Black or white, whichever reads better on `bg`. */
const inkOn = (bg: string): string => (isHex(bg) && contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#000000' : '#ffffff');

/** An equal gap: a bar with end ticks across the gap and its size on a small tab in the spacing colour. */
function drawGap(g: CanvasRenderingContext2D, gap: Gap, px: number): void {
  const colour = kindColour('spacing');
  const horizontal = gap.axis === 'x';
  const a = horizontal ? { x: gap.from, y: gap.at } : { x: gap.at, y: gap.from };
  const b = horizontal ? { x: gap.to, y: gap.at } : { x: gap.at, y: gap.to };
  const tick = 4 * px;
  g.save();
  g.strokeStyle = colour;
  g.lineWidth = 1.25 * px;
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  for (const e of [a, b]) {
    g.moveTo(horizontal ? e.x : e.x - tick, horizontal ? e.y - tick : e.y);
    g.lineTo(horizontal ? e.x : e.x + tick, horizontal ? e.y + tick : e.y);
  }
  g.stroke();
  const text = String(gap.label);
  g.font = `600 ${11 * px}px Nunito, Inter, system-ui, sans-serif`;
  const w = g.measureText(text).width + 8 * px;
  const h = 15 * px;
  const cx = (a.x + b.x) / 2 + (horizontal ? 0 : 12 * px + w / 2);
  const cy = (a.y + b.y) / 2 - (horizontal ? 12 * px : 0);
  g.fillStyle = colour;
  g.beginPath();
  g.roundRect(cx - w / 2, cy - h / 2, w, h, 4 * px);
  g.fill();
  g.fillStyle = inkOn(colour);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy + px * 0.5);
  g.restore();
}

addStageOverlay((g, zoom) => {
  const { doc } = store().get();
  const v = getViewSettings();
  const px = 1 / zoom;
  g.save();
  g.lineWidth = px;
  if (v.guides && doc.guides?.length) {
    g.strokeStyle = cssVar('--guide', '#2fc4e8');
    g.globalAlpha = v.lockGuides ? 0.6 : 0.9;
    for (const gd of doc.guides) if (!(drag?.existing && drag.guide.id === gd.id)) line(g, gd.axis, gd.at, doc.width, doc.height);
  }
  if (drag && drag.at !== null) {
    g.globalAlpha = 1;
    g.strokeStyle = cssVar('--guide', '#2fc4e8');
    g.setLineDash([4 * px, 3 * px]);
    line(g, drag.guide.axis, drag.at, doc.width, doc.height);
    g.setLineDash([]);
  }
  const snapped = getSnapLines();
  g.globalAlpha = 1;
  g.lineWidth = 1.25 * px;
  for (const s of snapped) {
    g.strokeStyle = kindColour(s.kind);
    line(g, s.axis, s.at, doc.width, doc.height);
  }
  for (const gap of getSnapGaps()) drawGap(g, gap, px);
  if (ray) {
    // The perspective line being followed, from the vanishing point out past the line's start.
    const dx = ray.from.x - ray.vp.x;
    const dy = ray.from.y - ray.vp.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = (doc.width + doc.height) * 4;
    g.globalAlpha = 1;
    g.strokeStyle = kindColour('perspective');
    g.lineWidth = 1.25 * px;
    g.setLineDash([5 * px, 3 * px]);
    g.beginPath();
    g.moveTo(ray.vp.x, ray.vp.y);
    g.lineTo(ray.vp.x + (dx / len) * reach, ray.vp.y + (dy / len) * reach);
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
});

// ---------------------------------------------------------------- commands

const toggle = (key: 'rulers' | 'guides' | 'snap' | 'lockGuides') => () => {
  setViewSettings({ [key]: !getViewSettings()[key] });
  // Menus read the tick from the store's state, so give them a nudge to look again.
  store().setUi({});
};

registerCommands([
  {
    id: 'view.rulers',
    label: 'Rulers',
    category: 'View',
    keys: ['Mod+R'],
    description: 'Show rulers along the top and left of the canvas. Drag from a ruler to make a guide line.',
    help: 'rulers-guides',
    keywords: ['ruler', 'measure', 'units', 'guides'],
    checked: () => getViewSettings().rulers,
    run: toggle('rulers'),
  },
  {
    id: 'view.guides',
    label: 'Guides',
    category: 'View',
    keys: ['Mod+;'],
    description: 'Show or hide the guide lines you dragged out of the rulers.',
    help: 'rulers-guides',
    keywords: ['guide lines', 'show guides', 'hide guides'],
    checked: () => getViewSettings().guides,
    run: toggle('guides'),
  },
  {
    id: 'view.snap',
    label: 'Snapping',
    category: 'View',
    keys: ['Mod+Shift+;'],
    description: 'The master switch: shapes and selections jump onto what you picked (guides, grid, page, other shapes...) when they get close. Hold Ctrl while dragging to stop it for a moment.',
    help: 'snapping',
    keywords: ['snap', 'snapping', 'magnet', 'align', 'snap to guides', 'snap to grid', 'snap to page'],
    checked: () => getViewSettings().snap,
    run: toggle('snap'),
  },
  {
    id: 'view.lockGuides',
    label: 'Lock guides',
    category: 'View',
    keys: ['Mod+Alt+;'],
    description: 'Stop guides being moved or added by accident.',
    help: 'rulers-guides',
    keywords: ['lock', 'guides'],
    checked: () => getViewSettings().lockGuides,
    run: toggle('lockGuides'),
  },
  {
    id: 'view.clearGuides',
    label: 'Clear all guides',
    category: 'View',
    description: 'Remove every guide line from this drawing.',
    help: 'rulers-guides',
    keywords: ['delete guides', 'remove guides'],
    enabled: (s) => !!s.doc.guides?.length,
    run: () => {
      if (!store().get().doc.guides?.length) return hint('There are no guides to clear.');
      store().update('Clear guides', (d) => {
        delete d.guides;
      });
    },
  },
]);
