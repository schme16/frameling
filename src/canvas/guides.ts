// Guides and snapping at run time: drawing the guide lines, the guide being dragged out of a ruler, the lines that
// just snapped, the snap helpers tools call, and the View commands.
import type { Guide } from '../core/format';
import { uid } from '../core/doc';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { addStageOverlay, hint, requestOverlay } from './controller';
import { getSnapLines, setSnapLines, SNAP_PX, snapBox, snapPoint, snapTargets, withGuide, type SnapLine } from './snap';
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

/** Snapping for the gesture in hand: off when the setting is off or Ctrl (Cmd) is held. */
function targets(bypass: boolean) {
  const v = getViewSettings();
  if (bypass || !v.snap) return null;
  const doc = store().get().doc;
  const t = snapTargets(doc, v.guides);
  // A square grid that's showing is more lines to snap to.
  if (v.grid === 'square') {
    const g = squareLines(v.gridSize, doc.width, doc.height);
    t.x.push(...g.x);
    t.y.push(...g.y);
  }
  return t;
}

/** A point pulled onto guides and the page's edges and middle (shape corners, line ends). */
export function snapPt(p: Pt, zoom: number, bypass: boolean): Pt {
  const t = targets(bypass);
  if (!t) return showSnap([]), p;
  const v = getViewSettings();
  // An isometric grid pulls points onto its corners.
  if (v.grid === 'iso') {
    const q = snapIso(p, v.gridSize, isoRatio(v.isoStyle));
    if (Math.hypot(q.x - p.x, q.y - p.y) <= SNAP_PX / zoom) return showSnap([]), q;
  }
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

/** The vanishing points lines can follow: only while the perspective guides show and snapping is on. */
export function vanishingPoints(bypass: boolean): Pt[] {
  const v = getViewSettings();
  if (bypass || !v.snap || !v.perspective) return [];
  return store().get().doc.perspective?.points ?? [];
}

/**
 * The end of a line drawn from `a` (Line tool, pen segments). With perspective guides showing, it follows a vanishing
 * point's direction when it comes close; with Shift it takes the nearest of the 45 degree steps and those directions.
 * `constrained` says Shift was handled here, so the caller shouldn't snap to 45 degrees again.
 */
export function snapLineEnd(a: Pt, b: Pt, zoom: number, bypass: boolean, shift: boolean): { pt: Pt; constrained: boolean } {
  const vps = vanishingPoints(bypass);
  if (vps.length) {
    if (shift) {
      const c = constrainWithVanishing(a, b, vps);
      showSnap([]);
      showRay(c.index === null ? null : { from: a, vp: vps[c.index] });
      return { pt: c.pt, constrained: true };
    }
    const hit = snapToVanishing(a, b, vps, (SNAP_PX * 1.5) / zoom);
    if (hit) {
      showSnap([]);
      showRay({ from: a, vp: vps[hit.index] });
      return { pt: hit.pt, constrained: false };
    }
  }
  showRay(null);
  if (shift) return { pt: b, constrained: false };
  return { pt: snapPt(b, zoom, bypass), constrained: false };
}

/** A box being dragged by (dx, dy) pulled onto the nearest lines. */
export function snapMove(box: Rect | null, dx: number, dy: number, zoom: number, bypass: boolean): { dx: number; dy: number } {
  const t = box && targets(bypass);
  if (!t || !box) return showSnap([]), { dx, dy };
  const s = snapBox(box, dx, dy, t, SNAP_PX / zoom);
  showSnap(s.lines);
  return { dx: s.dx, dy: s.dy };
}

/** Lets go of the snap lines (the gesture is over). */
export function clearSnap(): void {
  showSnap([]);
  showRay(null);
}

function showSnap(lines: SnapLine[]): void {
  const old = getSnapLines();
  if (old.length === lines.length && old.every((l, i) => l.axis === lines[i].axis && l.at === lines[i].at)) return;
  setSnapLines(lines);
  requestOverlay();
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
    label: 'Snap to guides, grid and page',
    category: 'View',
    keys: ['Mod+Shift+;'],
    description: 'Shapes and selections jump onto guides, the grid (when it shows) and the page edges and middle when they get close. Hold Ctrl while dragging to stop it for a moment.',
    help: 'rulers-guides',
    keywords: ['snap', 'snapping', 'magnet', 'align'],
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
