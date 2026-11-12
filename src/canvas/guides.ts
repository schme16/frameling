// Guides and snapping at run time: drawing the guide lines, the guide being dragged out of a ruler, the lines that
// just snapped, the snap helpers tools call, and the View commands.
import type { Guide } from '../core/format';
import { uid } from '../core/doc';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { addStageOverlay, hint, requestOverlay } from './controller';
import { addLines, bumpSnap, getSnapLines, noTargets, setSnapLines, setSnapNotes, SNAP_PX, snapBox, snappedKinds, snapPoint, withGuide, type SnapLine, type SnapTargets } from './snap';
import { activeTargets, type SnapContext, type SnapTarget } from './snapModel';
import { currentSnapContext } from './snapOps';
import { otherShapeLines } from './snapShapes';
import { cssVar } from './theme';
import { constrainWithVanishing, isoRatio, snapIso, snapToVanishing, squareLines } from './grid';
import { getViewSettings, setViewSettings } from './viewSettings';
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

/**
 * The lines to pull onto: the page's edges and middle, guides, a showing square grid and other shapes, each if its tick
 * says so. `moving` leaves the selected shapes out of "other shapes" (they are what's being dragged).
 */
function targets(set: Set<SnapTarget>, moving: boolean): SnapTargets | null {
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
  if (set.has('shapes')) {
    const o = otherShapeLines(doc, ui.frame, moving ? ui.selection : []);
    addLines(t, 'shapes', o.x, o.y);
  }
  return t.x.length || t.y.length ? t : null;
}

/** A point pulled onto the lines that are on (shape corners, line ends). `moving`: the selection is what is dragged. */
export function snapPt(p: Pt, zoom: number, bypass: boolean, moving = false): Pt {
  const set = active(bypass);
  const v = getViewSettings();
  // An isometric grid pulls points onto its corners.
  if (set.has('grid') && v.grid === 'iso') {
    const q = snapIso(p, v.gridSize, isoRatio(v.isoStyle));
    if (Math.hypot(q.x - p.x, q.y - p.y) <= SNAP_PX / zoom) return showSnap([], ['grid']), q;
  }
  const t = targets(set, moving);
  if (!t) return showSnap([]), p;
  const s = snapPoint(p, t, SNAP_PX / zoom);
  showSnap(s.lines);
  return { x: s.x, y: s.y };
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
    const hit = snapToVanishing(a, b, vps, (SNAP_PX * 1.5) / zoom);
    if (hit) {
      showSnap([], ['perspective']);
      showRay({ from: a, vp: vps[hit.index] });
      return { pt: hit.pt, constrained: shift };
    }
  }
  showRay(null);
  if (steps) return showSnap([], ['angles']), { pt: b, constrained: false };
  return { pt: snapPt(b, zoom, bypass), constrained: shift };
}

/** A box being dragged by (dx, dy) pulled onto the nearest lines (the selection itself is never a target). */
export function snapMove(box: Rect | null, dx: number, dy: number, zoom: number, bypass: boolean): { dx: number; dy: number } {
  const t = box && targets(active(bypass), true);
  if (!t || !box) return showSnap([]), { dx, dy };
  const s = snapBox(box, dx, dy, t, SNAP_PX / zoom);
  showSnap(s.lines);
  return { dx: s.dx, dy: s.dy };
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

/** Records what just snapped, for the overlay and the "Snapped to" note. `extra`: kinds with no line to draw. */
export function showSnap(lines: SnapLine[], extra: SnapTarget[] = []): void {
  const old = getSnapLines();
  const same = old.length === lines.length && old.every((l, i) => l.axis === lines[i].axis && l.at === lines[i].at && l.kind === lines[i].kind);
  const before = snappedKinds().join();
  if (!same) {
    setSnapLines(lines);
    requestOverlay();
  }
  setSnapNotes(extra);
  if (!same || snappedKinds().join() !== before) bumpSnap();
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
  if (snapped.length) {
    g.globalAlpha = 1;
    g.strokeStyle = cssVar('--rose', '#ff6f91');
    g.lineWidth = 1.25 * px;
    for (const s of snapped) line(g, s.axis, s.at, doc.width, doc.height);
  }
  if (ray) {
    // The perspective line being followed, from the vanishing point out past the line's start.
    const dx = ray.from.x - ray.vp.x;
    const dy = ray.from.y - ray.vp.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = (doc.width + doc.height) * 4;
    g.globalAlpha = 1;
    g.strokeStyle = cssVar('--rose', '#ff6f91');
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
