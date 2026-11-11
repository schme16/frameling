// Grids (squares or isometric) and perspective guides at run time: drawing them over the page, dragging the
// vanishing points, and the View commands. The maths is in grid.ts.
import type { Pt } from './view';
import { registerCommands } from '../core/registry';
import { store } from '../core/store';
import { addCanvasGrab, addStageOverlay, hint, requestOverlay } from './controller';
import { defaultVanishing, gridStep, isoLines, isoRatio, moveVanishing, rayTargets } from './grid';
import { cssVar } from './theme';
import { getViewSettings, setViewSettings } from './viewSettings';

const nudge = () => store().setUi({});

// ---------------------------------------------------------------- drawing

function drawGrid(g: CanvasRenderingContext2D, zoom: number): void {
  const v = getViewSettings();
  if (v.grid === 'off') return;
  const { doc } = store().get();
  const w = doc.width;
  const h = doc.height;
  const px = 1 / zoom;
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.lineWidth = px;
  g.strokeStyle = cssVar('--faint', '#7d7591');
  g.globalAlpha = 0.55;
  g.beginPath();
  if (v.grid === 'square') {
    const step = v.gridSize * gridStep(v.gridSize, zoom);
    for (let x = step; x < w; x += step) {
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    for (let y = step; y < h; y += step) {
      g.moveTo(0, y);
      g.lineTo(w, y);
    }
  } else {
    const k = gridStep(v.gridSize / 2, zoom, 5);
    for (const [a, b] of isoLines(v.gridSize * k, isoRatio(v.isoStyle), w, h)) {
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
  }
  g.stroke();
  g.restore();
}

/** The vanishing points while one is being dragged, else the document's. */
let dragging: { index: number; points: Pt[] } | null = null;

function vanishing(): Pt[] {
  return dragging?.points ?? store().get().doc.perspective?.points ?? [];
}

const RAYS = 28;
const HANDLE_PX = 7;

function drawPerspective(g: CanvasRenderingContext2D, zoom: number): void {
  if (!getViewSettings().perspective) return;
  const pts = vanishing();
  if (!pts.length) return;
  const { doc } = store().get();
  const w = doc.width;
  const h = doc.height;
  const px = 1 / zoom;
  const colors = [cssVar('--sky', '#5ab8ff'), cssVar('--rose', '#ff6f91')];
  g.save();
  // The rays, inside the page only.
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.lineWidth = px;
  pts.forEach((vp, i) => {
    g.strokeStyle = colors[i % 2];
    g.globalAlpha = 0.4;
    g.beginPath();
    for (const t of rayTargets(w, h, RAYS)) {
      // From the point out past the page edge it aims at.
      const dx = t.x - vp.x;
      const dy = t.y - vp.y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = (w + h) * 4;
      g.moveTo(vp.x, vp.y);
      g.lineTo(vp.x + (dx / len) * reach, vp.y + (dy / len) * reach);
    }
    g.stroke();
  });
  g.restore();
  // The horizon, right across.
  g.lineWidth = 1.5 * px;
  g.strokeStyle = cssVar('--sunny', '#ffc94a');
  g.globalAlpha = 0.9;
  g.beginPath();
  const reach = (w + h) * 40;
  if (pts.length === 1) {
    g.moveTo(-reach, pts[0].y);
    g.lineTo(reach, pts[0].y);
  } else {
    const [a, b] = pts;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    g.moveTo(a.x - (dx / len) * reach, a.y - (dy / len) * reach);
    g.lineTo(a.x + (dx / len) * reach, a.y + (dy / len) * reach);
  }
  g.stroke();
  // The handles.
  pts.forEach((vp, i) => {
    g.globalAlpha = 1;
    g.fillStyle = colors[i % 2];
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2 * px;
    g.beginPath();
    g.arc(vp.x, vp.y, HANDLE_PX * px, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  });
  g.restore();
}

addStageOverlay((g, zoom) => {
  drawGrid(g, zoom);
  drawPerspective(g, zoom);
});

// ---------------------------------------------------------------- dragging vanishing points

function pointAt(p: Pt, zoom: number): number {
  if (!getViewSettings().perspective || getViewSettings().lockGuides) return -1;
  const pts = store().get().doc.perspective?.points ?? [];
  const r = (HANDLE_PX + 3) / zoom;
  return pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= r);
}

let grabZoom = 1;
addCanvasGrab({
  cursor: 'move',
  hit(p, zoom) {
    grabZoom = zoom;
    return !store().get().ui.playing && pointAt(p, zoom) >= 0;
  },
  down(p) {
    const index = pointAt(p, grabZoom);
    const points = store().get().doc.perspective?.points ?? [];
    dragging = index >= 0 ? { index, points } : null;
  },
  move(p, shift) {
    if (!dragging) return;
    const base = store().get().doc.perspective?.points ?? [];
    dragging = { index: dragging.index, points: moveVanishing(base, dragging.index, { x: Math.round(p.x), y: Math.round(p.y) }, shift) };
    requestOverlay();
  },
  up() {
    const d = dragging;
    dragging = null;
    if (!d) return;
    const before = store().get().doc.perspective?.points ?? [];
    if (d.points.every((q, i) => q.x === before[i]?.x && q.y === before[i]?.y)) return;
    store().update('Move vanishing point', (doc) => {
      doc.perspective = { points: d.points };
    });
  },
  cancel() {
    dragging = null;
    requestOverlay();
  },
});

// ---------------------------------------------------------------- commands

function setGrid(kind: 'off' | 'square' | 'iso'): void {
  const v = getViewSettings();
  setViewSettings({ grid: v.grid === kind ? 'off' : kind });
  nudge();
}

export function setPerspective(count: 0 | 1 | 2): void {
  const { doc } = store().get();
  if (count === 0) {
    if (!doc.perspective) return hint('There are no perspective guides to remove.');
    store().update('Remove perspective guides', (d) => void delete d.perspective);
    return;
  }
  const cur = doc.perspective?.points ?? [];
  if (cur.length === count) {
    setViewSettings({ perspective: true });
    return nudge();
  }
  // Going from one point to two keeps the horizon where it was.
  let points = defaultVanishing(count, doc.width, doc.height);
  if (cur.length) points = points.map((p) => ({ ...p, y: cur[0].y }));
  if (count === 1 && cur.length) points = [cur[0]];
  store().update(count === 1 ? 'One point perspective' : 'Two point perspective', (d) => {
    d.perspective = { points };
  });
  if (!getViewSettings().perspective) setViewSettings({ perspective: true });
  hint('Drag the round handles to move the vanishing points. Hold Shift to tilt the horizon.');
}

export function openGridSettings(): void {
  void import('./GridSettings').then((m) => m.openGridSettings());
}

registerCommands([
  {
    id: 'view.gridSquare',
    label: 'Square grid',
    category: 'View',
    keys: ["Mod+'"],
    description: 'Show a grid of squares over the page. Shapes snap to it while snapping is on.',
    help: 'grids-perspective',
    keywords: ['grid', 'squares', 'graph paper', 'layout', 'snap to grid'],
    checked: () => getViewSettings().grid === 'square',
    run: () => setGrid('square'),
  },
  {
    id: 'view.gridIso',
    label: 'Isometric grid',
    category: 'View',
    description: 'Show a grid of diamonds for drawing in isometric 3D (2:1 for pixel art, or 30 degrees). Points snap to its corners.',
    help: 'grids-perspective',
    keywords: ['isometric', 'iso', 'diamond grid', '2:1', 'pixel art', '3d', 'grid'],
    checked: () => getViewSettings().grid === 'iso',
    run: () => setGrid('iso'),
  },
  {
    id: 'view.gridSettings',
    label: 'Grid and perspective settings...',
    category: 'View',
    description: 'Pick the grid, its size in your units, the isometric slope, and the perspective guides.',
    help: 'grids-perspective',
    keywords: ['grid size', 'grid spacing', 'isometric', 'perspective', 'vanishing point', 'horizon'],
    run: () => openGridSettings(),
  },
  {
    id: 'view.perspective1',
    label: 'Perspective guides: one point',
    category: 'View',
    description: 'Lines that all meet at one vanishing point on the horizon, for looking straight down a road or a hallway.',
    help: 'grids-perspective',
    keywords: ['perspective', 'one point', '1 point', 'vanishing point', 'horizon', 'depth'],
    checked: (s) => s.doc.perspective?.points.length === 1 && getViewSettings().perspective,
    run: () => setPerspective(1),
  },
  {
    id: 'view.perspective2',
    label: 'Perspective guides: two point',
    category: 'View',
    description: 'Two vanishing points on the horizon, for boxes and buildings seen from a corner.',
    help: 'grids-perspective',
    keywords: ['perspective', 'two point', '2 point', 'vanishing points', 'horizon', 'buildings'],
    checked: (s) => s.doc.perspective?.points.length === 2 && getViewSettings().perspective,
    run: () => setPerspective(2),
  },
  {
    id: 'view.showPerspective',
    label: 'Show perspective guides',
    category: 'View',
    description: 'Show or hide the perspective guides without losing where the vanishing points are.',
    help: 'grids-perspective',
    keywords: ['perspective', 'hide perspective', 'show perspective'],
    enabled: (s) => !!s.doc.perspective,
    checked: () => getViewSettings().perspective,
    run: () => {
      setViewSettings({ perspective: !getViewSettings().perspective });
      nudge();
    },
  },
  {
    id: 'view.removePerspective',
    label: 'Remove perspective guides',
    category: 'View',
    description: 'Take the perspective guides off this drawing.',
    help: 'grids-perspective',
    keywords: ['perspective', 'remove', 'delete vanishing point'],
    enabled: (s) => !!s.doc.perspective,
    run: () => setPerspective(0),
  },
]);
